# Active Context

## Current Project State

Memory Bank MCP (`@diazstg/memory-bank-mcp`) is a production-ready MCP server providing persistent memory for AI assistants. The project is published on npm, has 99 passing tests, and includes a knowledge graph with append-only JSONL storage.

**Latest milestone:** Merged `feature/knowledge-graph` into `main`, cleaned up all developer references, published v1.1.4 to npm (CI auto-bumped to v1.1.5), and rewrote README.

## What's Done

- All core MCP tools implemented (30+ tools across 7 groups)
- Knowledge graph with 7 tools (upsert, observe, link, unlink, search, open_nodes, rebuild)
- ETag concurrency, atomic writes, path traversal protection
- Backup/restore, batch read/write, caching layer
- 5-mode system with `.clinerules` integration
- Remote SSH support with FileSystemInterface abstraction
- npm published as `@diazstg/memory-bank-mcp@1.1.5`
- GitHub Actions CI/CD with `standard-version`, OIDC, `workflow_dispatch`
- 99 tests passing (Bun test runner)
- Secrets protected in `.gitignore`
- All developer references updated (`diaz3618` / `diazstg`)
- README rewritten (concise, ~110 lines)

## Ongoing Tasks

- Fix Pack 2026-02-13: Implementing 15 open GitHub issues (#1-#15)
- Priority order: #2 (critical RCE) > #1,#3,#4,#5,#6,#8,#9,#10,#11 (high) > #7,#12,#13,#14 (medium) > #15 (low)
- Branch: fix/issues-and-docs — commit only, do NOT push
#1-#15)
- Issues span MCP server (GraphSchemas, SshUtils, GraphStore, GraphReducer, GraphIds, ProgressTracker, LogManager, CLI) and VS Code extension (mcp.json, StdioMcpClient, tool schemas, CSP, copilot instructions)
- Priority: critical (#2 RCE) > high (#1,#3,#4,#5,#6,#8,#9,#10,#11) > medium (#7,#12,#13,#14) > low (#15)
## Known Issues

- #2 SshUtils RCE: exec -> execFile/spawn
- #1 GraphSchemas isObject: reject Date/boxed primitives
- #4 GraphStore: atomic append with serialization lock
- #5 GraphReducer: full structural validation
- #6 GraphIds: remove text truncation in observation ID
- #7 ProgressTracker: fix regex section matching + - 15 open GitHub issues to fix: security bugs, data corruption, validation, CLI args, extension bugs
- Branch: fix/issues-and-docs — DO NOT PUSH until approved
 interpolation
- #11 LogManager: console.log -> logger in SshUtils + stderr for --help
- #12 CLI: fix -u short flag collision
- #15 MemoryBankServer: read version from package.json
- #3 Extension mcp.json: JSONC-aware parser
- #8 Extension comment-stripping regex: use jsonc-parser
- #9 Extension StdioMcpClient: streaming TextDecoder
- #10 Extension schema mismatch: align DTOs
- #13 Extension .github dir: mkdir before write
- #14 Extension webview CSP: remove unsafe-eval
## Next Steps

- Implement MCP server fixes first (#1,#2,#4,#5,#6,#7,#11,#12,#15)
- Then implement extension fixes (#3,#8,#9,#10,#13,#14)
- Run tests after each fix group
- Commit changes without pushing
## Session Notes

- [6:33 AM] ✅ React Flow migration completed successfully! Build artifacts: graph.js (415KB) + graph.css (22KB) = 437KB total, which is 33KB smaller than Cytoscape (470KB). Implementation includes all advanced features: custom nodes with NodeToolbar, MiniMap, Controls, Background patterns, Dagre layout, search, 4-directional layout options, stats panel, and professional VS Code-themed styling.

- [11:57 PM] ✅ React Flow comprehensive research completed and documented in docs/archive/react-flow-research.md. Key decisions: Use @xyflow/react with TypeScript, implement custom EntityNode components with NodeToolbar, integrate MiniMap/Controls/Background, use Dagre for automatic layout, leverage useNodesState/useEdgesState hooks for state management.

- [11:54 PM] 👀 Starting React Flow migration on branch feat/react-flow-graph. Goal: Replace Cytoscape.js with React Flow implementation that leverages advanced features like custom nodes, layouts (dagre/elkjs), MiniMap, Controls, NodeToolbar, Background patterns, and proper TypeScript types.

- [8:07 AM] 📋 Resuming knowledge-graph-plans.md completion. Starting with entity/observation deletion tools, then digest integration, compaction, staleness, extension features.

- [8:02 AM] 📋 Starting knowledge-graph-plans.md completion — implementing all remaining ⏳ items across Phase 2-4. Items: stores.json registry, storeId threading, graph digest integration, compaction tool, staleness check, context menus, digest preview command, entity/observation deletion.

- [4:41 PM] 👀 [Claude Code] Created extension build guide documentation at docs/internal/extension-build-guide.md. Covers: compile, watch mode, type-check, packaging (.vsix), local installation (3 methods), development workflow (F5 debugging), linting, VS Code Marketplace publishing (PAT setup, vsce login, publish commands, CI/CD), alternative distribution via GitHub Releases, quick reference table, and troubleshooting section.

- [4:38 PM] 📋 Claude Code creating extension build/publish documentation in docs/internal/extension-build-guide.md

- [4:06 PM] ✅ Claude Code starting VS Code extension fix & completion. Plan approved with edits: (1) memory bank updates must credit "Claude Code", (2) extension must NOT auto-create memory-bank folder - user-initiated via init button, (3) add .vscode/mcp.json configuration UI in extension with default/custom options.

- [3:49 PM] 👀 Starting VS Code extension fix & completion task. Reading memory bank context, prompts, and codebase.


## Current Session Notes

- [14:46:57] [Unknown User] Implemented remaining knowledge graph features: Completed all actionable items from knowledge-graph-plans.md:

**Server-side (src/):**
- Added `ObservationDeleteEvent` type, schema validator, and reducer case
- Added `GraphStore.deleteObservation()` method
- Added `GraphStore.compact()` method — rewrites JSONL with minimal events
- Added staleness check via `tryLoadCachedSnapshot()` — reads graph.index.json on cold start
- Added 3 new MCP tools: `graph_delete_entity`, `graph_delete_observation`, `graph_compact`
- Wired `renderGraphSummary()` into `handleGetContextDigest` — digest now includes graph data
- All 100 tests pass, build clean

**Extension (vscode-extension/):**
- Added client methods: `graphDeleteEntity`, `graphDeleteObservation`, `graphCompact`, `getContextDigest`
- Added extension commands: `memoryBank.graph.deleteEntity`, `memoryBank.graph.deleteObservation`, `memoryBank.graph.compact`, `memoryBank.digest`
- Added context menus on graph entity tree items (Add Observation, Delete Entity, Link Entities)
- Context menu commands pre-fill entity name from the TreeItem
- Digest preview renders full markdown in a virtual document
- Extension compiles clean

**Deferred items** (stores.json, storeId threading, graph webview, HTTP client) documented as deferred with rationale.
- [21:22:45] [Unknown User] Decision Made: VS Code Extension: .vscode/mcp.json priority for connection config (Claude Code)
