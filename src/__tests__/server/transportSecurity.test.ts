/**
 * Transport Security Tests
 *
 * Verifies HttpTransportServer security configuration:
 * 1. Trust proxy is enabled (for Traefik)
 * 2. Graceful instantiation with null Redis
 * 3. Session tracking starts empty
 */

import { test, expect, describe } from 'bun:test';
import { HttpTransportServer } from '../../server/HttpTransportServer.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

describe('Transport Security — HttpTransportServer', () => {
  const mockDb = {
    query: () => Promise.resolve({ rows: [], rowCount: 0 }),
    queryWithContext: () => Promise.resolve({ rows: [], rowCount: 0 }),
    isHealthy: () => Promise.resolve(true),
  } as any;

  function createServer() {
    return new HttpTransportServer(
      { port: 0, host: '127.0.0.1' },
      mockDb,
      null,
      () => new Server({ name: 'test', version: '0.0.1' }, { capabilities: {} }),
    );
  }

  test('Express app has trust proxy set to 1', () => {
    const server = createServer();
    expect(server.expressApp.get('trust proxy')).toBe(1);
  });

  test('HttpTransportServer can be instantiated with null Redis (graceful)', () => {
    const server = createServer();
    expect(server).toBeDefined();
    expect(server.activeSessions).toBe(0);
    expect(server.expressApp).toBeDefined();
  });

  test('activeSessions starts at 0', () => {
    const server = createServer();
    expect(server.activeSessions).toBe(0);
  });
});
