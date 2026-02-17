/**
 * RedisManager — Redis connection and helper methods
 *
 * Key naming convention:
 *   mbmcp:{env}:{namespace}:{identifier}
 *
 * Namespaces:
 *   session   — MCP session data
 *   apikey    — API key validation cache
 *   ratelimit — Rate limit counters
 *
 * All payloads are JSON-serialized with schema validation at boundaries.
 */

import Redis from 'ioredis';

type RedisClient = InstanceType<typeof Redis.default>;
import { LogManager } from './LogManager.js';

const logger = LogManager.getInstance();

export interface RedisConfig {
  /** Redis connection URL (e.g., redis://redis:6379) */
  url: string;
  /** Key prefix for environment isolation (default: 'mbmcp:prod') */
  keyPrefix?: string;
  /** Max reconnect retries (default: 10) */
  maxRetries?: number;
}

/** Cached API key data stored in Redis */
export interface CachedApiKey {
  userId: string;
  projectId: string;
  scopes: string[];
  rateLimit: number;
}

/** Session data stored in Redis */
export interface CachedSession {
  userId: string;
  projectId: string;
  createdAt: string;
  lastSeen: string;
}

/** Redis key TTL defaults in seconds */
export const REDIS_TTL = {
  SESSION: 86_400,       // 24 hours
  API_KEY: 300,          // 5 minutes
  RATE_LIMIT: 60,        // 1 minute sliding window
} as const;

// =============================================================================
// Payload validators — schema validation at read boundaries
// =============================================================================

function isValidCachedApiKey(data: unknown): data is CachedApiKey {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.userId === 'string' &&
    typeof d.projectId === 'string' &&
    Array.isArray(d.scopes) &&
    d.scopes.every((s: unknown) => typeof s === 'string') &&
    typeof d.rateLimit === 'number'
  );
}

function isValidCachedSession(data: unknown): data is CachedSession {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.userId === 'string' &&
    typeof d.projectId === 'string' &&
    typeof d.createdAt === 'string' &&
    typeof d.lastSeen === 'string'
  );
}

export class RedisManager {
  private client: RedisClient;
  private readonly prefix: string;

  constructor(config: RedisConfig) {
    this.prefix = config.keyPrefix ?? 'mbmcp:prod';
    this.client = new Redis.default(config.url, {
      maxRetriesPerRequest: config.maxRetries ?? 10,
      retryStrategy: (times: number) => {
        if (times > (config.maxRetries ?? 10)) return null;
        return Math.min(times * 200, 5000);
      },
      lazyConnect: true,
    });

    this.client.on('error', (err: Error) => {
      logger.error('RedisManager', `Redis error: ${err.message}`);
    });

    this.client.on('connect', () => {
      logger.info('RedisManager', 'Connected to Redis');
    });
  }

  /** Connect to Redis */
  async connect(): Promise<void> {
    await this.client.connect();
  }

  /** Build a namespaced key */
  private key(namespace: string, id: string): string {
    return `${this.prefix}:${namespace}:${id}`;
  }

  // ===========================================================================
  // Session cache
  // ===========================================================================

  async getSession(sessionId: string): Promise<CachedSession | null> {
    const data = await this.client.get(this.key('session', sessionId));
    if (!data) return null;
    try {
      const parsed: unknown = JSON.parse(data);
      if (!isValidCachedSession(parsed)) {
        logger.warn('RedisManager', `Invalid session payload for ${sessionId}, discarding`);
        await this.deleteSession(sessionId);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async setSession(sessionId: string, session: CachedSession): Promise<void> {
    await this.client.set(
      this.key('session', sessionId),
      JSON.stringify(session),
      'EX',
      REDIS_TTL.SESSION,
    );
  }

  async touchSession(sessionId: string): Promise<void> {
    const data = await this.getSession(sessionId);
    if (data) {
      data.lastSeen = new Date().toISOString();
      await this.setSession(sessionId, data);
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.client.del(this.key('session', sessionId));
  }

  // ===========================================================================
  // API key cache
  // ===========================================================================

  async getApiKey(keyHash: string): Promise<CachedApiKey | null> {
    const data = await this.client.get(this.key('apikey', keyHash));
    if (!data) return null;
    try {
      const parsed: unknown = JSON.parse(data);
      if (!isValidCachedApiKey(parsed)) {
        logger.warn('RedisManager', `Invalid API key payload for hash ${keyHash.slice(0, 8)}…, discarding`);
        await this.invalidateApiKey(keyHash);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async setApiKey(keyHash: string, keyData: CachedApiKey): Promise<void> {
    await this.client.set(
      this.key('apikey', keyHash),
      JSON.stringify(keyData),
      'EX',
      REDIS_TTL.API_KEY,
    );
  }

  async invalidateApiKey(keyHash: string): Promise<void> {
    await this.client.del(this.key('apikey', keyHash));
  }

  // ===========================================================================
  // Rate limiting (sliding window counter)
  // ===========================================================================

  /**
   * Check and increment rate limit counter.
   * Returns { allowed: boolean, remaining: number, resetIn: number }
   */
  async checkRateLimit(
    identifier: string,
    maxRequests: number,
    windowSeconds: number = REDIS_TTL.RATE_LIMIT,
  ): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
    const key = this.key('ratelimit', identifier);
    const multi = this.client.multi();

    multi.incr(key);
    multi.ttl(key);

    const results = await multi.exec();
    if (!results) {
      return { allowed: true, remaining: maxRequests, resetIn: windowSeconds };
    }

    const count = (results[0]?.[1] as number) ?? 1;
    const ttl = (results[1]?.[1] as number) ?? -1;

    // Set expiry on first request in window
    if (ttl === -1) {
      await this.client.expire(key, windowSeconds);
    }

    const remaining = Math.max(0, maxRequests - count);
    const resetIn = ttl > 0 ? ttl : windowSeconds;

    return {
      allowed: count <= maxRequests,
      remaining,
      resetIn,
    };
  }

  // ===========================================================================
  // Health + lifecycle
  // ===========================================================================

  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.client.quit();
    logger.info('RedisManager', 'Redis connection closed');
  }

  /** Get the underlying ioredis client (for advanced use) */
  getClient(): RedisClient {
    return this.client;
  }
}
