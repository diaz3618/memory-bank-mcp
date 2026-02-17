/**
 * API Key Authentication Middleware
 *
 * Validates X-API-Key header against the api_keys table via Redis cache → Postgres fallback.
 * Attaches authenticated context (userId, projectId) to the request.
 *
 * API key format: mbmcp_<env>_<random_32_bytes_base62>
 * Storage: SHA-256 hash only (never plaintext)
 */

import { createHash } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { DatabaseManager } from '../../utils/DatabaseManager.js';
import type { RedisManager, CachedApiKey } from '../../utils/RedisManager.js';
import { LogManager } from '../../utils/LogManager.js';

const logger = LogManager.getInstance();

/** Extended request with authenticated context */
export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    projectId: string;
    scopes: string[];
    rateLimit: number;
    token: string;
    clientId: string;
  };
}

/** Hash an API key with SHA-256 */
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Create API key authentication middleware.
 *
 * Checks X-API-Key header → SHA-256 hash → Redis cache → Postgres lookup.
 */
export function createApiKeyAuthMiddleware(
  db: DatabaseManager,
  redis: RedisManager | null,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const apiKey = req.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      res.status(401).json({ error: 'Missing X-API-Key header' });
      return;
    }

    // Validate key format
    if (!apiKey.startsWith('mbmcp_')) {
      res.status(401).json({ error: 'Invalid API key format' });
      return;
    }

    const keyHash = hashApiKey(apiKey);

    try {
      // 1. Check Redis cache first
      if (redis) {
        const cached = await redis.getApiKey(keyHash);
        if (cached) {
          authReq.auth = {
            userId: cached.userId,
            projectId: cached.projectId,
            scopes: cached.scopes,
            rateLimit: cached.rateLimit,
            token: apiKey,
            clientId: cached.userId,
          };
          next();
          return;
        }
      }

      // 2. Query Postgres
      const result = await db.query<{
        user_id: string;
        project_id: string;
        scopes: string[];
        rate_limit: number;
        revoked_at: string | null;
        expires_at: string | null;
      }>(
        `SELECT user_id, project_id, scopes, rate_limit, revoked_at, expires_at
         FROM api_keys
         WHERE key_hash = $1`,
        [Buffer.from(keyHash, 'hex')],
      );

      const row = result.rows[0];
      if (!row) {
        res.status(401).json({ error: 'Invalid API key' });
        return;
      }

      // Check revocation
      if (row.revoked_at) {
        res.status(401).json({ error: 'API key has been revoked' });
        return;
      }

      // Check expiry
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        res.status(401).json({ error: 'API key has expired' });
        return;
      }

      // Build auth context
      const authContext: CachedApiKey = {
        userId: row.user_id,
        projectId: row.project_id,
        scopes: row.scopes,
        rateLimit: row.rate_limit,
      };

      // Cache in Redis
      if (redis) {
        await redis.setApiKey(keyHash, authContext).catch((err) => {
          logger.warn('ApiKeyAuth', `Failed to cache API key: ${err.message}`);
        });
      }

      // Update last_used_at (fire and forget)
      db.query('UPDATE api_keys SET last_used_at = now() WHERE key_hash = $1', [
        Buffer.from(keyHash, 'hex'),
      ]).catch((err) => {
        logger.warn('ApiKeyAuth', `Failed to update last_used_at: ${err.message}`);
      });

      authReq.auth = {
        userId: authContext.userId,
        projectId: authContext.projectId,
        scopes: authContext.scopes,
        rateLimit: authContext.rateLimit,
        token: apiKey,
        clientId: authContext.userId,
      };

      next();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('ApiKeyAuth', `Authentication error: ${message}`);
      res.status(500).json({ error: 'Internal authentication error' });
    }
  };
}

/**
 * Generate a new API key.
 * Returns the plaintext key (show to user once) and the hash (for storage).
 */
export function generateApiKey(environment: 'live' | 'test' = 'live'): {
  plaintext: string;
  hash: Buffer;
  prefix: string;
} {
  const randomBytes = require('crypto').randomBytes(32);
  // Base62 encoding
  const base62Chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let random = '';
  for (const byte of randomBytes) {
    random += base62Chars[byte % 62];
  }

  const plaintext = `mbmcp_${environment}_${random}`;
  const prefix = plaintext.slice(0, 16);
  const hash = Buffer.from(hashApiKey(plaintext), 'hex');

  return { plaintext, hash, prefix };
}
