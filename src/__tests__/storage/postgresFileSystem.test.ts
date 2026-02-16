import { test, expect, describe, beforeEach, mock } from 'bun:test';
import { PostgresFileSystem } from '../../utils/storage/PostgresFileSystem.js';

describe('PostgresFileSystem', () => {
  const mockDb = {
    queryWithContext: mock(() => Promise.resolve({ rows: [], rowCount: 0 })),
  } as any;

  let fs: PostgresFileSystem;

  beforeEach(() => {
    mockDb.queryWithContext.mockReset();
    fs = new PostgresFileSystem(mockDb, 'proj-1', 'user-1', '');
  });

  test('getBaseDir returns configured base dir', () => {
    const fs2 = new PostgresFileSystem(mockDb, 'proj-1', 'user-1', 'memory-bank');
    expect(fs2.getBaseDir()).toBe('memory-bank');
  });

  test('fileExists returns true when document exists', async () => {
    mockDb.queryWithContext.mockResolvedValueOnce({ rows: [{ '1': 1 }], rowCount: 1 });
    
    const result = await fs.fileExists('test.md');
    expect(result).toBe(true);
    expect(mockDb.queryWithContext).toHaveBeenCalledWith(
      'user-1', 'proj-1',
      expect.stringContaining('SELECT 1 FROM documents'),
      ['proj-1', 'test.md'],
    );
  });

  test('fileExists returns false when document does not exist', async () => {
    mockDb.queryWithContext.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    
    const result = await fs.fileExists('nonexistent.md');
    expect(result).toBe(false);
  });

  test('readFile returns content from database', async () => {
    mockDb.queryWithContext.mockResolvedValueOnce({
      rows: [{ content: '# Hello World' }],
      rowCount: 1,
    });
    
    const content = await fs.readFile('test.md');
    expect(content).toBe('# Hello World');
  });

  test('readFile throws when file not found', async () => {
    mockDb.queryWithContext.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    
    expect(fs.readFile('missing.md')).rejects.toThrow('File not found');
  });

  test('writeFile performs upsert', async () => {
    mockDb.queryWithContext.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    
    await fs.writeFile('test.md', '# Content');
    
    expect(mockDb.queryWithContext).toHaveBeenCalledWith(
      'user-1', 'proj-1',
      expect.stringContaining('INSERT INTO documents'),
      ['proj-1', 'test.md', '# Content'],
    );
  });

  test('appendFile updates existing document', async () => {
    // First call: update succeeds
    mockDb.queryWithContext.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    
    await fs.appendFile('test.md', '\nMore content');
    
    expect(mockDb.queryWithContext).toHaveBeenCalledWith(
      'user-1', 'proj-1',
      expect.stringContaining('UPDATE documents'),
      ['proj-1', 'test.md', '\nMore content'],
    );
  });

  test('appendFile creates file when it does not exist', async () => {
    // First call: update finds no rows
    mockDb.queryWithContext.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // Second call: insert
    mockDb.queryWithContext.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    
    await fs.appendFile('new.md', 'New content');
    
    expect(mockDb.queryWithContext).toHaveBeenCalledTimes(2);
  });

  test('listFiles returns immediate children', async () => {
    mockDb.queryWithContext.mockResolvedValueOnce({
      rows: [
        { path: 'memory-bank/active-context.md' },
        { path: 'memory-bank/progress.md' },
        { path: 'memory-bank/docs/test.md' },
      ],
      rowCount: 3,
    });
    
    const fs2 = new PostgresFileSystem(mockDb, 'proj-1', 'user-1', '');
    const files = await fs2.listFiles('memory-bank');
    
    // Should return immediate children (files + directory entries)
    expect(files).toContain('active-context.md');
    expect(files).toContain('progress.md');
    expect(files).toContain('docs/');
  });

  test('isDirectory returns true when prefix has children', async () => {
    mockDb.queryWithContext.mockResolvedValueOnce({ rows: [{}], rowCount: 1 });
    
    const result = await fs.isDirectory('memory-bank');
    expect(result).toBe(true);
  });

  test('isDirectory returns false when no children', async () => {
    mockDb.queryWithContext.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    
    const result = await fs.isDirectory('nonexistent-dir');
    expect(result).toBe(false);
  });

  test('delete removes document and children', async () => {
    mockDb.queryWithContext.mockResolvedValueOnce({ rows: [], rowCount: 2 });
    
    await fs.delete('memory-bank');
    
    expect(mockDb.queryWithContext).toHaveBeenCalledWith(
      'user-1', 'proj-1',
      expect.stringContaining('DELETE FROM documents'),
      expect.arrayContaining(['proj-1', 'memory-bank']),
    );
  });

  test('ensureDirectory is a no-op', async () => {
    // Should not throw and should not call DB
    await fs.ensureDirectory('some/dir');
    expect(mockDb.queryWithContext).not.toHaveBeenCalled();
  });

  test('copy reads source and writes to destination', async () => {
    // readFile
    mockDb.queryWithContext.mockResolvedValueOnce({
      rows: [{ content: '# Source' }], rowCount: 1,
    });
    // writeFile
    mockDb.queryWithContext.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    
    await fs.copy('source.md', 'dest.md');
    
    expect(mockDb.queryWithContext).toHaveBeenCalledTimes(2);
  });

  test('resolves paths with baseDir', async () => {
    const fsWithBase = new PostgresFileSystem(mockDb, 'proj-1', 'user-1', 'memory-bank');
    mockDb.queryWithContext.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    
    await fsWithBase.fileExists('test.md');
    
    expect(mockDb.queryWithContext).toHaveBeenCalledWith(
      'user-1', 'proj-1',
      expect.any(String),
      ['proj-1', 'memory-bank/test.md'],
    );
  });
});
