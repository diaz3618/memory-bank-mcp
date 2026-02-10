# Memory Bank MCP Server - Copilot Agent

## About This Project

Memory Bank MCP is a Model Context Protocol (MCP) server that provides AI assistants with persistent memory across sessions. It allows storing and retrieving project context, tracking progress, logging architectural decisions, and managing active context through a set of MCP tools.

**Tech Stack**: TypeScript 5.1.6 | Bun (build, test, package manager) | Node.js runtime target | MCP SDK v1.6.1

**Repository**: `@diazstg/memory-bank-mcp`

## Skills

This project has the following specialized skills available in `.github/skills/`:

- **[code-quality](.github/skills/code-quality.md)** - Clean code principles, SOLID patterns, code review checklists, and metrics targets specific to this TypeScript MCP server project
- **[typescript-best-practices](.github/skills/typescript-best-practices.md)** - Type-first development, strict mode patterns, ESM imports, exhaustive switches, error handling, and project-specific TypeScript conventions
- **[bun-development](.github/skills/bun-development.md)** - Bun runtime, package management, build configuration, test runner usage, and Node.js compatibility considerations for this project
- **[testing-strategy](.github/skills/testing-strategy.md)** - Testing patterns using `bun:test`, temp directory isolation, file system testing, MCP tool handler testing, and coverage targets
- **[mcp-server-development](.github/skills/mcp-server-development.md)** - MCP protocol patterns, tool definition/handling, file system abstraction, ETag concurrency, and guide for extending the server

## Project Structure

```
src/
├── index.ts                        # Entry point, CLI parsing, server init
├── core/
│   ├── MemoryBankManager.ts        # Memory bank lifecycle operations
│   ├── ProgressTracker.ts          # Progress and decision tracking
│   └── templates/                  # Markdown file templates
├── server/
│   ├── MemoryBankServer.ts         # Main MCP server class
│   ├── tools/                      # Tool definitions and handlers
│   │   ├── CoreTools.ts            # Core CRUD operations
│   │   ├── ProgressTools.ts        # Progress tracking
│   │   ├── ContextTools.ts         # Active context management
│   │   ├── DecisionTools.ts        # Decision logging
│   │   ├── ModeTools.ts            # Mode switching
│   │   └── index.ts                # Tool registration
│   └── resources/                  # MCP resource definitions
├── utils/
│   ├── FileUtils.ts                # Atomic file writes
│   ├── ETagUtils.ts                # Optimistic concurrency control
│   ├── SshUtils.ts                 # SSH command execution
│   ├── LogManager.ts               # Centralized logging singleton
│   ├── ModeManager.ts              # Mode detection (EventEmitter)
│   ├── ExternalRulesLoader.ts      # .clinerules loading
│   ├── MigrationUtils.ts           # File naming migration
│   └── storage/
│       ├── FileSystemInterface.ts  # Abstract FS interface
│       ├── FileSystemFactory.ts    # Factory pattern
│       ├── LocalFileSystem.ts      # Local FS implementation
│       └── RemoteFileSystem.ts     # SSH-based remote FS
├── types/                          # Type definitions, constants, guards
└── __tests__/                      # Test files (bun:test)
```

## Key Patterns

- **Factory Pattern**: `FileSystemFactory` creates `LocalFileSystem` or `RemoteFileSystem`
- **Strategy Pattern**: `FileSystemInterface` abstracts storage operations
- **Singleton Pattern**: `LogManager` for centralized logging
- **Event-Driven**: `ModeManager` extends `EventEmitter` for mode changes
- **Atomic Writes**: Temp file + rename to prevent corruption
- **ETag Concurrency**: Optimistic locking for concurrent file access

## Commands

```bash
bun run build          # Clean + compile to build/index.js (Node.js target)
bun run start          # Run the server
bun run dev            # Watch mode development
bun test               # Run all tests
bun test --coverage    # Run tests with coverage
bun run release        # Patch version bump with changelog
```

## MCP Tools Provided

| Tool | Category | Purpose |
|------|----------|---------|
| `initialize_memory_bank` | Core | Create memory bank in a directory |
| `set_memory_bank_path` | Core | Set custom memory bank path |
| `read_memory_bank_file` | Core | Read file with ETag support |
| `write_memory_bank_file` | Core | Write file with concurrency control |
| `find_memory_bank` | Core | Locate existing memory bank |
| `get_memory_bank_status` | Core | Get current status |
| `debug_mcp_config` | Core | Debug MCP configuration |
| `track_progress` | Progress | Log progress updates |
| `update_active_context` | Context | Update tasks/issues/next steps |
| `log_decision` | Decision | Log architectural decisions |
| `switch_mode` | Mode | Switch operational mode |
| `get_mode_info` | Mode | Get current mode info |

## Conventions

- **Imports**: Always use `.js` extensions (`import { X } from './module.js'`)
- **Logging**: Use `LogManager.getInstance()`, never raw `console.log`
- **File paths**: Validate with `validateFilename()` before any operation
- **Errors**: Catch, add context, re-throw. Use `instanceof Error` checks
- **Testing**: Isolated temp dirs, cleanup in afterEach, async tests
- **Security**: No path traversal, only .md/.json files, SSH key auth only
