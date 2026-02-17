# Changelog

All notable changes to this project will be documented in this file.

## [1.8.4](https://github.com/diaz3618/memory-bank-mcp/compare/v1.8.0...v1.8.4) (2026-02-17)

### Security

- **RLS enforcement:** Added `SET LOCAL ROLE app_user` in `DatabaseManager.queryWithContext()` and `transactionWithContext()` to enforce RLS policies per transaction
- **SECURITY DEFINER functions:** `search_documents()` and `search_observations()` now verify project membership before executing (plpgsql with explicit auth checks)
- **RLS coverage:** Enabled RLS on `users` and `mcp_events` tables with proper policies
- **API keys DELETE policy:** Added missing `api_keys_delete` policy for app_user and authenticated roles
- **Supabase compatibility:** Duplicated all RLS policies for the `authenticated` role

### Features

- **API key REST endpoints:** `POST /api/keys`, `GET /api/keys`, `DELETE /api/keys/:id` — create, list, and revoke API keys via authenticated REST routes
- **API key routes wired:** Routes mounted at `/api/keys` with auth + rate limiting middleware

### Improvements

- **MCP SDK migration:** Migrated from deprecated `Server` to `McpServer` class (`@modelcontextprotocol/sdk` v1.26.0)
- **Type safety:** Eliminated all `as any` casts in production source code
- **Migration parity:** `migrations/002_functions.sql` and `migrations/003_policies.sql` now match `supabase/setup/` source files

### Chores

- Moved `004_rls_fixes.sql` to `docs/internal/supabase/` (fixes incorporated into source SQL files)
- Added `.agents/skills/` with domain-specific expertise files
- Added `.github/copilot-instructions.md` for Memory Bank workflow

## [1.8.0](https://github.com/diaz3618/memory-bank-mcp/compare/v1.7.0...v1.8.0) (2026-02-14)


### ⚠ BREAKING CHANGES

* Graph webview now uses React Flow instead of Cytoscape.js

## Core Changes
- Replaced Cytoscape.js (470KB) with React Flow (415KB) - 33KB smaller
- Dual esbuild configuration: extension (Node/CJS) + webview (Browser/IIFE with TSX)
- React webview with TypeScript, generic types, and full type safety

## Advanced Features Implemented
✨ Custom EntityNode component with professional styling
✨ NodeToolbar with context actions (Expand, Delete, Add Link)
✨ MiniMap component for overview navigation
✨ Controls component for zoom and fit-to-view
✨ Background with dot pattern (VS Code themed)
✨ Dagre layout algorithm for automatic node positioning
✨ 4-directional layout options (TB, LR, BT, RL)
✨ Search functionality with query input
✨ Stats panel showing node/edge counts
✨ Message passing between extension and webview
✨ Loading states and error handling

## Files Added
- src/webview/graph/index.tsx - React entry point
- src/webview/graph/KnowledgeGraph.tsx - Main React Flow component
- src/webview/graph/Entity Node.tsx - Custom node with toolbar
- src/webview/graph/layout.ts - Dagre layout utilities
- src/webview/graph/types.ts - TypeScript type definitions
- src/webview/graph/styles.css - Professional VS Code-themed styles
- docs/archive/react-flow-research.md - Comprehensive research doc

## Dependencies Added
- @xyflow/react@^12.0.0 - React Flow library
- react@^18.0.0 - React core
- react-dom@^18.0.0 - React DOM
- @dagrejs/dagre - Layout algorithm
- @types/react, @types/react-dom - TypeScript types

## Bundle Sizes
- graph.js: 415KB (minified)
- graph.css: 22KB
- Total: 437KB vs Cytoscape 470KB (-33KB, -7%)

## Documentation
Comprehensive React Flow research and best practices documented in:
docs/archive/react-flow-research.md

### Features

