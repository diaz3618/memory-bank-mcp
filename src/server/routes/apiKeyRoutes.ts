/**
 * API Key Management Routes
 *
 * REST endpoints for creating, listing, and revoking API keys.
 * All routes require authentication via an existing API key with 'owner' role.
 *
 * Routes:
 *   POST   /api/keys       — Create a new API key
 *   GET    /api/keys       — List API keys for the authenticated user/project
 *   DELETE /api/keys/:id   — Revoke an API key
 */

import { Router, type Request, type Response } from 'express';
import type { DatabaseManager } from '../../utils/DatabaseManager.js';
import type { RedisManager } from '../../utils/RedisManager.js';
import { generateApiKey, type AuthenticatedRequest } from '../middleware/apiKeyAuth.js';
import { LogManager } from '../../utils/LogManager.js';

const logger = LogManager.getInstance();

interface CreateKeyBody {
  label?: string;
  scopes?: string[];
  rateLimit?: number;
  expiresInDays?: number;
  environment?: 'live' | 'test';
}

interface ApiKeyRow {
  id: string;
  key_prefix: string;
  label: string | null;
  scopes: string[];
  rate_limit: number;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

/**
 * Create API key management router.
 */
export function createApiKeyRoutes(
  db: DatabaseManager,
  redis: RedisManager | null,
): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // POST /api/keys — Create a new API key
  // -------------------------------------------------------------------------
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const auth = (req as AuthenticatedRequest).auth;
      if (!auth) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      // Verify the user is an owner of the project
      const roleCheck = await db.query<{ has_role: boolean }>(
        `SELECT EXISTS (
          SELECT 1 FROM memberships
          WHERE user_id = $1
            AND project_id = $2
            AND role = 'owner'
        ) AS has_role`,
        [auth.userId, auth.projectId],
      );

      if (!roleCheck.rows[0]?.has_role) {
        res.status(403).json({ error: 'Only project owners can create API keys' });
        return;
      }

      const body = req.body as CreateKeyBody;
      const environment = body.environment ?? 'live';
      const { plaintext, hash, prefix } = generateApiKey(environment);

      // Calculate expiry
      let expiresAt: Date | null = null;
      if (body.expiresInDays && body.expiresInDays > 0) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + body.expiresInDays);
      }

      const result = await db.query<{ id: string; created_at: string }>(
        `INSERT INTO api_keys (user_id, project_id, key_hash, key_prefix, label, scopes, rate_limit, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, created_at`,
        [
          auth.userId,
          auth.projectId,
          hash,
          prefix,
          body.label ?? null,
          body.scopes ?? [],
          body.rateLimit ?? 60,
          expiresAt,
        ],
      );

      const row = result.rows[0]!;

      logger.info('ApiKeyRoutes', `API key created: ${prefix}... for user ${auth.userId}`);

      // Return the plaintext key — this is the ONLY time it's visible
      res.status(201).json({
        id: row.id,
        key: plaintext,
        prefix,
        label: body.label ?? null,
        scopes: body.scopes ?? [],
        rateLimit: body.rateLimit ?? 60,
        expiresAt: expiresAt?.toISOString() ?? null,
        createdAt: row.created_at,
        warning: 'Save this key now — it will not be shown again.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('ApiKeyRoutes', `Create key error: ${message}`);
      res.status(500).json({ error: 'Failed to create API key' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/keys — List API keys for the user/project
  // -------------------------------------------------------------------------
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const auth = (req as AuthenticatedRequest).auth;
      if (!auth) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const includeRevoked = (req.query as Record<string, string>).includeRevoked === 'true';

      let whereClause = 'WHERE user_id = $1 AND project_id = $2';
      if (!includeRevoked) {
        whereClause += ' AND revoked_at IS NULL';
      }

      const result = await db.query<ApiKeyRow>(
        `SELECT id, key_prefix, label, scopes, rate_limit, last_used_at,
                expires_at, created_at, revoked_at
         FROM api_keys
         ${whereClause}
         ORDER BY created_at DESC`,
        [auth.userId, auth.projectId],
      );

      const keys = result.rows.map((row) => ({
        id: row.id,
        prefix: row.key_prefix,
        label: row.label,
        scopes: row.scopes,
        rateLimit: row.rate_limit,
        lastUsedAt: row.last_used_at,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        revokedAt: row.revoked_at,
        status: row.revoked_at
          ? 'revoked'
          : row.expires_at && new Date(row.expires_at) < new Date()
            ? 'expired'
            : 'active',
      }));

      res.json({ keys, total: keys.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('ApiKeyRoutes', `List keys error: ${message}`);
      res.status(500).json({ error: 'Failed to list API keys' });
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /api/keys/:id — Revoke an API key (soft delete)
  // -------------------------------------------------------------------------
  router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const auth = (req as AuthenticatedRequest).auth;
      if (!auth) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const keyId = req.params.id;

      // Only allow revoking own keys
      const result = await db.query<{ key_hash: string }>(
        `UPDATE api_keys
         SET revoked_at = now()
         WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
         RETURNING encode(key_hash, 'hex') AS key_hash`,
        [keyId, auth.userId],
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'API key not found or already revoked' });
        return;
      }

      // Invalidate Redis cache for this key
      if (redis && result.rows[0]) {
        await redis.invalidateApiKey(result.rows[0].key_hash).catch(() => {});
      }

      logger.info('ApiKeyRoutes', `API key revoked: ${keyId} by user ${auth.userId}`);

      res.json({ message: 'API key revoked', id: keyId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('ApiKeyRoutes', `Revoke key error: ${message}`);
      res.status(500).json({ error: 'Failed to revoke API key' });
    }
  });

  return router;
}
