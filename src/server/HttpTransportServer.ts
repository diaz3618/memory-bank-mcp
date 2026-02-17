/**
 * HttpTransportServer — Express-based Streamable HTTP transport for MCP
 *
 * Provides an HTTP endpoint for the Memory Bank MCP server, supporting:
 *   - Streamable HTTP (SSE + JSON-RPC)
 *   - API key authentication
 *   - Redis-backed rate limiting
 *   - Per-session transport management
 *   - Postgres-backed EventStore for resumability
 *
 * This runs alongside (or instead of) the existing stdio transport.
 */

import { randomUUID } from 'crypto';
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  StreamableHTTPServerTransport,
  type EventStore,
  type EventId,
  type StreamId,
} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { DatabaseManager } from '../utils/DatabaseManager.js';
import type { RedisManager } from '../utils/RedisManager.js';
import { createApiKeyAuthMiddleware, type AuthenticatedRequest } from './middleware/apiKeyAuth.js';
import { createRateLimiterMiddleware } from './middleware/rateLimiter.js';
import { buildOriginConfig, createOriginValidationMiddleware } from './middleware/originValidation.js';
import { LogManager } from '../utils/LogManager.js';

const logger = LogManager.getInstance();

// =============================================================================
// Postgres-backed EventStore for SSE resumability
// =============================================================================

class PostgresEventStore implements EventStore {
  constructor(private readonly db: DatabaseManager) {}