* add get_instructions tool — canonical session entry point ([d6a7c5e](https://github.com/diaz3618/memory-bank-mcp/commit/d6a7c5ec65582a56c113ca1033bcad082a9d2cee))
* **graph:** add animated edges, right-side settings panel, context menu, snap-to-grid ([5202dcf](https://github.com/diaz3618/memory-bank-mcp/commit/5202dcf1dd491634071793ff5fd12791aca6b650))
* **graph:** complete settings overhaul with persistent UI options ([6aaf135](https://github.com/diaz3618/memory-bank-mcp/commit/6aaf135cb9ca1644e136661de1713120f1fa767c))
* migrate graph webview from Cytoscape.js to React Flow ([5a7831f](https://github.com/diaz3618/memory-bank-mcp/commit/5a7831f8b7faac5db8d64f07d66ec1c21e8a889d))
* **vscode:** enhance graph webview with settings panel and fixes ([6512ccf](https://github.com/diaz3618/memory-bank-mcp/commit/6512ccf48ba43aeb9ce840c07c1eb81c451b31d6))


### Bug Fixes

* **graph:** improve context menu, edge handling, and VSCode dialog integration ([b8527b3](https://github.com/diaz3618/memory-bank-mcp/commit/b8527b3dd3593daef75e2bf1249f7b5918606182))
* **graph:** settings panel toggle + ELK layout algorithms ([0d55725](https://github.com/diaz3618/memory-bank-mcp/commit/0d55725994f539e41d2571c1c157f7da8c2dc5bc))
* implement fix-pack-2026-02-13 (15 issues) ([5062df5](https://github.com/diaz3618/memory-bank-mcp/commit/5062df5a222a549d8ef5cf4d7dc7071211aab954)), closes [#1](https://github.com/diaz3618/memory-bank-mcp/issues/1) [#2](https://github.com/diaz3618/memory-bank-mcp/issues/2) [#4](https://github.com/diaz3618/memory-bank-mcp/issues/4) [#5](https://github.com/diaz3618/memory-bank-mcp/issues/5) [#6](https://github.com/diaz3618/memory-bank-mcp/issues/6) [#7](https://github.com/diaz3618/memory-bank-mcp/issues/7) [#11](https://github.com/diaz3618/memory-bank-mcp/issues/11) [#12](https://github.com/diaz3618/memory-bank-mcp/issues/12) [#15](https://github.com/diaz3618/memory-bank-mcp/issues/15) [#3](https://github.com/diaz3618/memory-bank-mcp/issues/3) [#8](https://github.com/diaz3618/memory-bank-mcp/issues/8) [#9](https://github.com/diaz3618/memory-bank-mcp/issues/9) [#10](https://github.com/diaz3618/memory-bank-mcp/issues/10) [#13](https://github.com/diaz3618/memory-bank-mcp/issues/13) [#14](https://github.com/diaz3618/memory-bank-mcp/issues/14)
* mode switching, graph race conditions, docs restructure ([8e4a2dc](https://github.com/diaz3618/memory-bank-mcp/commit/8e4a2dc0efa5aa32d776428320f228f916204f1d))
* resolve issues [#16](https://github.com/diaz3618/memory-bank-mcp/issues/16)-[#21](https://github.com/diaz3618/memory-bank-mcp/issues/21) and close all GitHub issues ([13ede4f](https://github.com/diaz3618/memory-bank-mcp/commit/13ede4fbb111dbe9f362bcd45d6e0484c8ce4cdd)), closes [#17](https://github.com/diaz3618/memory-bank-mcp/issues/17) [#18](https://github.com/diaz3618/memory-bank-mcp/issues/18) [#19](https://github.com/diaz3618/memory-bank-mcp/issues/19)
* **vscode:** fix Auto layout button to use LR direction ([716ef4b](https://github.com/diaz3618/memory-bank-mcp/commit/716ef4bb844963fc8d515873fc53b4d3bed7fa1e))
* **vscode:** fix blank graph webview - single acquireVsCodeApi call ([2a3a798](https://github.com/diaz3618/memory-bank-mcp/commit/2a3a798213d73fdff4010b83ead1b494b77ba2e6))


### Documentation

* Clean up and reorganize development documentation ([aba997f](https://github.com/diaz3618/memory-bank-mcp/commit/aba997f09801fcb14793876377cc29b8ca9e1c27))
* Fix integration docs, rename --githubProfileUrl to --username ([ab3a57c](https://github.com/diaz3618/memory-bank-mcp/commit/ab3a57c0537ec8273d6d39220563880cb1326be9))
* Fix mcp-protocol-specification.md and update docs navigation ([02ecfa7](https://github.com/diaz3618/memory-bank-mcp/commit/02ecfa7b65e05e62fe42581661f3035110c92319))

## [1.7.0](https://github.com/diaz3618/memory-bank-mcp/compare/v1.6.0...v1.7.0) (2026-02-12)


### Features

* **ci:** add workflow_dispatch for manual release publishing ([d7a7a63](https://github.com/diaz3618/memory-bank-mcp/commit/d7a7a63e3cf5d5d906ee90eea58ae04e0aed5372))


### Bug Fixes

* **ci:** add missing jobs key in workflow file ([06b5452](https://github.com/diaz3618/memory-bank-mcp/commit/06b545275b345586d804526e51257cb39ec570fe))
* **ci:** add scope to setup-node for organization auth ([4683d52](https://github.com/diaz3618/memory-bank-mcp/commit/4683d52deaa2fc1214b3bdc43cfa2d2e3f695a6e))

## [1.6.0](https://github.com/diaz3618/memory-bank-mcp/compare/v1.5.0...v1.6.0) (2026-02-11)


### Bug Fixes

* **ci:** remove [skip ci] from release commits ([80dc0e2](https://github.com/diaz3618/memory-bank-mcp/commit/80dc0e2c96ad52bfbeae7be35a41e9ba18482446))

## [1.5.0](https://github.com/diaz3618/memory-bank-mcp/compare/v1.1.4...v1.5.0) (2026-02-11)


### ⚠ BREAKING CHANGES

* **ci:** CI no longer auto-versions on every push to main.

- Change trigger from 'push: branches: [main]' to 'push: tags: [v*]'
- Remove automatic standard-version execution from CI
- Version bumps now handled locally via 'npm run release' command
- CI only publishes to npm when version tags are pushed

This fixes push rejection issues caused by CI creating competing
version commits. Regular commits now push normally with only tests
running (via test.yml workflow).

Release workflow:
1. Regular commit: git push (runs tests only)
2. Create release: npm run release:patch/minor/major (local)
3. Publish: git push --follow-tags (triggers CI publish)

Note: NPM_TOKEN secret needs to be regenerated (currently expired).

### Features

* **agent:** add first-time Memory Bank detection and auto-initialization ([1643b37](https://github.com/diaz3618/memory-bank-mcp/commit/1643b37236f9c0a08066db4e4311715fd20a6334))
* complete deferred knowledge-graph tasks ([06cfee2](https://github.com/diaz3618/memory-bank-mcp/commit/06cfee2bc87d8b2766357f4f821b11d9b08d65ff))
* **ext:** graph webview, mode-sync fixes, copilot agent improvements ([bdec29c](https://github.com/diaz3618/memory-bank-mcp/commit/bdec29c17572e5f3dcd38ee85abbf991c32f93b4))
* implement remaining knowledge graph features ([17143b8](https://github.com/diaz3618/memory-bank-mcp/commit/17143b8bde4141ce94390203058ae34b5fd3665e))


### Bug Fixes

* **ci:** change publish workflow to only trigger on tag pushes ([b57c1eb](https://github.com/diaz3618/memory-bank-mcp/commit/b57c1eb661ea5dbf15ea1531e75ee8ec7106141a))
* **ci:** resolve standard-version not bumping package.json ([d79b32c](https://github.com/diaz3618/memory-bank-mcp/commit/d79b32cb4c6a3517de0be7ec2a5db1cf9a34a805))
* **extension:** overhaul 8 major issues in VS Code extension ([e066716](https://github.com/diaz3618/memory-bank-mcp/commit/e066716297b085d821b83b4f6f7b1f48c4655825))
* resolve 10 graph tool bugs preventing MCP operations ([c26d82f](https://github.com/diaz3618/memory-bank-mcp/commit/c26d82f1089035e28ef28dd998fbac5a8c5804c1))

## [1.4.0](https://github.com/diaz3618/memory-bank-mcp/compare/v1.3.0...v1.4.0) (2026-02-11)


### Features

* **ext:** graph webview, mode-sync fixes, copilot agent improvements ([bdec29c](https://github.com/diaz3618/memory-bank-mcp/commit/bdec29c17572e5f3dcd38ee85abbf991c32f93b4))

## [1.3.0](https://github.com/diaz3618/memory-bank-mcp/compare/v1.1.4...v1.3.0) (2026-02-11)


### Features

* **agent:** add first-time Memory Bank detection and auto-initialization ([1643b37](https://github.com/diaz3618/memory-bank-mcp/commit/1643b37236f9c0a08066db4e4311715fd20a6334))
* complete deferred knowledge-graph tasks ([06cfee2](https://github.com/diaz3618/memory-bank-mcp/commit/06cfee2bc87d8b2766357f4f821b11d9b08d65ff))
* implement remaining knowledge graph features ([17143b8](https://github.com/diaz3618/memory-bank-mcp/commit/17143b8bde4141ce94390203058ae34b5fd3665e))


### Bug Fixes

* **ci:** resolve standard-version not bumping package.json ([d79b32c](https://github.com/diaz3618/memory-bank-mcp/commit/d79b32cb4c6a3517de0be7ec2a5db1cf9a34a805))
* **extension:** overhaul 8 major issues in VS Code extension ([e066716](https://github.com/diaz3618/memory-bank-mcp/commit/e066716297b085d821b83b4f6f7b1f48c4655825))
* resolve 10 graph tool bugs preventing MCP operations ([c26d82f](https://github.com/diaz3618/memory-bank-mcp/commit/c26d82f1089035e28ef28dd998fbac5a8c5804c1))

## [1.2.0](https://github.com/diaz3618/memory-bank-mcp/compare/v1.1.5...v1.2.0) (2026-02-11)


### Features

* implement remaining knowledge graph features ([17143b8](https://github.com/diaz3618/memory-bank-mcp/commit/17143b8bde4141ce94390203058ae34b5fd3665e))


### Bug Fixes

* **extension:** overhaul 8 major issues in VS Code extension ([e066716](https://github.com/diaz3618/memory-bank-mcp/commit/e066716297b085d821b83b4f6f7b1f48c4655825))
* resolve 10 graph tool bugs preventing MCP operations ([c26d82f](https://github.com/diaz3618/memory-bank-mcp/commit/c26d82f1089035e28ef28dd998fbac5a8c5804c1))

### 1.1.5 (2026-02-10)


### Features

* Add comprehensive test-memory-bank configuration and clinerule templates ([e95cd29](https://github.com/diaz3618/memory-bank-mcp/commit/e95cd2956003171c9989e40480d9736f1fb6f921))
* Add customizable Memory Bank folder name and user tracking ([60d0b53](https://github.com/diaz3618/memory-bank-mcp/commit/60d0b53192c1cc3b907e15ad05949e5be946fedc))
* Add MIT License file ([e19e4da](https://github.com/diaz3618/memory-bank-mcp/commit/e19e4da551dc33011cf4821153fc3bae786e5fbd))
* add P2 context bundle and search tools ([264e89c](https://github.com/diaz3618/memory-bank-mcp/commit/264e89c262108d0b70027d042e06f82f3f375be1)), closes [#1](https://github.com/diaz3618/memory-bank-mcp/issues/1)
* Add semantic versioning and changelog generation ([79493a4](https://github.com/diaz3618/memory-bank-mcp/commit/79493a4a42bdaa5e40c878ea948116e941b0a8b2))
* Automate NPM publication with GitHub Actions ([588d2db](https://github.com/diaz3618/memory-bank-mcp/commit/588d2dbc0bd3ed17fb5a2447f7468990a00cb57f))
* complete P0/P1 improvements for production readiness ([20cefce](https://github.com/diaz3618/memory-bank-mcp/commit/20cefcef06223ff524c2a8c1ee698f8b7dbc2268))
* complete P1 backup/rollback and P2 structured tools ([eafd36f](https://github.com/diaz3618/memory-bank-mcp/commit/eafd36f2b6e07ccedfed8f7f11ea50252795c0b2))
* Configure project for npm publication and enhance documentation ([b387dcf](https://github.com/diaz3618/memory-bank-mcp/commit/b387dcf7c048197404f59cd7a7abdd38c10c1480))
* Enhance Memory Bank Language Enforcement and Error Handling ([78af3d6](https://github.com/diaz3618/memory-bank-mcp/commit/78af3d60db863fcd57710ba51ea5ccd744b9e7ca))
* Enhance Memory Bank MCP with Environment Variables and Roo Code Integration ([7059e5a](https://github.com/diaz3618/memory-bank-mcp/commit/7059e5a4e0363f184b4918982d9141474f39e9a1))
* Enhance Type Safety and Interfaces for Memory Bank MCP ([7422abc](https://github.com/diaz3618/memory-bank-mcp/commit/7422abce3caa01a1a54d702506c6ad025285fa89))
* **graph:** implement knowledge graph storage and MCP tools ([9bd023d](https://github.com/diaz3618/memory-bank-mcp/commit/9bd023d5cfa30af5dc011830764591381f62e773))
* Implement Centralized Logging System with Debug Mode Support ([6b84223](https://github.com/diaz3618/memory-bank-mcp/commit/6b842230e8eb3763c74403b1a34ce28832cc1b86))
* implement P3 caching and batch operations ([3d6ba12](https://github.com/diaz3618/memory-bank-mcp/commit/3d6ba12c1d0217b29f903b909c657a46a05110cf))
* Standardize Clinerule Templates to YAML Format ([dad5009](https://github.com/diaz3618/memory-bank-mcp/commit/dad5009d050ad36cfed7374facb45dc0045600d5))
* Standardize Memory Bank file naming and improve migration support ([0c9e540](https://github.com/diaz3618/memory-bank-mcp/commit/0c9e54002b596d25821520cf57617c4415367447))
* Standardize Memory Bank Language and Path Configuration ([71a9c79](https://github.com/diaz3618/memory-bank-mcp/commit/71a9c796535c58d017dfb85d5da6b7a563e26a54))
* Update User Identification with GitHub Profile URL Support ([4311147](https://github.com/diaz3618/memory-bank-mcp/commit/43111473af58f434b0ea5891036ca9cedbda02ce))


### Bug Fixes

* **core:** resolve nested directory creation with absolute paths ([c70ab1b](https://github.com/diaz3618/memory-bank-mcp/commit/c70ab1bbec1aa21f36814a8b3efbbd24ab5c8535))


### Tests

* Add comprehensive test suite for Memory Bank MCP server components ([0b2e244](https://github.com/diaz3618/memory-bank-mcp/commit/0b2e244effd78df94f6f6b7510372a9d479ce5e7))


### Code Refactoring

* Remove deprecated environment variable support ([15bfc7f](https://github.com/diaz3618/memory-bank-mcp/commit/15bfc7fd8dc348bd0f666eaa5007231e507a3fa0))
* Simplify Memory Bank initialization and file structure ([1b5cf9f](https://github.com/diaz3618/memory-bank-mcp/commit/1b5cf9f9b3b076a7f4d9dfc281fc709a9dbbae26))


### Documentation

* Add debug MCP configuration tool and documentation ([22744cc](https://github.com/diaz3618/memory-bank-mcp/commit/22744cc9dbc72725ba9d71cb261c64b6216758ed))
* Add Memory Bank Status Prefix System Documentation ([8a0f1ca](https://github.com/diaz3618/memory-bank-mcp/commit/8a0f1caa3090cceabf4e3ad017c5a42cf2411cf7))
* Consolidate Cline Integration Documentation ([6dac2df](https://github.com/diaz3618/memory-bank-mcp/commit/6dac2df805762267f8d73d56984e898b9c9e15e2))
* Enhance README and add Cursor integration documentation ([7fcf2d3](https://github.com/diaz3618/memory-bank-mcp/commit/7fcf2d3ac9a353a821fc37413261fbad67628ab0))
* **memory-bank:** update with knowledge graph implementation status ([8ad23a1](https://github.com/diaz3618/memory-bank-mcp/commit/8ad23a12dfe6f20104e1ad934d90cb4eb2e3fae1))
* Update Memory Bank documentation with comprehensive improvements ([4476c77](https://github.com/diaz3618/memory-bank-mcp/commit/4476c771bbfca5342697624d1514fa1918b20abd))
* Update repository URLs and English translation ([75afb2c](https://github.com/diaz3618/memory-bank-mcp/commit/75afb2cad335709bc01cca3fcaf91a4e66346341))

## [1.1.3] - 2025-03-25

### Fixed
- Fixed missing `initializeMemoryBank` method in MemoryBankManager class that was causing "TypeError: memoryBankManager.initializeMemoryBank is not a function" error
- Added backwards compatibility method to ensure tests and existing code still work with the renamed method
- Updated tools to use the correct method signature

## [1.1.2] - 2025-03-25

### Fixed
- Fixed SSH key path handling to properly resolve tilde (~) to home directory
- Added file existence check for SSH key before attempting connection
- Improved error reporting for SSH connection issues
- Fixed remote path handling in connection test

## [1.1.0] - 2025-03-25

### Added
- Remote server support via SSH
- Ability to store Memory Banks on remote servers
- Custom SSH key specification with the `--ssh-key` option
- Tests for remote server functionality

### Fixed
- TypeScript type definitions for Node.js modules
- Fixed linter errors related to missing type declarations
- Improved error handling for SSH connections
- Better handling of process references for cross-platform compatibility

### Changed
- Improved module structure for better maintainability
- Updated build process to bundle dependencies properly
- Enhanced logging for remote server operations
- Simplified API for remote server configuration

## [1.0.0] - Initial Release

### Added
- Basic Memory Bank functionality
- File operations for Memory Banks
- Progress tracking and decision logging
- Mode support with .clinerules files
- UMB command for temporary Memory Bank updates

### [0.4.1](https://github.com/diaz3618/memory-bank-mcp/compare/v0.4.0...v0.4.1) (2025-03-17)

## [0.4.0](https://github.com/diaz3618/memory-bank-mcp/compare/v0.3.0...v0.4.0) (2025-03-17)


### Features

* Add MIT License file ([e19e4da](https://github.com/diaz3618/memory-bank-mcp/commit/e19e4da551dc33011cf4821153fc3bae786e5fbd))

## [0.3.0](https://github.com/diaz3618/memory-bank-mcp/compare/v0.2.1...v0.3.0) (2025-03-09)


### Features

* Implement Centralized Logging System with Debug Mode Support ([6b84223](https://github.com/diaz3618/memory-bank-mcp/commit/6b842230e8eb3763c74403b1a34ce28832cc1b86))
* Update User Identification with GitHub Profile URL Support ([4311147](https://github.com/diaz3618/memory-bank-mcp/commit/43111473af58f434b0ea5891036ca9cedbda02ce))


### Documentation

* Add debug MCP configuration tool and documentation ([22744cc](https://github.com/diaz3618/memory-bank-mcp/commit/22744cc9dbc72725ba9d71cb261c64b6216758ed))

### [0.2.1](https://github.com/diaz3618/memory-bank-mcp/compare/v0.2.0...v0.2.1) (2025-03-08)


### Features

* Add customizable Memory Bank folder name and user tracking ([60d0b53](https://github.com/diaz3618/memory-bank-mcp/commit/60d0b53192c1cc3b907e15ad05949e5be946fedc))


### Documentation

* Consolidate Cline Integration Documentation ([6dac2df](https://github.com/diaz3618/memory-bank-mcp/commit/6dac2df805762267f8d73d56984e898b9c9e15e2))
* Update Memory Bank documentation with comprehensive improvements ([4476c77](https://github.com/diaz3618/memory-bank-mcp/commit/4476c771bbfca5342697624d1514fa1918b20abd))


### Code Refactoring

* Remove deprecated environment variable support ([15bfc7f](https://github.com/diaz3618/memory-bank-mcp/commit/15bfc7fd8dc348bd0f666eaa5007231e507a3fa0))
* Simplify Memory Bank initialization and file structure ([1b5cf9f](https://github.com/diaz3618/memory-bank-mcp/commit/1b5cf9f9b3b076a7f4d9dfc281fc709a9dbbae26))

## [0.2.0](https://github.com/diaz3618/memory-bank-mcp/compare/v0.1.2...v0.2.0) (2025-03-08)


### Features

* Add comprehensive test-memory-bank configuration and clinerule templates ([e95cd29](https://github.com/diaz3618/memory-bank-mcp/commit/e95cd2956003171c9989e40480d9736f1fb6f921))
* Enhance Memory Bank Language Enforcement and Error Handling ([78af3d6](https://github.com/diaz3618/memory-bank-mcp/commit/78af3d60db863fcd57710ba51ea5ccd744b9e7ca))
* Enhance Memory Bank MCP with Environment Variables and Roo Code Integration ([7059e5a](https://github.com/diaz3618/memory-bank-mcp/commit/7059e5a4e0363f184b4918982d9141474f39e9a1))
* Enhance Type Safety and Interfaces for Memory Bank MCP ([7422abc](https://github.com/diaz3618/memory-bank-mcp/commit/7422abce3caa01a1a54d702506c6ad025285fa89))
* Standardize Clinerule Templates to YAML Format ([dad5009](https://github.com/diaz3618/memory-bank-mcp/commit/dad5009d050ad36cfed7374facb45dc0045600d5))


### Tests

* Add comprehensive test suite for Memory Bank MCP server components ([0b2e244](https://github.com/diaz3618/memory-bank-mcp/commit/0b2e244effd78df94f6f6b7510372a9d479ce5e7))


### Documentation

* Add Memory Bank Status Prefix System Documentation ([8a0f1ca](https://github.com/diaz3618/memory-bank-mcp/commit/8a0f1caa3090cceabf4e3ad017c5a42cf2411cf7))

### [0.1.2](https://github.com/diaz3618/memory-bank-mcp/compare/v0.1.1...v0.1.2) (2025-03-08)


### Documentation

* Update repository URLs and English translation ([75afb2c](https://github.com/diaz3618/memory-bank-mcp/commit/75afb2cad335709bc01cca3fcaf91a4e66346341))

### 0.1.1 (2025-03-08)


### Features

* Add semantic versioning and changelog generation ([79493a4](https://github.com/diaz3618/memory-bank-mcp/commit/79493a4a42bdaa5e40c878ea948116e941b0a8b2))
* Automate NPM publication with GitHub Actions ([588d2db](https://github.com/diaz3618/memory-bank-mcp/commit/588d2dbc0bd3ed17fb5a2447f7468990a00cb57f))
* Configure project for npm publication and enhance documentation ([b387dcf](https://github.com/diaz3618/memory-bank-mcp/commit/b387dcf7c048197404f59cd7a7abdd38c10c1480))
* Standardize Memory Bank file naming and improve migration support ([0c9e540](https://github.com/diaz3618/memory-bank-mcp/commit/0c9e54002b596d25821520cf57617c4415367447))
* Standardize Memory Bank Language and Path Configuration ([71a9c79](https://github.com/diaz3618/memory-bank-mcp/commit/71a9c796535c58d017dfb85d5da6b7a563e26a54))


### Documentation

* Enhance README and add Cursor integration documentation ([7fcf2d3](https://github.com/diaz3618/memory-bank-mcp/commit/7fcf2d3ac9a353a821fc37413261fbad67628ab0))

## 0.1.0 (2025-03-08)

### Features

- Initial release of Memory Bank MCP
- Support for Memory Bank management
- Support for progress tracking
- Support for decision logging
- Support for active context management
- Support for mode detection
- Support for UMB command
- Support for npx usage
- English language standardization
- Current directory as default for Memory Bank
