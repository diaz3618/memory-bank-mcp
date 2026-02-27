# Memory Bank MCP — Documentation

## Getting Started

- [NPX Usage](getting-started/npx-usage.md) — Run without installing
- [Build with Bun](getting-started/build-with-bun.md) — Local development build
- [Custom Folder Name](getting-started/custom-folder-name.md) — Change the default `memory-bank/` directory

## Guides

- [Usage Modes](guides/usage-modes.md) — Architect, code, ask, debug, test
- [Remote Server](guides/remote-server.md) — SSH-based remote storage
- [Debug MCP Config](guides/debug-mcp-config.md) — Troubleshoot connection issues
- [Status Prefix](guides/memory-bank-status-prefix.md) — `[MEMORY BANK: ACTIVE/INACTIVE]` response prefixes

## Integrations

- [Generic MCP](integration/generic-mcp-integration.md) — Any MCP-compatible client
- [Claude Code](integration/claude-code-integration.md) — Claude Code CLI
- [Cursor](integration/cursor-integration.md) — Cursor IDE
- [Cline](integration/cline-integration.md) — VS Code extension with `.mcprules` support
- [Roo Code](integration/roo-code-integration.md) — VS Code extension
- [VS Code Copilot](integration/vscode-copilot-integration.md) — GitHub Copilot in VS Code

## Development

- [Testing Guide](development/testing-guide.md) — Unit tests, coverage, and Bun test runner
- [Integration Testing](development/integration-testing-guide.md) — Stdio MCP client integration tests
- [Logging System](development/logging-system.md) — Server-side debug logging
- [Startup Sequence](development/memory-bank-mcp-startup.md) — CLI parsing and server bootstrap

## Reference

- [MCP Protocol Specification](reference/mcp-protocol-specification.md) — Stdio MCP protocol, tools & resources
- [Rule Formats](reference/rule-formats.md) — `.mcprules-*` / `.clinerules-*` file syntax
- [File Naming Convention](reference/file-naming-convention.md) — Naming conventions
