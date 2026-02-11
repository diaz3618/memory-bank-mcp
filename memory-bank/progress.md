# Progress

## Project Timeline

### Phase 0 — Initial Development (Mar 2025)

- Created base project structure (TypeScript + MCP SDK)
- Implemented MemoryBankManager and ProgressTracker core classes
- Implemented MCP server with tools and resources
- Implemented FileUtils for file operations
- Translated all code and documentation to English
- Configured build process with Bun for improved performance
- Renamed project from `memory-bank-server` to `@diazstg/memory-bank-mcp`
- Implemented `.clinerules` integration with 5 modes (code, architect, ask, debug, test)
- Added automated tests for clinerules integration using Bun's test runner
- Published initial version to npm (`@diazstg/memory-bank-mcp@0.1.0`)
- Configured GitHub Actions for automatic npm publication on merge to main
- Implemented semantic versioning with `standard-version` and changelog generation
- Added npx support for zero-install usage
- Standardised Memory Bank file naming to kebab-case with migration utility
- Added comprehensive documentation (Cursor integration, Roo Code, AI assistant integration, MCP protocol spec)

### Phase 1 — Stability & Quality (Mar 2025)

- Implemented comprehensive type safety: discriminated unions, branded types, `as const`, runtime guards
- Created structured type system (`src/types/` — `progress.ts`, `rules.ts`, `constants.ts`, `guards.ts`, `utils.ts`)
- Centralised logging system via `LogManager` singleton with debug mode
- Fixed Memory Bank status detection (ACTIVE/INACTIVE/UPDATING)
- Fixed Memory Bank path resolution (folderName concatenation)
- Fixed directory structure simplification (removed unnecessary subdirectories)
- Removed environment variables support in favour of CLI arguments
- Fixed unit tests and improved coverage from 56% to 91% (lines)
- English language policy enforced throughout

### Phase 2 — Production Hardening (Feb 2026)

P0/P1/P2/P3 improvements from `areas-of-improvement.md`:

- **P0 — Security & Correctness:**
  - Path traversal protection with validation and canonicalisation
  - Removed dummy tool parameters (`random_string`)
  - Atomic writes via temp-file-then-rename (local + SSH)
  - ETag-based optimistic concurrency control (SHA-256)

- **P1 — Reliability:**
  - Fixed remote file/directory existence checks (stdout trimming in SshUtils)
  - Made ProgressTracker use FileSystemInterface for remote compatibility
  - Made backup creation use FileSystemInterface end-to-end
  - Wired ModeManager properly (removed stubs, instantiated ExternalRulesLoader)
  - Implemented backup/restore tools: `create_backup`, `list_backups`, `restore_backup`
  - Fixed MemoryBankManager.initialize() race condition
  - Fixed LocalFileSystem.getFullPath() absolute path handling

- **P2 — Developer Experience:**
  - `get_context_bundle` — bulk read all core files
  - `get_context_digest` — compact summary for context-limited situations
  - `search_memory_bank` — full-text search across Memory Bank
  - `add_progress_entry` — structured entries with type categories
  - `add_session_note` — categorised session notes
  - `update_tasks` — task list management

- **P3 — Performance:**
  - `CachingFileSystem` — read cache with TTL, LRU eviction, size limits
  - `batch_read_files` — parallel file reading with ETags
  - `batch_write_files` — batch writes with ETag concurrency control

All 66 tests passing after Phase 2.

### Phase 3 — Knowledge Graph (Feb 2026)

Implemented on `feature/knowledge-graph` branch, merged to `main`:

- **Core graph modules** (`src/core/graph/`):
  - `GraphIds.ts` — SHA-256 deterministic ID generation with branded types
  - `GraphSchemas.ts` — runtime validation and type guards for all graph types
  - `GraphReducer.ts` — JSONL event log → snapshot transformation
  - `GraphSearch.ts` — entity/observation search with neighbourhood expansion
  - `GraphRenderer.ts` — Markdown output generation
  - `GraphStore.ts` — main storage manager using FileSystemInterface