  async storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO mcp_events (stream_id, message)
       VALUES ($1, $2::jsonb)
       RETURNING id::text`,
      [streamId, JSON.stringify(message)],
    );
    return result.rows[0]!.id;
  }

  async getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined> {
    const result = await this.db.query<{ stream_id: string }>(
      'SELECT stream_id FROM mcp_events WHERE id = $1',
      [eventId],
    );
    return result.rows[0]?.stream_id;
  }

  async replayEventsAfter(
    lastEventId: EventId,
    { send }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> },
  ): Promise<StreamId> {
    // Find the stream for this event
    const streamResult = await this.db.query<{ stream_id: string }>(
      'SELECT stream_id FROM mcp_events WHERE id = $1',
      [lastEventId],
    );
    const streamId = streamResult.rows[0]?.stream_id;
    if (!streamId) {
      throw new Error(`Event not found: ${lastEventId}`);
    }

    // Replay all events after the given event for the same stream
    const events = await this.db.query<{ id: string; message: object }>(
      `SELECT id::text, message FROM mcp_events
       WHERE stream_id = $1 AND id > $2
       ORDER BY id`,
      [streamId, lastEventId],
    );

    for (const event of events.rows) {
      await send(event.id, event.message as JSONRPCMessage);
    }

    return streamId;
  }
}

// =============================================================================
// In-memory EventStore (fallback when no DB)
// =============================================================================

class InMemoryEventStore implements EventStore {
  private events: Map<EventId, { streamId: StreamId; message: JSONRPCMessage }> = new Map();
  private streamEvents: Map<StreamId, EventId[]> = new Map();
  private counter = 0;

  async storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId> {
    const eventId = String(++this.counter);
    this.events.set(eventId, { streamId, message });
    const existing = this.streamEvents.get(streamId) ?? [];
    existing.push(eventId);
    this.streamEvents.set(streamId, existing);
    return eventId;
  }

  async getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined> {
    return this.events.get(eventId)?.streamId;
  }

  async replayEventsAfter(
    lastEventId: EventId,
    { send }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> },
  ): Promise<StreamId> {
    const entry = this.events.get(lastEventId);
    if (!entry) throw new Error(`Event not found: ${lastEventId}`);

    const streamEvents = this.streamEvents.get(entry.streamId) ?? [];
    const startIdx = streamEvents.indexOf(lastEventId);
    if (startIdx === -1) throw new Error(`Event not in stream: ${lastEventId}`);

    for (let i = startIdx + 1; i < streamEvents.length; i++) {
      const evt = this.events.get(streamEvents[i]!)!;
      await send(streamEvents[i]!, evt.message);
    }

    return entry.streamId;
  }
}

// =============================================================================
// HTTP Transport Server Configuration
// =============================================================================

export interface HttpTransportConfig {
  /** Listen port (default: 3100) */
  port: number;
  /** Bind host (default: 0.0.0.0 for Docker) */
  host: string;
  /** Enable JSON response mode instead of SSE */
  enableJsonResponse?: boolean;
  /** Rate limiter options */
  rateLimitOptions?: {
    defaultMaxRequests?: number;
    windowSeconds?: number;
    enableIpRateLimit?: boolean;
    ipMaxRequests?: number;
  };
}

// =============================================================================
// HTTP Transport Server
// =============================================================================

export class HttpTransportServer {
  private readonly app: express.Express;
  private readonly config: HttpTransportConfig;
  private readonly db: DatabaseManager;
  private readonly redis: RedisManager | null;
  private readonly eventStore: EventStore;
  private readonly transports: Map<string, StreamableHTTPServerTransport> = new Map();
  private httpServer: ReturnType<express.Express['listen']> | null = null;

  /**
   * Factory function to create the MCP server. Called once per session.
   * We take a factory so each session can have its own Server instance
   * with isolated state (RLS context, etc.).
   */
  private readonly createMcpServer: (
    userId: string,
    projectId: string,
  ) => Server;

  constructor(
    config: HttpTransportConfig,
    db: DatabaseManager,
    redis: RedisManager | null,
    createMcpServer: (userId: string, projectId: string) => Server,
  ) {
    this.config = config;
    this.db = db;
    this.redis = redis;
    this.createMcpServer = createMcpServer;

    // Use Postgres-backed EventStore if DB is available, else in-memory
    this.eventStore = new PostgresEventStore(db);

    // Build Express app
    this.app = express();

    // Trust Traefik / reverse proxy
    this.app.set('trust proxy', 1);

    // Body size limit (1 MB — MCP messages are small)
    this.app.use(express.json({ limit: '1mb' }));

    // Security headers
    this.app.use((_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '0');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Cache-Control', 'no-store');
      next();
    });

    this.setupMiddleware();
    this.setupRoutes();
  }

  // ---------------------------------------------------------------------------
  // Middleware pipeline
  // ---------------------------------------------------------------------------

  private setupMiddleware(): void {
    // Origin + Host header validation (DNS rebinding / cross-origin protection)
    const originConfig = buildOriginConfig(this.config.host, this.config.port);
    this.app.use(createOriginValidationMiddleware(originConfig));

    // Health check (unauthenticated, but origin-validated)
    this.app.get('/health', async (_req, res) => {
      const dbHealthy = await this.db.isHealthy();
      const redisHealthy = this.redis ? await this.redis.isHealthy() : true;
      const status = dbHealthy && redisHealthy ? 200 : 503;
      res.status(status).json({
        status: status === 200 ? 'ok' : 'degraded',
        db: dbHealthy ? 'ok' : 'error',
        redis: this.redis ? (redisHealthy ? 'ok' : 'error') : 'not configured',
        uptime: process.uptime(),
      });
    });

    // Auth + rate limiting on /mcp routes
    const authMiddleware = createApiKeyAuthMiddleware(this.db, this.redis);
    const rateLimitMiddleware = createRateLimiterMiddleware(this.redis, this.config.rateLimitOptions);

    this.app.use('/mcp', authMiddleware as any, rateLimitMiddleware as any);
  }

  // ---------------------------------------------------------------------------
  // MCP routes (POST = messages, GET = SSE stream, DELETE = close session)
  // ---------------------------------------------------------------------------

  private setupRoutes(): void {
    // POST /mcp — JSON-RPC messages
    this.app.post('/mcp', async (req: AuthenticatedRequest, res) => {
      try {
        const auth = req.auth;
        if (!auth) {
          res.status(401).json({ error: 'Not authenticated' });
          return;
        }

        // Check if there's an existing session
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transport: StreamableHTTPServerTransport;

        if (sessionId && this.transports.has(sessionId)) {
          // Reuse existing transport
          transport = this.transports.get(sessionId)!;
        } else if (!sessionId) {
          // New session — create transport + MCP server
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            eventStore: this.eventStore,
            enableJsonResponse: this.config.enableJsonResponse,
            onsessioninitialized: (sid) => {
              this.transports.set(sid, transport);
              logger.info('HttpTransport', `Session initialized: ${sid} for user ${auth.userId}`);

              // Cache session in Redis
              if (this.redis) {
                this.redis.setSession(sid, {
                  userId: auth.userId,
                  projectId: auth.projectId,
                  createdAt: new Date().toISOString(),
                  lastSeen: new Date().toISOString(),
                }).catch((err) => {
                  logger.warn('HttpTransport', `Failed to cache session: ${err.message}`);
                });
              }
            },
            onsessionclosed: (sid) => {
              this.transports.delete(sid);
              logger.info('HttpTransport', `Session closed: ${sid}`);

              if (this.redis) {
                this.redis.deleteSession(sid).catch(() => {});
              }
            },
          });

          // Create an MCP server for this session
          const mcpServer = this.createMcpServer(auth.userId, auth.projectId);
          await mcpServer.connect(transport);
        } else {
          // Session ID provided but not found
          res.status(404).json({ error: 'Session not found. Create a new session without Mcp-Session-Id header.' });
          return;
        }

        // Delegate to transport
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('HttpTransport', `POST /mcp error: ${message}`);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    });

    // GET /mcp — SSE stream for server-initiated messages
    this.app.get('/mcp', async (req: AuthenticatedRequest, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !this.transports.has(sessionId)) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const transport = this.transports.get(sessionId)!;

      // Touch session in Redis
      if (this.redis) {
        this.redis.touchSession(sessionId).catch(() => {});
      }

      await transport.handleRequest(req, res);
    });

    // DELETE /mcp — Close session
    this.app.delete('/mcp', async (req: AuthenticatedRequest, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !this.transports.has(sessionId)) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const transport = this.transports.get(sessionId)!;
      await transport.handleRequest(req, res);
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async start(): Promise<void> {
    const { port, host } = this.config;
    return new Promise((resolve) => {
      this.httpServer = this.app.listen(port, host, () => {
        logger.info('HttpTransport', `HTTP MCP server listening on ${host}:${port}`);
        resolve();
      });
    });
  }

  async shutdown(): Promise<void> {
    logger.info('HttpTransport', 'Shutting down HTTP transport...');

    // Close all active transports
    for (const [sid, transport] of this.transports) {
      try {
        await transport.close();
      } catch (err) {
        logger.warn('HttpTransport', `Error closing transport ${sid}: ${err}`);
      }
    }
    this.transports.clear();

    // Close HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.close((err) => (err ? reject(err) : resolve()));
      });
    }

    logger.info('HttpTransport', 'HTTP transport shutdown complete');
  }

  /** Number of active sessions */
  get activeSessions(): number {
    return this.transports.size;
  }

  /** Express app (for testing or additional middleware) */
  get expressApp(): express.Express {
    return this.app;
  }
}
