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

- VS Code extension production-ready (Claude Code)
- MCP server graph bugs fixed (Claude Code)
## Known Issues

- Old double-nested memory-bank/memory-bank/graph/ directory still exists from pre-fix — can be safely removed or migrated
- Extension .vsix has WARNING about missing repository field in package.json
## Next Steps

- Install extension .vsix in VS Code and test end-to-end
- Add repository field to vscode-extension/package.json
- Consider migrating old graph data from memory-bank/memory-bank/graph/ to memory-bank/graph/
- Publish extension to VS Code marketplace
## Session Notes

- [4:41 PM] 👀 [Claude Code] Created extension build guide documentation at docs/internal/extension-build-guide.md. Covers: compile, watch mode, type-check, packaging (.vsix), local installation (3 methods), development workflow (F5 debugging), linting, VS Code Marketplace publishing (PAT setup, vsce login, publish commands, CI/CD), alternative distribution via GitHub Releases, quick reference table, and troubleshooting section.

- [4:38 PM] 📋 Claude Code creating extension build/publish documentation in docs/internal/extension-build-guide.md

- [4:06 PM] ✅ Claude Code starting VS Code extension fix & completion. Plan approved with edits: (1) memory bank updates must credit "Claude Code", (2) extension must NOT auto-create memory-bank folder - user-initiated via init button, (3) add .vscode/mcp.json configuration UI in extension with default/custom options.

- [3:49 PM] 👀 Starting VS Code extension fix & completion task. Reading memory bank context, prompts, and codebase.


## Current Session Notes

- [21:22:45] [Unknown User] Decision Made: VS Code Extension: .vscode/mcp.json priority for connection config (Claude Code)
