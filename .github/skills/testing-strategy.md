# Testing Strategy

## Overview

Testing patterns and practices for the Memory Bank MCP server. This project uses `bun:test` as the test framework with tests located in `src/__tests__/`.

## Test Structure

```
src/__tests__/
├── memoryBankManager.test.ts       # Core manager tests
├── progressTracker.test.ts         # Progress tracking tests
├── fileUtils.test.ts               # File utility tests
├── clinerules-integration.test.ts  # Rules integration tests
├── migrationUtils.test.ts          # Migration utility tests
├── memory-bank-validation.test.ts  # Validation tests
├── externalRulesLoader.test.ts     # Rules loader tests
└── server/
    ├── coreTools.test.ts           # MCP tool handler tests
    └── memoryBankServer.test.ts    # Server integration tests
```

## Testing Pyramid for This Project

- **Unit Tests (70%)**: Test individual functions and utilities (FileUtils, ETagUtils, MigrationUtils, validators)
- **Integration Tests (20%)**: Test manager operations end-to-end (MemoryBankManager init, ProgressTracker, tool handlers)
- **System Tests (10%)**: Test the MCP server with tool calls

## Test Patterns

### Temp Directory Pattern (Required)

Every test that touches the file system MUST use isolated temp directories:

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('MyFeature', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `memory-bank-test-${Date.now()}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test('creates files correctly', async () => {
    // Use tempDir for all file operations
    const filePath = path.join(tempDir, 'test.md');
    await fs.writeFile(filePath, '# Test');
    expect(await fs.pathExists(filePath)).toBe(true);
  });
});
```

### Testing File System Operations

```typescript
test('atomic write prevents corruption', async () => {
  const filePath = path.join(tempDir, 'test.md');
  const content = '# Memory Bank\n\nTest content';

  await FileUtils.atomicWrite(filePath, content);

  const result = await fs.readFile(filePath, 'utf-8');
  expect(result).toBe(content);
});
```

### Testing Memory Bank Initialization

```typescript
test('initialize creates all required files', async () => {
  const manager = new MemoryBankManager(tempDir);
  await manager.initialize();

  const memoryBankDir = path.join(tempDir, 'memory-bank');
  expect(await fs.pathExists(path.join(memoryBankDir, 'product-context.md'))).toBe(true);
  expect(await fs.pathExists(path.join(memoryBankDir, 'active-context.md'))).toBe(true);
  expect(await fs.pathExists(path.join(memoryBankDir, 'progress.md'))).toBe(true);
  expect(await fs.pathExists(path.join(memoryBankDir, 'decision-log.md'))).toBe(true);
  expect(await fs.pathExists(path.join(memoryBankDir, 'system-patterns.md'))).toBe(true);
});
```

### Testing MCP Tool Handlers

```typescript
test('set_memory_bank_path handles valid path', async () => {
  const result = await handleToolCall('set_memory_bank_path', {
    path: tempDir
  });

  expect(result.content[0].type).toBe('text');
  expect(result.content[0].text).toContain('success');
});

test('read_memory_bank_file rejects path traversal', async () => {
  const result = await handleToolCall('read_memory_bank_file', {
    filename: '../../../etc/passwd'
  });

  expect(result.isError).toBe(true);
});
```

### Testing Validation

```typescript
test('validateFilename rejects path traversal', () => {
  expect(() => validateFilename('../secret.md')).toThrow();
  expect(() => validateFilename('./secret.md')).toThrow();
  expect(() => validateFilename('file\x00name.md')).toThrow();
  expect(() => validateFilename('file.exe')).toThrow();
});

test('validateFilename accepts valid filenames', () => {
  expect(() => validateFilename('progress.md')).not.toThrow();
  expect(() => validateFilename('config.json')).not.toThrow();
  expect(() => validateFilename('docs/guide.md')).not.toThrow();
});
```

### Testing ETag Concurrency Control

```typescript
test('write fails with stale ETag', async () => {
  // Write initial content
  await writeFile(filePath, 'initial', undefined);
  const etag1 = ETagUtils.generateETag('initial');

  // Write again (changes the content)
  await writeFile(filePath, 'updated', undefined);

  // Try to write with old ETag - should fail
  await expect(writeFile(filePath, 'conflict', etag1)).rejects.toThrow();
});
```

## What to Test

### High Priority (Must Test)

- File validation and path traversal prevention
- Memory bank initialization and file creation
- ETag-based concurrency control
- Tool handler input validation
- Progress tracking and decision logging
- Error handling paths

### Medium Priority

- Mode switching logic
- SSH command execution (mock SSH)
- Migration utilities
- Template generation

### Low Priority (Can Skip)

- LogManager singleton behavior
- Simple getters/setters
- Type definitions

## Running Tests

```bash
bun test                              # Run all tests
bun test --coverage                   # With coverage report
bun test src/__tests__/fileUtils.test.ts  # Single test file
bun test -t "validates filename"      # Filter by test name
bun test --watch                      # Watch mode
bun test --bail                       # Stop on first failure
```

## Coverage Targets

| Area | Target |
|------|--------|
| File validation / security | 90%+ |
| Core manager operations | 80%+ |
| Tool handlers | 80%+ |
| Utility functions | 70%+ |
| Overall | 80%+ |
