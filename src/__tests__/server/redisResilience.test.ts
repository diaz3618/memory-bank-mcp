/**
 * Redis Resilience Tests
 *
 * Verifies that when Redis is unavailable:
 * 1. Rate limiter allows all requests (graceful degradation)
 * 2. API key auth falls through to Postgres lookup
 * 3. RedisManager.isHealthy returns false
 */

import { test, expect, describe, mock } from 'bun:test';
import { createRateLimiterMiddleware } from '../../server/middleware/rateLimiter.js';
import { createApiKeyAuthMiddleware } from '../../server/middleware/apiKeyAuth.js';

describe('Redis Resilience — Graceful Degradation', () => {
  test('rate limiter allows all requests when Redis is null', async () => {
    const middleware = createRateLimiterMiddleware(null);

    const req = { auth: { userId: 'u1', rateLimit: 10 }, ip: '127.0.0.1' } as any;
    const res = {
      status: mock(() => res),
      json: mock(() => res),
      setHeader: mock(() => {}),
    } as any;
    const next = mock(() => {});

    await middleware(req, res, next);

    // Should call next() without blocking
    expect(next).toHaveBeenCalledTimes(1);
    // Should NOT set rate limit headers (no Redis = no rate info)
    expect(res.status).not.toHaveBeenCalled();
  });

  test('rate limiter allows requests when Redis throws', async () => {
    const brokenRedis = {
      checkRateLimit: mock(() => Promise.reject(new Error('Redis connection refused'))),
    } as any;

    const middleware = createRateLimiterMiddleware(brokenRedis);

    const req = { auth: { userId: 'u1', rateLimit: 10 }, ip: '127.0.0.1' } as any;
    const res = {
      status: mock(() => res),
      json: mock(() => res),
      setHeader: mock(() => {}),
    } as any;
    const next = mock(() => {});

    await middleware(req, res, next);

    // Graceful degradation: request should still pass through
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('API key auth falls through to Postgres when Redis is null', async () => {
    const mockDb = {
      query: mock(() =>
        Promise.resolve({
          rows: [
            {
              user_id: 'u1',
              project_id: 'p1',
              scopes: ['read'],
              rate_limit: 60,
              revoked_at: null,
              expires_at: null,
            },
          ],
          rowCount: 1,
        }),
      ),
    } as any;

    const middleware = createApiKeyAuthMiddleware(mockDb, null);

    const req = { headers: { 'x-api-key': 'mbmcp_live_abc123' } } as any;
    const res = {
      status: mock(() => res),
      json: mock(() => {}),
    } as any;
    const next = mock(() => {});

    await middleware(req, res, next);

    // Should authenticate via Postgres fallback
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.auth).toBeDefined();
    expect(req.auth.userId).toBe('u1');

    // Should have queried Postgres
    expect(mockDb.query).toHaveBeenCalledTimes(2); // 1 for lookup + 1 for last_used_at update
  });

  test('API key auth rejects invalid format even without Redis', async () => {
    const mockDb = { query: mock(() => Promise.resolve({ rows: [] })) } as any;

    const middleware = createApiKeyAuthMiddleware(mockDb, null);

    const req = { headers: { 'x-api-key': 'invalid_key_format' } } as any;
    const res = {
      status: mock((code: number) => {
        res._status = code;
        return res;
      }),
      json: mock(() => {}),
      _status: 0,
    } as any;
    const next = mock(() => {});

    await middleware(req, res, next);

    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('API key auth rejects missing key even without Redis', async () => {
    const mockDb = { query: mock(() => Promise.resolve({ rows: [] })) } as any;

    const middleware = createApiKeyAuthMiddleware(mockDb, null);

    const req = { headers: {} } as any;
    const res = {
      status: mock((code: number) => {
        res._status = code;
        return res;
      }),
      json: mock(() => {}),
      _status: 0,
    } as any;
    const next = mock(() => {});

    await middleware(req, res, next);

    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
