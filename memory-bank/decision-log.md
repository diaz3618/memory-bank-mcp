# Decision Log

Key decisions made during the development of Memory Bank MCP, ordered chronologically.

---

## 1. English Language Standardisation

- **Date:** 2025-03-08
- **Context:** The project originated with Portuguese content in Memory Bank files and documentation. Consistency was needed for international collaboration.
- **Decision:** All code, documentation, and Memory Bank content must be in English regardless of system locale. A `setLanguage` method always forces English.
- **Consequences:** Consistent content across environments; simplified code (no i18n needed); all existing content translated.

## 2. Kebab-Case File Naming

- **Date:** 2025-03-08
- **Context:** Memory Bank files used camelCase (`productContext.md`) but resource URIs used kebab-case, creating an unnecessary mapping layer.
- **Decision:** Standardise to kebab-case (`product-context.md`). Created migration utility and `migrate_file_naming` tool.
- **Consequences:** URI-to-filename mapping eliminated; migration tool handles existing Memory Banks; consistent naming throughout.

## 3. Directory Structure Simplification

- **Date:** 2025-03-08
- **Context:** `initializeMemoryBank` was creating subdirectories (`progress/`, `decisions/`, `context/`, etc.) but the rest of the code expected files in the root. This caused file-not-found errors.
- **Decision:** All core files placed directly in `memory-bank/` root. Removed subdirectory creation.
- **Consequences:** Simpler structure; no file access mismatches; cleaner user experience.

## 4. Remove Environment Variables Support

- **Date:** 2025-03-08
- **Context:** Environment variables (`MEMORY_BANK_PROJECT_PATH`, `MEMORY_BANK_FOLDER_NAME`, etc.) were adding complexity without significant benefit over CLI arguments.
- **Decision:** Remove all environment variable support; use CLI arguments exclusively.
- **Consequences:** Simpler codebase; clearer documentation; fewer configuration paths to maintain.

## 5. Bun as Build/Test/Run Tool

- **Date:** 2025-03-08
- **Context:** Needed a fast, modern build tool for TypeScript with built-in test runner.
- **Decision:** Use Bun for building (`bun build`), testing (`bun test`), and running (`bun run`).
- **Consequences:** Single-file output (`build/index.js`); fast builds; built-in test runner eliminates Jest dependency; 99 tests run in seconds.

## 6. Semantic Versioning with standard-version

- **Date:** 2025-03-08
- **Context:** Manual version bumping was error-prone and inconsistent.
- **Decision:** Use `standard-version` with Conventional Commits in GitHub Actions workflow. Auto-bumps version and generates CHANGELOG.md on push to main.
- **Consequences:** Automated release process; consistent changelog; version tracked via git tags.

## 7. Type Safety Overhaul

- **Date:** 2025-03-08
- **Context:** Many `any` types existed, reducing type safety and IDE support.
- **Decision:** Create structured type system in `src/types/` with discriminated unions, branded types, `as const` constants, and runtime type guards.
- **Consequences:** Better compile-time error detection; improved IDE autocomplete; runtime validation via guards.

## 8. Centralised Logging via LogManager

- **Date:** 2025-03-09
- **Context:** Debug logs were showing in production mode via `console.error` calls.
- **Decision:** Implement `LogManager` singleton with levels (DEBUG/INFO/WARN/ERROR). Normal mode shows WARN+ only. Debug mode (`--debug`/`-d`) shows all.
- **Consequences:** Clean production output; detailed debugging when needed; consistent log formatting.

## 9. P0/P1 Production Hardening

- **Date:** 2026-02-08
- **Context:** `areas-of-improvement.md` identified critical blockers: broken remote mode, disabled mode system, security gaps, data integrity issues.
- **Decision:** Implement all P0 and P1 fixes before adding features:
  - Atomic writes (temp file + rename)
  - ETag-based optimistic concurrency (SHA-256)
  - Path traversal protection
  - Remote file checks with stdout trimming
  - ProgressTracker/backup injectable with FileSystemInterface
  - ModeManager properly wired
  - Removed dummy parameters
