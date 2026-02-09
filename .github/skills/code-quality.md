# Code Quality Standards

## Overview

Code quality principles and practices for the Memory Bank MCP server project. This TypeScript/Bun codebase follows strict type safety, clean code patterns, and SOLID architecture.

## Clean Code Principles

### Naming Conventions

- **Files**: PascalCase for classes (`MemoryBankManager.ts`), camelCase for utilities (`FileUtils.ts`)
- **Variables/Functions**: camelCase (`memoryBankPath`, `ensureDirectory`)
- **Constants**: UPPER_SNAKE_CASE (`MEMORY_BANK_FOLDER`, `PRODUCT_CONTEXT_FILE`)
- **Interfaces**: PascalCase with descriptive names (`FileSystemInterface`, `ModeConfig`)
- **Tool names**: snake_case (`initialize_memory_bank`, `track_progress`)

```typescript
// BAD: Cryptic names
const d = new Date();
const mb = getMB();

// GOOD: Descriptive names
const currentDate = new Date();
const memoryBankManager = getMemoryBankManager();
```

### Functions

- Single responsibility: each function does one thing
- Use object parameters when more than 3 arguments
- Return early with guard clauses instead of deep nesting

```typescript
// BAD: Does too much
function processMemoryBank(path: string) {
  const exists = checkPath(path);
  if (exists) {
    const files = listFiles(path);
    for (const file of files) {
      // nested logic...
    }
  }
}

// GOOD: Single responsibility with early return
function processMemoryBank(path: string): void {
  if (!checkPath(path)) return;
  const files = listFiles(path);
  processFiles(files);
}
```

### Comments

- Explain WHY, not WHAT
- Use JSDoc for public API methods
- Avoid redundant comments

```typescript
// BAD: Restates the code
// Increment counter by 1
counter++;

// GOOD: Explains intent
// Use atomic write (temp file + rename) to prevent corruption on process crash
await FileUtils.atomicWrite(filePath, content);
```

## SOLID Principles in This Project

### Single Responsibility

Each class has one concern:
- `MemoryBankManager` - memory bank lifecycle operations
- `ProgressTracker` - progress and decision tracking
- `LogManager` - centralized logging
- `ModeManager` - operational mode management

### Open/Closed (Strategy Pattern)

The `FileSystemInterface` enables extension without modification:

```typescript
interface FileSystemInterface {
  fileExists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  // ...
}

// New storage backends implement the interface, no changes to existing code
class LocalFileSystem implements FileSystemInterface { /* ... */ }
class RemoteFileSystem implements FileSystemInterface { /* ... */ }
```

### Dependency Inversion (Factory Pattern)

Use `FileSystemFactory` to inject the appropriate implementation:

```typescript
// Depend on abstraction, not concrete class
const fs: FileSystemInterface = FileSystemFactory.create(config);
```

## Code Review Checklist

### Correctness
- [ ] Logic handles edge cases (empty strings, null paths, missing files)
- [ ] Error handling is appropriate with try/catch in async operations
- [ ] Path traversal is prevented (no `../`, `./`, backslashes, null bytes)

### Design
- [ ] Follows existing patterns (Manager, Factory, Strategy)
- [ ] No unnecessary complexity or over-engineering
- [ ] New file system operations go through `FileSystemInterface`

### Security
- [ ] Input validation on file paths (use `validateFilename`)
- [ ] Only .md and .json files allowed
- [ ] No secrets or credentials in code
- [ ] SSH operations use key-based auth only

### Testing
- [ ] Tests use temp directories with cleanup (beforeEach/afterEach)
- [ ] Edge cases tested (empty input, invalid paths, concurrent access)
- [ ] Tests are isolated and don't depend on each other

## Metrics Targets

| Metric | Target |
|--------|--------|
| Cyclomatic Complexity | < 10 per function |
| Function Length | < 50 lines |
| File Length | < 400 lines |
| Test Coverage | > 80% |

## Logging Standards

Use `LogManager` singleton, never raw `console.log`:

```typescript
import { LogManager } from '../utils/LogManager.js';
const logger = LogManager.getInstance();

// Good: Structured logging with component name
logger.debug('MemoryBankManager', 'Initializing memory bank at path');
logger.error('FileUtils', `Failed to write file: ${error.message}`);

// Bad: Raw console
console.log('something happened');
```

## Error Handling

- Always use try/catch in async operations
- Log errors with context via LogManager
- Provide meaningful error messages
- Gracefully degrade when possible

```typescript
try {
  await this.fileSystem.writeFile(filePath, content);
} catch (error) {
  logger.error('CoreTools', `Failed to write ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  throw error;
}
```

## File Validation

Always validate file paths before operations:

```typescript
// Enforced rules:
// - No path traversal (../, ./)
// - No null bytes
// - Only .md and .json extensions
// - Only root and docs/ subdirectory
// - Sanitized filenames on Windows
```
