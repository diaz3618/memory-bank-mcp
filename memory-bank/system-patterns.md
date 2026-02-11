# System Patterns

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Clients                          │
│  (Claude, Cursor, Cline, Roo Code, VS Code Extension)  │
└────────────────────────┬────────────────────────────────┘
                         │ stdio / SSE
┌────────────────────────▼────────────────────────────────┐
│                 MemoryBankServer                        │
│  Transport ─► Tool Router ─► Resource Router            │
└───────┬─────────────┬──────────────┬────────────────────┘
        │             │              │
   ┌────▼────┐  ┌─────▼─────┐  ┌────▼────┐
   │  Tools  │  │ Resources │  │  Modes  │
   │ (7 groups)│ │  (URIs)   │  │ (5 modes)│
   └────┬────┘  └─────┬─────┘  └────┬────┘
        │             │              │
   ┌────▼─────────────▼──────────────▼────────────────────┐
   │            MemoryBankManager                         │
   │   ProgressTracker │ GraphStore │ ModeManager         │
   └──────────────────────┬───────────────────────────────┘
                          │
   ┌──────────────────────▼───────────────────────────────┐
   │           FileSystemInterface                        │
   │  LocalFileSystem │ SshFileSystem │ CachingFileSystem  │
   └──────────────────────┬───────────────────────────────┘
                          │
            ┌─────────────▼─────────────┐
            │   Filesystem / SSH Host   │
            │  memory-bank/             │
            │   ├── *.md (5 core files) │
            │   └── graph/              │
            │       ├── graph.jsonl     │
            │       ├── graph.snapshot  │
            │       └── graph.md        │
            └───────────────────────────┘
```

## Core Patterns

### MCP Server Pattern

The server implements the Model Context Protocol via `@modelcontextprotocol/sdk`. Communication occurs over **stdio** (primary) or SSE transport. Tools are registered with JSON schemas and return structured results with `isError` flags.

### FileSystemInterface Abstraction

All file I/O goes through `FileSystemInterface`, which has three implementations:
- **LocalFileSystem** — direct `fs-extra` operations with atomic writes (temp + rename)
- **SshFileSystem** — remote operations over SSH with stdout trimming
- **CachingFileSystem** — read-cache wrapper with TTL, LRU eviction, and configurable size limits

This abstraction means MemoryBankManager, ProgressTracker, GraphStore, and backup tools are all remote-compatible.

### Atomic Writes

All write operations use a temp-file-then-rename pattern to prevent partial writes:
1. Write content to `<file>.tmp.<random>`
2. Rename temp file to target path
3. On failure, clean up temp file

Works on both local and SSH file systems.

### ETag Concurrency Control

Every file read returns an ETag (SHA-256 hash of content). Writes can include `ifMatchEtag` for optimistic concurrency — the write only succeeds if the file hasn't changed since the read. Enables safe multi-agent scenarios.

### Knowledge Graph Architecture

The knowledge graph uses an **append-only event log** pattern:

- **Source of truth:** `graph/graph.jsonl` — one JSON event per line (upsert_entity, add_observation, link_entities, unlink_entities, delete_entity, delete_observation)
- **Fast reads:** `graph/graph.snapshot.json` — materialised view rebuilt from event log via `GraphReducer`
- **Human-readable:** `graph/graph.md` — Markdown render via `GraphRenderer`
- **IDs:** SHA-256 deterministic branded types (`EntityId`, `ObservationId`, `RelationId`) via `GraphIds`
- **Validation:** Runtime type guards and schema validation via `GraphSchemas`
- **Search:** Full-text search with fuzzy matching and neighbourhood expansion via `GraphSearch`
- **Safety:** Marker-based file path validation prevents writing outside graph directory
- **Idempotency:** Duplicate upserts and links are safely deduplicated

### Tool Organisation (7 Groups)

| Group | File | Tools |
|---|---|---|
| Core | `CoreTools.ts` | read/write/init/set-path/status/search/batch/backup/restore |
| Progress | `ProgressTools.ts` | track_progress, add_progress_entry |
| Decision | `DecisionTools.ts` | log_decision |
| Context | `ContextTools.ts` | update_active_context, add_session_note, update_tasks, get_context_bundle, get_context_digest |
| Mode | `ModeTools.ts` | switch_mode, get_current_mode |
| Graph | `GraphTools.ts` | graph_upsert_entity, graph_add_observation, graph_link_entities, graph_unlink_entities, graph_search, graph_open_nodes, graph_rebuild |
| UMB | (integrated) | process_umb_command, complete_umb |

### Mode System

Five operational modes with `.clinerules` file integration:

| Mode | Purpose |
|---|---|
| `code` | Implementation and coding tasks |
| `architect` | System design and architecture |
| `ask` | Information retrieval and Q&A |
| `debug` | Debugging and troubleshooting |
| `test` | Testing and validation |

Modes are managed by `ModeManager` which loads rules from `.clinerules` files via `ExternalRulesLoader`.

### Logging Pattern

Centralised via `LogManager` singleton:
- Levels: DEBUG, INFO, WARN, ERROR
- Debug mode enabled via `--debug` / `-d` flag
- Normal mode shows WARN and ERROR only
- Consistent formatting across all modules

### Build & CI/CD Pattern

- **Build:** `bun build src/index.ts --outdir build --target node` → single `build/index.js` file
- **Test:** `bun test` — 99 tests, Bun's built-in runner
- **Publish:** GitHub Actions workflow:
  - Trigger: push to `main` or `workflow_dispatch` with version choice (patch/minor/major)
  - Steps: checkout → setup Node 20 → install → build → test → `standard-version` bump → npm publish → push tags
  - Tokens: npm granular token (publish-only, `@diazstg` scope)
  - OIDC: `id-token: write` for provenance

### Memory Bank File Structure

Core files (kebab-case naming):
```
memory-bank/
├── active-context.md      # Current session state, tasks, issues, notes
├── decision-log.md        # Architectural and implementation decisions
├── product-context.md     # Project overview, tech stack, architecture
├── progress.md            # Chronological update history
├── system-patterns.md     # Architecture and code patterns (this file)
├── docs/                  # Supplementary documents
│   └── english-language-policy.md
└── graph/                 # Knowledge graph storage
    ├── graph.jsonl         # Append-only event log (source of truth)
    ├── graph.snapshot.json # Materialised snapshot
    └── graph.md            # Markdown render
```

### Code Quality Patterns

- TypeScript strict mode with discriminated unions
- `as const` assertions for type-safe constants
- Runtime type guards in `src/types/guards.ts`
- Branded types for IDs (prevent mixing entity/observation/relation IDs)
- Path traversal protection with validation and canonicalisation
- Comprehensive JSDoc comments on all public APIs

### Testing Patterns

- Bun's built-in test runner with `describe`/`test`/`expect`
- `beforeEach`/`afterEach` hooks for setup and teardown
- Temporary directories for file-based tests
- Async/await throughout
- 99 tests: 66 core + 33 knowledge graph