- **Consequences:** Remote mode works end-to-end; multi-agent safety; atomic writes prevent corruption; 66 tests passing.

## 10. Knowledge Graph — Append-Only JSONL Architecture

- **Date:** 2026-02-09
- **Context:** Needed structured entity/relation storage for the knowledge graph (Phase 1 of `knowledge-graph-plans.md`).
- **Decision:** Append-only JSONL event log as source of truth, JSON snapshot for fast reads, Markdown render for human readability. Used branded TypeScript types for IDs. Implemented on `feature/knowledge-graph` branch.
- **Consequences:** 7 new MCP tools; 33 new tests (99 total); immutable event history; fast snapshot reads; human-readable output. Branch merged to main.

## 11. npm Scope Rename to @diazstg

- **Date:** 2026-02-10
- **Context:** Could not create `@diaz3618` org on npm (name unavailable). Needed a scope for publishing.
- **Decision:** Created `diazstg` org on npm. Renamed package scope from `@diaz3618/memory-bank-mcp` to `@diazstg/memory-bank-mcp` across all files.
- **Consequences:** Package publishable under `@diazstg` scope; all references updated; published v1.1.4 successfully.

## 12. .npmignore Trimming (61.5 MB → 102.6 kB)

- **Date:** 2026-02-10
- **Context:** First publish attempt resulted in a 61.5 MB package due to inclusion of `repos/`, `vscode-extension/`, `backup/`, docs, tests, and source files.
- **Decision:** Comprehensive `.npmignore` to include only: `CHANGELOG.md`, `LICENSE`, `README.md`, `build/index.js`, `package.json`.
- **Consequences:** Package is 102.6 kB / 5 files; fast install; no source code or docs shipped.

## 13. Secrets Protection in .gitignore

- **Date:** 2026-02-10
- **Context:** Context7 API key was found in `.mcp.json`, `.claude/mcp.json`, `.vscode/mcp.json`, and `chat.json`.
- **Decision:** Added `.mcp.json`, `.claude/`, `.npmrc` to `.gitignore` to prevent secrets from being committed.
- **Consequences:** API keys and tokens are no longer tracked by git; existing files need manual removal from history if needed.

## 14. npm Publish Workflow Modernisation

- **Date:** 2026-02-10
- **Context:** Old workflow used deprecated actions and didn't support manual dispatch or OIDC provenance.
- **Decision:** Updated workflow with: `workflow_dispatch` (version bump choice), `id-token: write` (OIDC), `actions/checkout@v4`, `actions/setup-node@v4`, npm granular publish-only token for `@diazstg` scope.
- **Consequences:** Manual release capability; npm provenance badges; modern action versions; scoped token security.

## 15. README Rewrite

- **Date:** 2026-02-10
- **Context:** README was 405 lines with outdated information, old developer references, and verbose content.
- **Decision:** Rewrote to ~110 lines: concise quick-start, config JSON, common options, remote SSH, MCP tools table, modes table, documentation index linking to `docs/`.
- **Consequences:** Faster onboarding; all detail lives in `docs/`; accurate references.

## VS Code Extension: .vscode/mcp.json priority for connection config (Claude Code)
- **Date:** 2026-02-10 21:22:45
- **Author:** Unknown User
- **Context:** Extension always fell back to npx because package.json defaults were returned by config.get() even when user hadn't set them. This prevented reading .vscode/mcp.json which had the correct local server configuration.
- **Decision:** Changed connection resolution order: (1) .vscode/mcp.json first, (2) explicit user settings via config.inspect(), (3) npx fallback. Changed package.json defaults to empty strings so they don't interfere.
- **Alternatives Considered:** 
  - Keep user settings priority but use config.inspect() — rejected because .vscode/mcp.json is the standard VS Code/Copilot MCP config and should take precedence
  - Remove fallback entirely — rejected because npx fallback is useful for users without local setup
- **Consequences:** 
  - Extension now correctly reads .vscode/mcp.json for server config
  - Users with existing explicit settings in VS Code settings are now secondary to mcp.json
  - New installs with no config will fall back to npx as before
