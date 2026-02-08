# Bun Development

## Overview

This project uses Bun as its runtime, package manager, test runner, and build tool. Bun provides native TypeScript execution, fast dependency installation, and a built-in test framework.

## Project Build Setup

### Build Command

```bash
bun run build    # Cleans build/ dir, then compiles with bun build
bun run start    # Runs the built server: node build/index.js
bun run dev      # Watch mode development
```

Build configuration in `package.json`:

```json
{
  "scripts": {
    "clean": "rm -rf build",
    "build": "bun run clean && bun build src/index.ts --outdir build --target node",
    "start": "node build/index.js",
    "dev": "bun --watch src/index.ts",
    "build:start": "bun run build && bun run start"
  }
}
```

The build targets Node.js (`--target node`) and outputs to `build/index.js`.

### Package Manager

```bash
bun install              # Install all dependencies
bun add <pkg>            # Add dependency
bun add -d <pkg>         # Add devDependency
bun remove <pkg>         # Remove dependency
```

Lockfile: `bun.lock` (text-based JSONC format, git-tracked).

## Test Runner (bun:test)

### Running Tests

```bash
bun test                 # Run all tests
bun test --watch         # Watch mode
bun test --coverage      # Generate coverage report
bun test src/__tests__/fileUtils.test.ts  # Run specific test
```

### Test Patterns Used in This Project

Tests live in `src/__tests__/` and follow these conventions:

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('MemoryBankManager', () => {
  let tempDir: string;

  // Create isolated temp directory for each test
  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `memory-bank-test-${Date.now()}`);
    await fs.ensureDir(tempDir);
  });

  // Clean up after each test
  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test('initializes memory bank with all required files', async () => {
    const manager = new MemoryBankManager(tempDir);
    await manager.initialize();

    const files = await fs.readdir(path.join(tempDir, 'memory-bank'));
    expect(files).toContain('product-context.md');
    expect(files).toContain('active-context.md');
    expect(files).toContain('progress.md');
    expect(files).toContain('decision-log.md');
    expect(files).toContain('system-patterns.md');
  });
});
```

### Key Testing Conventions

1. **Temp directory pattern**: Always create a fresh temp directory in `beforeEach` and clean it up in `afterEach`
2. **Async tests**: All file system tests are async
3. **Isolation**: Tests must not share state or depend on other tests
4. **Descriptive names**: Test names describe the expected behavior

### Mocking with bun:test

```typescript
import { mock, spyOn } from 'bun:test';

// Mock a function
const mockFn = mock(() => 'mocked value');

// Spy on an object method
const spy = spyOn(logger, 'debug');
expect(spy).toHaveBeenCalledWith('Component', 'message');

// Module mocking
mock.module('./api', () => ({
  fetchData: mock(() => ({ status: 'ok' }))
}));
```

### Available Matchers

- `.toBe()`, `.toEqual()`, `.toStrictEqual()` - Equality
- `.toContain()`, `.toHaveLength()`, `.toMatch()` - String/Array
- `.toHaveProperty()`, `.toMatchObject()` - Objects
- `.toThrow()`, `.rejects.toThrow()` - Errors
- `.toHaveBeenCalled()`, `.toHaveBeenCalledWith()` - Mocks

## Dependencies

### Runtime Dependencies

- `@modelcontextprotocol/sdk` (v1.6.1) - Core MCP protocol
- `fs-extra` (v11.1.1) - Enhanced file system operations
- `js-yaml` (v4.1.0) - YAML parsing for rules files
- `path` (v0.12.7) - Path utilities

### Dev Dependencies

- `typescript` (v5.1.6) - Type checking
- `ts-node` (v10.9.2) - TypeScript execution
- `@types/node`, `@types/bun`, `@types/fs-extra`, `@types/js-yaml`
- `standard-version` (v9.5.0) - Semantic versioning

## File System Operations

Use `fs-extra` for enhanced file operations (not raw `node:fs`):

```typescript
import fs from 'fs-extra';

await fs.ensureDir(dirPath);       // Create dir recursively
await fs.readFile(filePath, 'utf-8');
await fs.remove(dirPath);          // Remove dir recursively
const exists = await fs.pathExists(filePath);
```

For memory bank file operations, use `FileUtils.atomicWrite()` which writes to a temp file then renames to prevent corruption.

## Node.js Compatibility

This project targets Node.js for the built output (`--target node`). Keep these in mind:
- Use `node:` prefix for Node.js built-in modules when needed
- The build output runs with `node build/index.js`, not `bun`
- Avoid Bun-only APIs in production code (they won't work in the Node.js build target)
- Bun-specific APIs are fine in test files and development scripts
