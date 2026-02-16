import { test, expect, describe, beforeEach, mock } from 'bun:test';
import { createRateLimiterMiddleware } from '../../server/middleware/rateLimiter.js';

describe('createRateLimiterMiddleware', () => {
  const mockRedis = {
    checkRateLimit: mock(() => Promise.resolve({ allowed: true, remaining: 59, resetIn: 60 })),
  } as any;

  beforeEach(() => {
    mockRedis.checkRateLimit.mockReset();
    mockRedis.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 59, resetIn: 60 });
  });

  test('allows request when under rate limit', async () => {
    const middleware = createRateLimiterMiddleware(mockRedis);
    const req = {
      auth: { userId: 'user-1', rateLimit: 60 },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as any;
    const res = {
      setHeader: mock(() => {}),
      status: mock(function(this: any) { return this; }),
      json: mock(() => {}),
    } as any;
    const next = mock(() => {});

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 60);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 59);
  });

  test('returns 429 when rate limit exceeded', async () => {
    mockRedis.checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetIn: 42 });

    const middleware = createRateLimiterMiddleware(mockRedis);
    const req = {
      auth: { userId: 'user-1', rateLimit: 60 },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as any;
    const res = {
      setHeader: mock(() => {}),
      status: mock(function(this: any) { return this; }),
      json: mock(() => {}),
    } as any;
    const next = mock(() => {});

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: 'Rate limit exceeded', retryAfter: 42 });
  });

  test('skips rate limiting when Redis is null (graceful degradation)', async () => {
    const middleware = createRateLimiterMiddleware(null);
    const req = { auth: { userId: 'user-1' } } as any;
    const res = {} as any;
    const next = mock(() => {});

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('allows request on Redis error (graceful degradation)', async () => {
    mockRedis.checkRateLimit.mockRejectedValueOnce(new Error('Redis connection failed'));

    const middleware = createRateLimiterMiddleware(mockRedis);
    const req = {
      auth: { userId: 'user-1', rateLimit: 60 },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as any;
    const res = {
      setHeader: mock(() => {}),
    } as any;
    const next = mock(() => {});

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('rate limits by IP when enabled', async () => {
    // First call (user): allowed
    mockRedis.checkRateLimit
      .mockResolvedValueOnce({ allowed: true, remaining: 59, resetIn: 60 })
      // Second call (IP): denied
      .mockResolvedValueOnce({ allowed: false, remaining: 0, resetIn: 30 });

    const middleware = createRateLimiterMiddleware(mockRedis, { enableIpRateLimit: true });
    const req = {
      auth: { userId: 'user-1', rateLimit: 60 },
      ip: '10.0.0.1',
      socket: { remoteAddress: '10.0.0.1' },
    } as any;
    const res = {
      setHeader: mock(() => {}),
      status: mock(function(this: any) { return this; }),
      json: mock(() => {}),
    } as any;
    const next = mock(() => {});

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
  });
});
