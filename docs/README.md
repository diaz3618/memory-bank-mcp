# Memory Bank MCP Documentation

Welcome to the Memory Bank MCP documentation! This directory contains comprehensive documentation for the Model Context Protocol (MCP) server that enables AI assistants to maintain persistent context and memory across sessions.

## Quick Links

- 📚 [Main Project README](../README.md)
- 🚀 [Quick Start Guide](getting-started/npx-usage.md)
- 🔧 [Building with Bun](getting-started/build-with-bun.md)
- 🔌 [Integration Guides](integration/)
- 📖 [API Reference](reference/)

---

## Documentation Structure

The documentation is organized into the following categories:

### 📦 Getting Started

New to Memory Bank MCP? Start here!

- **[NPX Usage Guide](getting-started/npx-usage.md)** - Run Memory Bank MCP without installation using npx
- **[Build with Bun](getting-started/build-with-bun.md)** - Build the project using the Bun runtime
- **[Custom Folder Name](getting-started/custom-folder-name.md)** - Customize your Memory Bank directory name

### 📘 User Guides

Comprehensive guides for using Memory Bank MCP features:

- **[Usage Modes](guides/usage-modes.md)** - Detailed descriptions of each operational mode (code, architect, ask, debug, test)
- **[Remote Server Setup](guides/remote-server.md)** - Store Memory Banks on remote servers via SSH
- **[SSH Keys Guide](guides/ssh-keys-guide.md)** - Set up SSH key authentication for remote servers
- **[Migration Guide](guides/migration-guide.md)** - Migrate from older versions or other memory bank systems
- **[Memory Bank Status Prefix](guides/memory-bank-status-prefix.md)** - Understanding status indicators in responses
- **[Debug MCP Config](guides/debug-mcp-config.md)** - Troubleshoot MCP configuration issues

### 🔌 Integration Guides

Connect Memory Bank MCP with your favorite development tools:

- **[Cursor Integration](integration/cursor-integration.md)** - Set up Memory Bank MCP in Cursor editor
- **[Cline Integration](integration/cline-integration.md)** - Use with Cline VS Code extension (includes .clinerules)
- **[Roo Code Integration](integration/roo-code-integration.md)** - Integration with Roo Code Memory Bank
- **[AI Assistant Integration](integration/ai-assistant-integration.md)** - Generic guide for integrating with AI assistants

### 📖 Reference

Technical reference documentation:

- **[MCP Protocol Specification](reference/mcp-protocol-specification.md)** - Complete MCP protocol implementation details
- **[Rule Formats](reference/rule-formats.md)** - Supported formats for configuration rules (JSON, YAML, TOML)
- **[Rule Examples](reference/rule-examples.md)** - Complete examples of rule files in all supported formats
- **[File Naming Convention](reference/file-naming-convention.md)** - Memory Bank file naming standards (kebab-case)
- **[MCP Client Requirements](reference/requirements.md)** - Comprehensive list of MCP-compatible clients and their feature support

### 🛠️ Development

For contributors and developers working on Memory Bank MCP:

- **[Architecture Plan](development/architecture-plan.md)** - Overall system architecture and design
- **[Modular Architecture Proposal](development/modular-architecture-proposal.md)** - Proposed modular design improvements
- **[Logging System](development/logging-system.md)** - How logging works in Memory Bank MCP
- **[Startup Process](development/memory-bank-mcp-startup.md)** - Detailed startup sequence documentation
- **[Testing Guide](development/testing-guide.md)** - Comprehensive testing instructions
- **[Testing](development/testing.md)** - Basic testing information
- **[Testing Clinerules](development/testing-clinerules.md)** - Testing .clinerules integration
- **[Integration Testing Guide](development/integration-testing-guide.md)** - Step-by-step integration testing
- **[Test Coverage](development/test-coverage.md)** - Current test coverage status
- **[Testing Strategy](development/testing-strategy.md)** - Overall testing approach and patterns

---

## Common Tasks

### Installing Memory Bank MCP

```bash
# Using npx (no installation required)
npx @diaz3618/memory-bank-mcp --help

# Using Smithery (automatic installation for Claude Desktop)
npx -y @smithery/cli install @diaz3618/memory-bank-mcp --client claude

# Global installation
npm install -g @diaz3618/memory-bank-mcp
```

### Basic Usage

```bash
# Run with default settings
npx @diaz3618/memory-bank-mcp

# Run with specific mode
npx @diaz3618/memory-bank-mcp --mode code

# Run with custom project path
npx @diaz3618/memory-bank-mcp --path /path/to/project

# Run with remote server
npx @diaz3618/memory-bank-mcp --remote \
  --remote-user username \
  --remote-host server.example.com \
  --remote-path /home/username/memory-bank
```

### Integration Examples

**VS Code (.vscode/mcp.json):**
```json
{
  "servers": {
    "memory-bank-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["@diaz3618/memory-bank-mcp", "--mode", "code"]
    }
  }
}
```

**Claude Desktop (claude_desktop_config.json):**
```json
{
  "mcpServers": {
    "memory-bank-mcp": {
      "command": "npx",
      "args": ["@diaz3618/memory-bank-mcp"]
    }
  }
}
```

---

## Documentation Conventions

### Formatting

- **File names**: Use kebab-case (e.g., `memory-bank-status-prefix.md`)
- **Code blocks**: Include syntax highlighting (e.g., ```bash, ```json, ```typescript)
- **Headings**: Use descriptive headings with proper hierarchy
- **Links**: Use relative paths for internal documentation links

### Structure

Each documentation file should include:

1. **Title**: Clear, descriptive title
2. **Overview**: Brief summary of what the document covers
3. **Table of Contents**: For longer documents (optional)
4. **Content**: Well-organized sections with examples
5. **Related Links**: Links to related documentation

---

## Contributing to Documentation

We welcome documentation improvements! When contributing:

1. Follow the existing structure and formatting conventions
2. Place new documentation in the appropriate category
3. Update this README.md if adding new categories or major sections
4. Keep examples up-to-date and tested
5. Use clear, concise language
6. Add screenshots or diagrams where helpful

For more information, see [CONTRIBUTING.md](../CONTRIBUTING.md).

---

## Version Information

This documentation corresponds to **Memory Bank MCP v1.1.4**

For older versions, see the [CHANGELOG.md](../CHANGELOG.md) and check out the corresponding git tag.
