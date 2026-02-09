# TypeScript Best Practices

## Overview

TypeScript patterns and practices for the Memory Bank MCP server. This project uses TypeScript 5.1.6 with strict mode, targeting ES2022 with NodeNext module resolution.

## TypeScript Configuration

This project enforces:

- `strict: true` (includes `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`)
- `target: "ES2022"` with `module: "NodeNext"`
- `esModuleInterop: true`
- All imports use `.js` extensions for ESM compatibility

```typescript
// REQUIRED: Use .js extension in imports even for .ts files
import { MemoryBankManager } from '../../core/MemoryBankManager.js';
import { FileUtils } from '../../utils/FileUtils.js';
```

## Type-First Development

1. **Define interfaces first** - types and interfaces before implementation
2. **Define function signatures** - input/output types before logic
3. **Implement to satisfy types** - let the compiler guide completeness
4. **Validate at boundaries** - runtime checks where data enters the system (tool inputs, file reads, SSH responses)

### Make Illegal States Unrepresentable

Use discriminated unions for states:

```typescript
// GOOD: Only valid combinations possible
type ToolResult =
  | { success: true; content: string }
  | { success: false; error: string };

// BAD: Allows invalid state like { success: true, error: "something" }
type ToolResult = {
  success: boolean;
  content?: string;
  error?: string;
};
```

### Const Assertions

```typescript
const ROLES = ['admin', 'user', 'guest'] as const;
type Role = typeof ROLES[number]; // 'admin' | 'user' | 'guest'
```

## Project Type Conventions

### Interface Definitions

Define interfaces in `src/types/`:

```typescript
// src/types/memory-bank-constants.ts
export interface MemoryBankFiles {
  productContext: string;
  activeContext: string;
  progress: string;
  decisionLog: string;
  systemPatterns: string;
}

export interface ModeConfig {
  description: string;
  prompt: string;
}
```

### Type Guards

Use type guards from `src/types/guards.ts`:

```typescript
// Define type guards for runtime type checking
function isValidMode(mode: string): mode is keyof typeof DEFAULT_MODES {
  return mode in DEFAULT_MODES;
}
```

### Tool Input Schemas

Tool inputs use JSON Schema objects (not Zod) per MCP protocol:

```typescript
{
  name: 'initialize_memory_bank',
  description: 'Initialize a Memory Bank in the specified directory',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path where the Memory Bank will be initialized',
      },
    },
    required: ['path'],
  },
}
```

## Async/Await Patterns

All file system and SSH operations are async. Always handle errors:

```typescript
// GOOD: Async with error handling
async function readMemoryBankFile(path: string): Promise<string> {
  try {
    const content = await this.fileSystem.readFile(path);
    return content;
  } catch (error) {
    logger.error('CoreTools', `Failed to read ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

// BAD: Missing error handling on async
async function readMemoryBankFile(path: string): Promise<string> {
  return this.fileSystem.readFile(path); // unhandled rejection if fails
}
```

## Module Structure

- One class/concern per file
- Group by feature: `core/`, `server/tools/`, `utils/`, `types/`
- Barrel exports via `index.ts` in each directory
- Colocate tests in `src/__tests__/`

## Functional Patterns

- Prefer `const` over `let`; use `readonly` for immutable data
- Use `array.map/filter/reduce` over `for` loops
- Write pure functions for business logic
- Avoid mutating function parameters

## Exhaustive Switch

Always handle all cases with a `never` check:

```typescript
function getFileTemplate(fileType: MemoryBankFileType): string {
  switch (fileType) {
    case 'product-context': return productContextTemplate;
    case 'active-context': return activeContextTemplate;
    case 'progress': return progressTemplate;
    case 'decision-log': return decisionLogTemplate;
    case 'system-patterns': return systemPatternsTemplate;
    default: {
      const _exhaustive: never = fileType;
      throw new Error(`Unhandled file type: ${_exhaustive}`);
    }
  }
}
```

## Error Propagation

- Catch errors and add context before re-throwing
- Use `instanceof Error` checks for type-safe error handling
- Never silently swallow errors

```typescript
try {
  await sshExec(command);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`SSH command failed for ${host}: ${message}`);
}
```
