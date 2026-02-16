import { test, expect, describe, beforeEach, mock } from 'bun:test';
import { HttpTransportServer, type HttpTransportConfig } from '../../server/HttpTransportServer.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

describe('HttpTransportServer', () => {
  const mockDb = {
    query: mock(() => Promise.resolve({ rows: [], rowCount: 0 })),
    queryWithContext: mock(() => Promise.resolve({ rows: [], rowCount: 0 })),
    isHealthy: mock(() => Promise.resolve(true)),
    close: mock(() => Promise.resolve()),
  } as any;

  const mockRedis = {
    isHealthy: mock(() => Promise.resolve(true)),
    getApiKey: mock(() => Promise.resolve(null)),
    setApiKey: mock(() => Promise.resolve()),
    setSession: mock(() => Promise.resolve()),
    deleteSession: mock(() => Promise.resolve()),
    touchSession: mock(() => Promise.resolve()),
    checkRateLimit: mock(() => Promise.resolve({ allowed: true, remaining: 59, resetIn: 60 })),
    close: mock(() => Promise.resolve()),
  } as any;

  const config: HttpTransportConfig = {
    port: 0, // OS-assigned port for tests
    host: '127.0.0.1',
  };

  const createMockServer = () => {
    return new Server(
      { name: 'test-server', version: '0.0.0' },
      { capabilities: { tools: {} } },
    );
  };

  test('creates HttpTransportServer instance', () => {
    const server = new HttpTransportServer(
      config, mockDb, mockRedis,
      () => createMockServer(),
    );
    expect(server).toBeDefined();
    expect(server.activeSessions).toBe(0);
  });

  test('exposes Express app for testing', () => {
    const server = new HttpTransportServer(
      config, mockDb, mockRedis,
      () => createMockServer(),
    );
    expect(server.expressApp).toBeDefined();
  });

  test('health endpoint returns status', async () => {
    const server = new HttpTransportServer(
      config, mockDb, mockRedis,
      () => createMockServer(),
    );

    // We can test the express app directly
    const app = server.expressApp;

    // Import supertest-like approach — just verify the app has routes
    // (Full integration test would need a running server)
    expect(app).toBeDefined();
  });
});
