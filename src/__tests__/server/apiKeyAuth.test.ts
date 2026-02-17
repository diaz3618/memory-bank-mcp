import { test, expect, describe, beforeEach, mock } from 'bun:test';
import { createApiKeyAuthMiddleware, generateApiKey } from '../../server/middleware/apiKeyAuth.js';
import { createHash } from 'crypto';

// ===========================================================================
// API Key Generation Tests
// ===========================================================================

describe('generateApiKey', () => {
  test('generates key with correct prefix for live environment', () => {
    const { plaintext, hash, prefix } = generateApiKey('live');
    
    expect(plaintext).toMatch(/^mbmcp_live_/);
    expect(prefix).toEqual(plaintext.slice(0, 16));
    expect(hash).toBeInstanceOf(Buffer);
    expect(hash.length).toBe(32); // SHA-256 = 32 bytes
  });

  test('generates key with correct prefix for test environment', () => {
    const { plaintext } = generateApiKey('test');
    
    expect(plaintext).toMatch(/^mbmcp_test_/);
  });

  test('hash matches SHA-256 of plaintext', () => {
    const { plaintext, hash } = generateApiKey('live');
    
    const expectedHash = createHash('sha256').update(plaintext).digest('hex');
    expect(hash.toString('hex')).toEqual(expectedHash);
  });

  test('generates unique keys each time', () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();
    
    expect(key1.plaintext).not.toEqual(key2.plaintext);
    expect(key1.hash.toString('hex')).not.toEqual(key2.hash.toString('hex'));
  });
});

// ===========================================================================
// API Key Auth Middleware Tests
// ===========================================================================

describe('createApiKeyAuthMiddleware', () => {
  const mockDb = {
    query: mock(() => Promise.resolve({ rows: [], rowCount: 0 })),
    queryWithContext: mock(() => Promise.resolve({ rows: [], rowCount: 0 })),
    isHealthy: mock(() => Promise.resolve(true)),
    close: mock(() => Promise.resolve()),
  } as any;

  const mockRedis = {
    getApiKey: mock(() => Promise.resolve(null)),
    setApiKey: mock(() => Promise.resolve()),
  } as any;

  beforeEach(() => {
    mockDb.query.mockReset();
    mockRedis.getApiKey.mockReset();
    mockRedis.setApiKey.mockReset();
  });

  test('returns 401 when X-API-Key header is missing', async () => {
    const middleware = createApiKeyAuthMiddleware(mockDb, null);
    const req = { headers: {} } as any;
    const res = {
      status: mock(function(this: any) { return this; }),
      json: mock(() => {}),
    } as any;
    const next = mock(() => {});

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing X-API-Key header' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 for invalid key format', async () => {
    const middleware = createApiKeyAuthMiddleware(mockDb, null);
    const req = { headers: { 'x-api-key': 'invalid_key' } } as any;
    const res = {
      status: mock(function(this: any) { return this; }),
      json: mock(() => {}),
    } as any;
    const next = mock(() => {});

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid API key format' });
  });

  test('returns 401 when key not found in database', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    
    const middleware = createApiKeyAuthMiddleware(mockDb, null);
    const req = { headers: { 'x-api-key': 'mbmcp_live_testkey123456789012345678901' } } as any;
    const res = {
      status: mock(function(this: any) { return this; }),
      json: mock(() => {}),
    } as any;
    const next = mock(() => {});

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid API key' });
  });

  test('uses Redis cache when available', async () => {
    const cachedKey = {
      userId: 'user-1',
      projectId: 'proj-1',
      scopes: ['read', 'write'],
      rateLimit: 100,
    };
    mockRedis.getApiKey.mockResolvedValueOnce(cachedKey);

    const middleware = createApiKeyAuthMiddleware(mockDb, mockRedis);
    const req = { headers: { 'x-api-key': 'mbmcp_live_testkey123456789012345678901' } } as any;
    const res = {} as any;
    const next = mock(() => {});

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.auth).toEqual({
      ...cachedKey,
      token: 'mbmcp_live_testkey123456789012345678901',
      clientId: cachedKey.userId,
    });
    // Should not have queried the database
    expect(mockDb.query).not.toHaveBeenCalled();
  });
});
