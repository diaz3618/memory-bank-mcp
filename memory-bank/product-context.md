# Memory Bank MCP — Product Context

## Overview

Memory Bank MCP (`@diazstg/memory-bank-mcp`) is an MCP (Model Context Protocol) server that gives AI assistants persistent memory across sessions. It stores structured context — progress, decisions, architecture patterns, and active state — in Markdown files inside a `memory-bank/` folder and exposes them through standardised MCP tools and resources.

## Author & Ownership

- **Author:** Daniel Diaz Santiago (`diaz3618`)
- **npm org:** `diazstg`
- **GitHub:** `github.com/diaz3618/memory-bank-mcp`
- **npm package:** `@diazstg/memory-bank-mcp` (v1.1.4, published)
- **License:** MIT

## Key Features

| Area | Details |
|---|---|
| **Core Memory Bank** | 5 core Markdown files: `product-context.md`, `active-context.md`, `progress.md`, `decision-log.md`, `system-patterns.md` |
| **Knowledge Graph** | Typed entity/relation/observation graph stored as append-only JSONL event log with JSON snapshot and Markdown render |
| **MCP Tools** | 30+ tools: core CRUD, progress tracking, decision logging, context management, mode switching, backup/restore, batch operations, knowledge graph (upsert, link, search, open_nodes, rebuild) |
| **MCP Resources** | Direct resource URIs for each core file |
| **Mode System** | 5 modes (code, architect, ask, debug, test) with `.clinerules` integration |
| **Remote SSH** | Full remote server support via SSH with atomic writes |
| **Concurrency** | ETag-based optimistic concurrency control (SHA-256) |
| **Backup/Restore** | create_backup, list_backups, restore_backup tools |
| **Batch Operations** | batch_read_files, batch_write_files with parallel I/O |
| **Caching** | CachingFileSystem wrapper with TTL, LRU eviction, size limits |
| **UMB Command** | "Update Memory Bank" natural-language command support |

## Technical Stack

- **Runtime:** Node.js / Bun
- **Language:** TypeScript (strict mode)
- **Build:** Bun bundler (`bun build src/index.ts --outdir build --target node`)
- **Test:** Bun's built-in test runner (99 tests passing)
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **File I/O:** `fs-extra` with `FileSystemInterface` abstraction (local + SSH)
- **CI/CD:** GitHub Actions — npm publish workflow with `standard-version`, `workflow_dispatch`, OIDC token support
- **Package:** Published to npm as `@diazstg/memory-bank-mcp`, 102.6 kB / 5 files

## Architecture

### Core Layer (`src/core/`)

- **MemoryBankManager** — initialises, reads, writes, and validates Memory Bank directories. Uses `FileSystemInterface` for local/remote abstraction.
- **ProgressTracker** — structured progress entries with timestamps, categories, and user attribution.
- **Templates** (`CoreTemplates.ts`) — default content for new Memory Bank files.
- **Graph** (`src/core/graph/`) — Knowledge graph implementation:
  - `GraphIds.ts` — SHA-256 deterministic ID generation with branded types
  - `GraphSchemas.ts` — Runtime validation and type guards
  - `GraphReducer.ts` — JSONL event log → snapshot transformation
  - `GraphSearch.ts` — Entity/observation search with neighbourhood expansion
  - `GraphRenderer.ts` — Markdown output generation
  - `GraphStore.ts` — Storage manager using FileSystemInterface

### Server Layer (`src/server/`)

- **MemoryBankServer** — main MCP server class, transport setup, tool/resource registration.
- **Tools** (`src/server/tools/`):
  - `CoreTools.ts` — read/write/init/set-path/status/search/batch/backup
  - `ProgressTools.ts` — track_progress, add_progress_entry
  - `DecisionTools.ts` — log_decision
  - `ContextTools.ts` — update_active_context, add_session_note, update_tasks, get_context_bundle, get_context_digest
  - `ModeTools.ts` — switch_mode, get_current_mode
  - `GraphTools.ts` — graph_upsert_entity, graph_add_observation, graph_link_entities, graph_unlink_entities, graph_search, graph_open_nodes, graph_rebuild
- **Resources** (`src/server/resources/`) — MCP resource URIs for core files.

### Utilities (`src/utils/`)

- **FileUtils** — file operations abstraction
- **ExternalRulesLoader** — `.clinerules` file loading and monitoring
- **ModeManager** — mode state management
- **LogManager** — centralised logging (DEBUG/INFO/WARN/ERROR)
- **MigrationUtils** — file naming migration (camelCase → kebab-case)
- **SshUtils** — SSH remote operations
- **Storage** — `LocalFileSystem`, `SshFileSystem`, `CachingFileSystem`, `FileSystemInterface`

### Types (`src/types/`)

- `index.ts` — core interfaces (MemoryBankConfig, MemoryBankStatus, etc.)
- `progress.ts` — progress-related discriminated union types
- `rules.ts` — rule-related types
- `constants.ts` — type-safe constants with `as const`
- `guards.ts` — runtime type guards
- `graph.ts` — knowledge graph types (367 lines)

### Tests (`src/__tests__/`)

- 99 tests total (66 core + 33 knowledge graph)
- Covers: FileUtils, MemoryBankManager, ProgressTracker, MigrationUtils, ExternalRulesLoader, GraphStore, clinerules integration, server tools

## Development Guidelines

- All code and documentation in English
- TypeScript strict mode
- Bun for building, testing, and running
- Clean code principles with comprehensive error handling
- Runtime type validation via guards
- Atomic writes for data safety
- ETag concurrency for multi-agent scenarios
