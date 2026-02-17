/**
 * Full-Text Search Query Behavior Tests
 *
 * Verifies that FTS queries via PostgresGraphStore use correct SQL patterns:
 *   - websearch_to_tsquery for safe query parsing
 *   - parameterized queries (no SQL injection)
 *   - proper result mapping
 */

import { test, expect, describe, beforeEach, mock } from 'bun:test';
import { PostgresGraphStore } from '../../core/graph/PostgresGraphStore.js';

describe('Full-Text Search — PostgresGraphStore', () => {
  const mockDb = {
    queryWithContext: mock(() => Promise.resolve({ rows: [], rowCount: 0 })),
  } as any;

  let store: PostgresGraphStore;

  beforeEach(() => {
    mockDb.queryWithContext.mockReset();
    store = new PostgresGraphStore(mockDb, 'proj-1', 'user-1');
  });

  // ── searchEntities ───────────────────────────────────────────────────────

  test('searchEntities uses websearch_to_tsquery with simple config', async () => {
    mockDb.queryWithContext.mockResolvedValueOnce({
      rows: [{
        id: 'e1', name: 'MemoryBankServer', entity_type: 'class',
        attrs: {}, created_at: '2026-01-01', updated_at: '2026-01-01',
      }],
      rowCount: 1,
    });

    const result = await store.searchEntities('MemoryBankServer');
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].name).toBe('MemoryBankServer');

    // Verify SQL uses websearch_to_tsquery
    const callArgs = mockDb.queryWithContext.mock.calls[0];
    const sql = callArgs[2] as string;
    expect(sql).toContain("websearch_to_tsquery('simple'");
    // Search term is parameterized ($2)
    expect(sql).toContain('$2');
    expect(callArgs[3]).toContain('MemoryBankServer');
  });

  test('searchEntities returns empty on no match', async () => {
    mockDb.queryWithContext.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await store.searchEntities('nonexistent');
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(0);
  });

  test('searchEntities limits to 50 results', async () => {
    mockDb.queryWithContext.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await store.searchEntities('test');
    const sql = mockDb.queryWithContext.mock.calls[0][2] as string;
    expect(sql).toContain('LIMIT 50');
  });

  // ── searchObservations ────────────────────────────────────────────────────

  test('searchObservations uses websearch_to_tsquery with english config', async () => {
    mockDb.queryWithContext.mockResolvedValueOnce({
      rows: [{
        id: 'o1', entity_id: 'e1', content: 'Migration completed successfully',
        source: { kind: 'tool', ref: 'test' }, created_at: '2026-01-01',
      }],
      rowCount: 1,
    });

    const result = await store.searchObservations('migration');
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].text).toBe('Migration completed successfully');

    const sql = mockDb.queryWithContext.mock.calls[0][2] as string;
    expect(sql).toContain("websearch_to_tsquery('english'");
    // Uses ts_rank for relevance ordering
    expect(sql).toContain('ts_rank');
    expect(sql).toContain('ORDER BY');
  });

  test('searchObservations scopes by project_id ($1) with query as $2', async () => {
    mockDb.queryWithContext.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await store.searchObservations('test query');
    const callArgs = mockDb.queryWithContext.mock.calls[0];
    expect(callArgs[0]).toBe('user-1');   // userId context
    expect(callArgs[1]).toBe('proj-1');   // projectId context
    expect(callArgs[3][0]).toBe('proj-1'); // $1 = project_id
    expect(callArgs[3][1]).toBe('test query'); // $2 = search query
  });

  // ── SQL injection prevention ──────────────────────────────────────────────

  test('SQL injection attempt in search is passed as parameter', async () => {
    mockDb.queryWithContext.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await store.searchEntities("'; DROP TABLE graph_entities; --");
    const callArgs = mockDb.queryWithContext.mock.calls[0];
    const sql = callArgs[2] as string;
    expect(sql).not.toContain('DROP TABLE');
    expect(callArgs[3][1]).toBe("'; DROP TABLE graph_entities; --");
  });

  test('search handles DB error gracefully', async () => {
    mockDb.queryWithContext.mockRejectedValueOnce(new Error('connection refused'));

    const result = await store.searchEntities('test');
    expect(result.success).toBe(false);
    expect(result.error).toContain('connection refused');
    expect(result.code).toBe('IO_ERROR');
  });
});