- **MCP tools** (`src/server/tools/GraphTools.ts` — 825 lines):
  - `graph_upsert_entity` — create/update entities with type and attributes
  - `graph_add_observation` — timestamped observations on entities
  - `graph_link_entities` — typed relations between entities
  - `graph_unlink_entities` — remove relations
  - `graph_search` — search with fuzzy matching and neighbourhood expansion
  - `graph_open_nodes` — subgraph snapshot by name/ID
  - `graph_rebuild` — rebuild snapshot from JSONL event log

- **Types** (`src/types/graph.ts` — 367 lines)
- **Tests** — 33 new tests, all 99 tests passing

Architecture: append-only JSONL event log as source of truth, JSON snapshot for fast reads, Markdown render for human readability.

### Phase 4 — npm Publish & Repo Cleanup (Feb 2026)

- Renamed npm scope from `@diaz3618` to `@diazstg` (could not create `@diaz3618` org on npm)
- Updated scope across all source files, configs, and documentation via sed
- Fixed `.npmignore` — package reduced from 61.5 MB to 102.6 kB (5 files: CHANGELOG.md, LICENSE, README.md, build/index.js, package.json)
- Published `@diazstg/memory-bank-mcp@1.1.4` to npm
- Updated npm-publish GitHub Actions workflow:
  - Added `workflow_dispatch` with version bump choice (patch/minor/major)
  - Added `id-token: write` for npm OIDC provenance
  - Upgraded to `actions/checkout@v4` and `actions/setup-node@v4`
  - Configured for npm granular publish-only token (`@diazstg` scope)
- Cleaned up all old developer references (`aakarsh-sasi`, `movibe` → `diaz3618`/`diazstg`)
- Added `.mcp.json`, `.claude/`, `.npmrc` to `.gitignore` (secrets protection — Context7 API key was exposed)
- Rewrote README.md from 405 lines to ~110 lines (concise with doc links)
- Merged `feature/knowledge-graph` branch into `main` (fast-forward, commit `ed144c9`)
- Pushed to GitHub, synced with auto-bump to `31c3bf1` (v1.1.5 via CI)

## Current State

- **Version:** 1.1.4 (package.json) / 1.1.5 (npm, after CI auto-bump)
- **Branch:** `main` at commit `31c3bf1`
- **Tests:** 99 passing
- **npm:** `@diazstg/memory-bank-mcp@1.1.5` live on npm registry
- **GitHub:** `github.com/diaz3618/memory-bank-mcp`

## Update History

- [2026-02-10 21:22:45] [Unknown User] - Decision Made: VS Code Extension: .vscode/mcp.json priority for connection config (Claude Code)
### [Feb 10, 2026, 4:16 PM] milestone: VS Code Extension Fixed & Production-Ready (Claude Code)
<!-- ID: p_2026-02-10_mlh3pu17 -->

Claude Code fixed and completed the VS Code extension:\n\nMCP Server Fixes:\n- Fixed graph_add_observation field name mismatch (entityId \u2192 entityRef)\n- Fixed graph_link_entities field name mismatch (fromId/toId \u2192 from/to)\n- Fixed graph double-path bug (GraphStore storeRoot was 'memory-bank' causing memory-bank/memory-bank/graph/)\n- Rebuilt server, all tests passing\n\nExtension Fixes:\n- CRITICAL: Fixed connection config resolution \u2014 .vscode/mcp.json is now checked FIRST (was always falling back to npx defaults)\n- Fixed update_active_context API mismatch (extension sent {content} but server expects {tasks,issues,nextSteps})\n- Removed deprecated random_string dummy parameters\n- Changed package.json defaults to empty (no longer interfere with mcp.json)\n\nExtension New Features:\n- Functional Knowledge Graph tree provider (shows real entities/relations/observations)\n- Functional graph commands (search, addObservation, linkEntities, upsertEntity)\n- Added graph methods to MCP client interface (graphSearch, graphOpenNodes, etc.)\n- Status bar connection indicator with error/success states\n- Updated Copilot instructions tool with all 30+ MCP tools including graph tools\n- Update Context command now uses correct field-based UX (tasks/issues/nextSteps)\n\nBuild: Extension compiles, packages to .vsix (19.83 KB, 7 files)

---

