# Memory Bank MCP — Documentation

## Getting Started
- [NPX Usage](npx-usage.md) — Run without installing
- [Build with Bun](build-with-bun.md) — Local development build
- [Custom Folder Name](custom-folder-name.md) — Change the default `memory-bank/` directory

## Guides
- [Usage Modes](usage-modes.md) — Architect, code, ask, debug, test
- [Remote Server](remote-server.md) — SSH-based remote storage
- [SSH Keys](ssh-keys-guide.md) — Key generation and configuration
- [Migration](migration-guide.md) — Upgrading from older versions
- [Debug MCP Config](debug-mcp-config.md) — Troubleshoot connection issues

## Integrations
- [AI Assistants (general)](ai-assistant-integration.md) — Generic MCP integration patterns
- [Cursor](cursor-integration.md) — Cursor IDE
- [Cline](cline-integration.md) — VS Code extension with `.clinerules` support
- [Roo Code](roo-code-integration.md) — VS Code extension

## Reference
- [MCP Protocol Specification](reference/mcp-protocol-specification.md) — Stdio MCP protocol, tools & resources
- [External MCP Clients](reference/requirements.md) — MCP client comparison (from modelcontextprotocol.io)
- [Rule Formats](reference/rule-formats.md) — `.clinerules-*` file syntax
- [Rule Examples](reference/rule-examples.md) — Sample rule configurations
- [File Naming Convention](reference/file-naming-convention.md) — Naming conventions
- [Roo Code Memory Bank Comparison](reference/roo-code-memory-bank-comparison.md) — Historical comparison

## Development
- [Testing Guide](testing-guide.md) — How to run and write tests
- [Cline Rules Testing](testing-clinerules.md) — Testing `.clinerules` integration
- [Integration Testing](integration-testing-guide.md) — E2E test patterns
- [Test Coverage](test-coverage.md) — Coverage reports
- [Memory Bank MCP Startup](memory-bank-mcp-startup.md) — CLI options and initialization
- [Logging System](logging-system.md) — Log levels and configuration

## Internal Documentation
- [Research](internal/research/) — External project research and findings
  - [Cline/RooCode Updates (Feb 2026)](internal/research/cline-roocode-updates-feb-2026.md)
- [Archived Documentation](archive/) — Obsolete docs preserved for reference
