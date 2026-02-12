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

- Knowledge graph plans implementation — all actionable items complete
## Known Issues

- Old double-nested memory-bank/memory-bank/graph/ directory still exists from pre-fix — can be safely removed or migrated
- Extension .vsix has WARNING about missing repository field in package.json
## Next Steps

- Consider adding tests for new graph tools (delete, compact, staleness)
- Graph webview visualization (future enhancement)
- stores.json persistent registry when multi-store is needed
- HTTP MCP client implementation
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
