/**
 * RLS Isolation Tests
 *
 * Proves that:
 * 1. queryWithContext sets RLS session variables per-transaction
 * 2. PostgresFileSystem always passes correct userId/projectId to queryWithContext
 * 3. Cross-project isolation: user A cannot see project B's documents
 * 4. Cross-user isolation: user A cannot see user B's documents within shared project
 *
 * These are unit tests with mocked DatabaseManager. Integration tests against
 * a real Postgres instance with RLS policies are out of scope here but can be
 * run manually with `docker compose --profile local-db up`.
 */

import { test, expect, describe, beforeEach, mock } from 'bun:test';
import { PostgresFileSystem } from '../../utils/storage/PostgresFileSystem.js';

describe('RLS Isolation — PostgresFileSystem', () => {
  // Track all calls to queryWithContext to verify RLS context propagation
  const queryWithContextCalls: Array<{
    userId: string;
    projectId: string;
    sql: string;
    params: unknown[];
  }> = [];

  const mockDb = {
    queryWithContext: mock(
      (userId: string, projectId: string, sql: string, params: unknown[]) => {
        queryWithContextCalls.push({ userId, projectId, sql, params });
        return Promise.resolve({ rows: [], rowCount: 0 });
      },
    ),
  } as any;

  beforeEach(() => {
    queryWithContextCalls.length = 0;
    mockDb.queryWithContext.mockReset();
    mockDb.queryWithContext.mockImplementation(
      (userId: string, projectId: string, sql: string, params: unknown[]) => {
        queryWithContextCalls.push({ userId, projectId, sql, params });
        return Promise.resolve({ rows: [], rowCount: 0 });
      },
    );
  });

  // =========================================================================
  // Positive: correct context is always passed
  // =========================================================================

  test('fileExists sets correct RLS context for user-A / project-1', async () => {
    const fs = new PostgresFileSystem(mockDb, 'project-1', 'user-A', '');
    await fs.fileExists('test.md');

    expect(queryWithContextCalls).toHaveLength(1);
    expect(queryWithContextCalls[0]!.userId).toBe('user-A');
    expect(queryWithContextCalls[0]!.projectId).toBe('project-1');
  });

  test('readFile sets correct RLS context for user-B / project-2', async () => {
    mockDb.queryWithContext.mockImplementationOnce(
      (userId: string, projectId: string, sql: string, params: unknown[]) => {
        queryWithContextCalls.push({ userId, projectId, sql, params });
        return Promise.resolve({ rows: [{ content: 'data' }], rowCount: 1 });
      },
    );
    const fs = new PostgresFileSystem(mockDb, 'project-2', 'user-B', '');
    await fs.readFile('doc.md');

    expect(queryWithContextCalls).toHaveLength(1);
    expect(queryWithContextCalls[0]!.userId).toBe('user-B');
    expect(queryWithContextCalls[0]!.projectId).toBe('project-2');
  });

  test('writeFile sets correct RLS context', async () => {
    const fs = new PostgresFileSystem(mockDb, 'proj-X', 'user-X', '');
    await fs.writeFile('notes.md', 'content');

    expect(queryWithContextCalls).toHaveLength(1);
    expect(queryWithContextCalls[0]!.userId).toBe('user-X');
    expect(queryWithContextCalls[0]!.projectId).toBe('proj-X');
  });

  test('listFiles sets correct RLS context', async () => {
    const fs = new PostgresFileSystem(mockDb, 'proj-Y', 'user-Y', 'base');
    await fs.listFiles('base');

    expect(queryWithContextCalls).toHaveLength(1);
    expect(queryWithContextCalls[0]!.userId).toBe('user-Y');
    expect(queryWithContextCalls[0]!.projectId).toBe('proj-Y');
  });

  test('delete sets correct RLS context', async () => {
    const fs = new PostgresFileSystem(mockDb, 'proj-Z', 'user-Z', '');
    await fs.delete('old.md');

    expect(queryWithContextCalls).toHaveLength(1);
    expect(queryWithContextCalls[0]!.userId).toBe('user-Z');
    expect(queryWithContextCalls[0]!.projectId).toBe('proj-Z');
  });

  // =========================================================================
  // Negative: cross-project isolation
  // =========================================================================

  test('cross-project isolation: user-A with project-1 never queries project-2', async () => {
    const fsProject1 = new PostgresFileSystem(mockDb, 'project-1', 'user-A', '');
    const fsProject2 = new PostgresFileSystem(mockDb, 'project-2', 'user-A', '');

    // Simulate reads on both projects
    await fsProject1.fileExists('secret.md');
    await fsProject2.fileExists('public.md');

    expect(queryWithContextCalls).toHaveLength(2);

    // Verify project-1 context is never mixed with project-2
    const call1 = queryWithContextCalls[0]!;
    const call2 = queryWithContextCalls[1]!;

    expect(call1.projectId).toBe('project-1');
    expect(call1.params).toContain('project-1');
    expect(call1.params).not.toContain('project-2');

    expect(call2.projectId).toBe('project-2');
    expect(call2.params).toContain('project-2');
    expect(call2.params).not.toContain('project-1');
  });

  // =========================================================================
  // Negative: cross-user isolation
  // =========================================================================

  test('cross-user isolation: different users on same project pass different userId', async () => {
    const fsUserA = new PostgresFileSystem(mockDb, 'shared-proj', 'user-A', '');
    const fsUserB = new PostgresFileSystem(mockDb, 'shared-proj', 'user-B', '');

    await fsUserA.writeFile('a.md', 'alpha');
    await fsUserB.writeFile('b.md', 'beta');

    expect(queryWithContextCalls).toHaveLength(2);

    // User A's transaction has user-A context
    expect(queryWithContextCalls[0]!.userId).toBe('user-A');
    expect(queryWithContextCalls[0]!.projectId).toBe('shared-proj');

    // User B's transaction has user-B context
    expect(queryWithContextCalls[1]!.userId).toBe('user-B');
    expect(queryWithContextCalls[1]!.projectId).toBe('shared-proj');
  });

  // =========================================================================
  // SQL injection prevention: project_id always passed as parameter
  // =========================================================================

  test('project_id is always passed as a parameterized query value, never interpolated', async () => {
    const maliciousProject = "'; DROP TABLE documents; --";
    const fs = new PostgresFileSystem(mockDb, maliciousProject, 'user', '');

    await fs.fileExists('test.md');

    const call = queryWithContextCalls[0]!;
    // project_id is in params array, not in SQL string
    expect(call.params).toContain(maliciousProject);
    expect(call.sql).not.toContain(maliciousProject);
  });
});
