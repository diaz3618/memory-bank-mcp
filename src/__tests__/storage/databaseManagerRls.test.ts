/**
 * DatabaseManager queryWithContext Tests
 *
 * Verifies that queryWithContext:
 * 1. Wraps queries in a transaction (BEGIN/COMMIT/ROLLBACK)
 * 2. Sets app.current_user_id and app.current_project_id via SET LOCAL
 * 3. Releases client after query
 * 4. Rolls back on error
 */

import { test, expect, describe, mock } from 'bun:test';
import { DatabaseManager } from '../../utils/DatabaseManager.js';

describe('DatabaseManager — queryWithContext RLS', () => {
  function createMockPool() {
    const queries: Array<{ text: string; params?: unknown[] }> = [];
    const mockClient = {
      query: mock((text: string, params?: unknown[]) => {
        queries.push({ text, params });
        if (text.startsWith('SELECT content')) {
          return Promise.resolve({ rows: [{ content: 'hello' }], rowCount: 1 });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }),
      release: mock(() => {}),
    };
    return { queries, mockClient };
  }

  test('queryWithContext wraps query in BEGIN/SET LOCAL/COMMIT', async () => {
    const { queries, mockClient } = createMockPool();

    // Create a DatabaseManager and override pool.connect
    const db = new DatabaseManager({
      provider: 'postgres',
      connectionString: 'postgresql://test:test@localhost/test',
    });

    // Override the pool's connect method
    (db as any).pool = {
      connect: () => Promise.resolve(mockClient),
      query: mock(() => Promise.resolve({ rows: [] })),
      end: mock(() => Promise.resolve()),
      on: mock(() => {}),
    };

    await db.queryWithContext('user-123', 'project-456', 'SELECT content FROM documents WHERE id = $1', ['doc-1']);

    // Verify transaction lifecycle
    expect(queries.length).toBeGreaterThanOrEqual(4);
    expect(queries[0]!.text).toBe('BEGIN');
    expect(queries[1]!.text).toContain('set_config');
    expect(queries[1]!.params).toEqual(['user-123', 'project-456']);
    expect(queries[2]!.text).toBe('SELECT content FROM documents WHERE id = $1');
    expect(queries[2]!.params).toEqual(['doc-1']);
    expect(queries[3]!.text).toBe('COMMIT');

    // Verify client was released
    expect(mockClient.release).toHaveBeenCalledTimes(1);

    await db.close();
  });

  test('queryWithContext rolls back on query error', async () => {
    const queries: Array<{ text: string }> = [];
    const mockClient = {
      query: mock((text: string) => {
        queries.push({ text });
        if (text.startsWith('SELECT bad')) {
          return Promise.reject(new Error('relation "bad" does not exist'));
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }),
      release: mock(() => {}),
    };

    const db = new DatabaseManager({
      provider: 'postgres',
      connectionString: 'postgresql://test:test@localhost/test',
    });
    (db as any).pool = {
      connect: () => Promise.resolve(mockClient),
      query: mock(() => Promise.resolve({ rows: [] })),
      end: mock(() => Promise.resolve()),
      on: mock(() => {}),
    };

    await expect(
      db.queryWithContext('user-1', 'proj-1', 'SELECT bad FROM missing', []),
    ).rejects.toThrow('relation "bad" does not exist');

    // Should have: BEGIN, SET LOCAL, query (fails), ROLLBACK
    const texts = queries.map((q) => q.text);
    expect(texts).toContain('BEGIN');
    expect(texts).toContain('ROLLBACK');
    expect(texts).not.toContain('COMMIT');

    // Client must still be released
    expect(mockClient.release).toHaveBeenCalledTimes(1);

    await db.close();
  });

  test('queryWithContext uses SET LOCAL (transaction-scoped, not session-scoped)', async () => {
    const { queries, mockClient } = createMockPool();

    const db = new DatabaseManager({
      provider: 'postgres',
      connectionString: 'postgresql://test:test@localhost/test',
    });
    (db as any).pool = {
      connect: () => Promise.resolve(mockClient),
      query: mock(() => Promise.resolve({ rows: [] })),
      end: mock(() => Promise.resolve()),
      on: mock(() => {}),
    };

    await db.queryWithContext('u', 'p', 'SELECT 1', []);

    // The set_config call must use the third parameter as true (local/transaction-scoped)
    const setConfigCall = queries.find((q) => q.text.includes('set_config'));
    expect(setConfigCall).toBeDefined();
    // The actual SQL uses set_config('app.current_user_id', $1, true) — the "true" param
    // makes it transaction-local, which is verified by the SQL text itself
    expect(setConfigCall!.text).toContain('true');

    await db.close();
  });
});
