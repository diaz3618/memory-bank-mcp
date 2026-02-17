/**
 * Origin Validation Middleware Tests
 *
 * Verifies:
 * - Origin header rejection for disallowed origins
 * - Origin header acceptance for allowed origins
 * - Host header DNS rebinding protection
 * - Health endpoint skips validation
 * - Requests without Origin header pass (browser-only header)
 */

import { test, expect, describe } from 'bun:test';
import {
  buildOriginConfig,
  createOriginValidationMiddleware,
  type OriginValidationConfig,
} from '../../server/middleware/originValidation.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(headers: Record<string, string>, path = '/mcp') {
  return { headers, path } as any;
}

function mockRes() {
  let statusCode = 200;
  let body: any = null;
  return {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      body = data;
      return this;
    },
    get statusCode() { return statusCode; },
    get body() { return body; },
  } as any;
}

// ─── buildOriginConfig ──────────────────────────────────────────────────────

describe('buildOriginConfig', () => {
  test('localhost binding includes localhost origins by default', () => {
    const config = buildOriginConfig('127.0.0.1', 3100);
    expect(config.allowedOrigins).toContain('http://localhost:3100');
    expect(config.allowedOrigins).toContain('http://127.0.0.1:3100');
  });

  test('non-localhost binding has empty default origins (strict mode)', () => {
    const config = buildOriginConfig('0.0.0.0', 3100);
    expect(config.allowedOrigins).toHaveLength(0);
  });

  test('ALLOWED_ORIGINS env var overrides defaults', () => {
    const original = process.env.ALLOWED_ORIGINS;
    process.env.ALLOWED_ORIGINS = 'https://app.example.com,https://other.example.com';
    try {
      const config = buildOriginConfig('127.0.0.1', 3100);
      expect(config.allowedOrigins).toContain('https://app.example.com');
      expect(config.allowedOrigins).toContain('https://other.example.com');
      expect(config.allowedOrigins).not.toContain('http://localhost:3100');
    } finally {
      if (original !== undefined) process.env.ALLOWED_ORIGINS = original;
      else delete process.env.ALLOWED_ORIGINS;
    }
  });

  test('health and ready are in skipPaths', () => {
    const config = buildOriginConfig('127.0.0.1', 3100);
    expect(config.skipPaths).toContain('/health');
    expect(config.skipPaths).toContain('/ready');
  });
});

// ─── createOriginValidationMiddleware ───────────────────────────────────────

describe('Origin Validation Middleware', () => {
  const config: OriginValidationConfig = {
    allowedOrigins: ['http://localhost:3100', 'https://app.example.com'],
    allowedHosts: ['localhost:3100', '127.0.0.1:3100'],
    skipPaths: ['/health'],
  };

  const middleware = createOriginValidationMiddleware(config);

  test('allows request with no Origin header (non-browser client)', () => {
    const req = mockReq({ host: 'localhost:3100' });
    const res = mockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  test('allows request with valid Origin', () => {
    const req = mockReq({ origin: 'http://localhost:3100', host: 'localhost:3100' });
    const res = mockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  test('rejects request with disallowed Origin', () => {
    const req = mockReq({ origin: 'https://evil.com', host: 'localhost:3100' });
    const res = mockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Origin not allowed');
  });

  test('rejects request with disallowed Host header (DNS rebinding)', () => {
    const req = mockReq({ host: 'evil.com:3100' });
    const res = mockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Host not allowed');
  });

  test('skips validation for health endpoint', () => {
    const req = mockReq({ origin: 'https://evil.com', host: 'evil.com:3100' }, '/health');
    const res = mockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  test('allows second valid origin in allowedOrigins list', () => {
    const req = mockReq({ origin: 'https://app.example.com', host: 'localhost:3100' });
    const res = mockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
});

// ─── Strict mode (0.0.0.0 binding, no env, empty allowedOrigins) ───────────

describe('Origin Validation — strict mode (no configured origins)', () => {
  const config: OriginValidationConfig = {
    allowedOrigins: [],
    allowedHosts: ['0.0.0.0:3100'],
    skipPaths: ['/health'],
  };

  const middleware = createOriginValidationMiddleware(config);

  test('allows any Origin when allowedOrigins is empty (pass-through)', () => {
    // Empty allowedOrigins → no origin filtering (relies on auth middleware)
    const req = mockReq({ origin: 'https://any.com', host: '0.0.0.0:3100' });
    const res = mockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
});
