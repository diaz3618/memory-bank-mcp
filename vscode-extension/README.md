# Memory Bank MCP Extension for VS Code

A Visual Studio Code extension that provides seamless integration with the Memory Bank MCP (Model Context Protocol) server. Give your AI assistants persistent memory across sessions, with built-in views, commands, and GitHub Copilot integration.

[![NPM Version](https://img.shields.io/npm/v/@diazstg/memory-bank-mcp.svg)](https://www.npmjs.com/package/@diazstg/memory-bank-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

### 🎯 Memory Bank Sidebar

- **Status View**: See connection status, mode, and Memory Bank health at a glance
- **Files View**: Browse and edit Memory Bank files (active-context.md, progress.md, etc.)
- **Actions**: Quick access to common operations
- **Mode Manager**: Switch between architect, code, debug, test, and ask modes
- **Knowledge Graph**: Browse entities, observations, and relationships
- **Multi-Store Support**: Manage multiple Memory Banks per project
- **Remote Servers**: Connect to SSH-based Memory Banks on remote machines

### 🤖 GitHub Copilot Integration

- **Language Model Tool**: Copilot can read Memory Bank context automatically
- **One-Click Setup**: Install `.github/copilot-instructions.md` with proper workflow
- **Automatic Context Loading**: System patterns, active context, and progress displayed to Copilot

### 🔧 Quick Actions

- Initialize Memory Bank in your workspace
- Install MCP server configuration (`.vscode/mcp.json`)
- Switch AI assistant modes with one click
- Search and visualize knowledge graph
- Create and link entities with observations
- View context digest summaries
- Manage remote SSH connections

## Installation

### From VSIX (Recommended)

1. Download the latest `.vsix` file from the [releases page](https://github.com/diaz3618/memory-bank-mcp/releases)
2. In VS Code: `Ctrl+Shift+P` → "Extensions: Install from VSIX"
3. Select the downloaded `.vsix` file

### From Source

```bash
cd vscode-extension
npm install
npm run compile
npm run package  # Creates .vsix file
```

Then install the generated `.vsix` file.

## Quick Start

### 1. Install the MCP Server

The extension requires the Memory Bank MCP server. Install it via one of these commands:

**Command Palette:**
- `Ctrl+Shift+P` → "Memory Bank: Install MCP Server"

This writes `.vscode/mcp.json` with the server configuration.

**Manual Installation:**

```bash
npm install -g @diazstg/memory-bank-mcp
```

### 2. Initialize Memory Bank

Click the Memory Bank icon in the Activity Bar, then:
- Click "Initialize Memory Bank" button, or
- `Ctrl+Shift+P` → "Memory Bank: Initialize Memory Bank"

This creates the `memory-bank/` folder with core files:
- `product-context.md` — Project overview and goals
- `active-context.md` — Current tasks and issues
- `progress.md` — Session history and milestones
- `decision-log.md` — Architectural decisions
- `system-patterns.md` — Code patterns and conventions

### 3. (Optional) Set Up GitHub Copilot Integration

To enable Copilot to automatically read Memory Bank context:

- `Ctrl+Shift+P` → "Memory Bank: Create Copilot Agent Instructions"

This creates `.github/copilot-instructions.md` with mandatory workflow instructions.

## Usage

### Memory Bank Views

#### Status View
Shows connection status, current mode, file count, and completion status. Use the refresh button to update.

**Actions:**
- Reconnect to MCP Server
- Show Logs (for troubleshooting)
- Initialize Memory Bank

#### Files View
Lists all Memory Bank files. Click to open and edit. Changes are automatically reflected in AI assistant context.

**Core Files:**
- `active-context.md` — Tasks, issues, blockers
- `progress.md` — What's been accomplished
- `product-context.md` — Project goals and requirements
- `decision-log.md` — Why decisions were made
- `system-patterns.md` — Coding conventions and patterns

#### Actions View
Quick access buttons for common operations:
- Set Memory Bank Path
- Switch Mode
- Show Context Digest
- Configure Server
- Create Copilot Agent Instructions

#### Mode View
Switch between AI assistant behavioral modes:
- **architect** — High-level design and planning
- **code** — Implementation and development
- **debug** — Troubleshooting and fixes
- **test** — Testing and validation
- **ask** — Lightweight Q&A mode

Each mode gets its own `.mcprules-{mode}` file with specific guidelines.

#### Knowledge Graph View
Browse and manage entities in your project's knowledge graph:
- Search entities by name or type
- View entity observations and relationships
- Create/update/delete entities
- Link related entities
- Add observations to entities
- Visualize graph in interactive webview

#### Stores View
Manage multiple Memory Banks per project:
- List registered stores
- Select active store
- Each store has independent context

#### Remote Servers View
Connect to Memory Banks on remote machines via SSH:
- Add remote server credentials
- Manage SSH keys
- Switch between local and remote Memory Banks

### Command Palette Commands

All commands available via `Ctrl+Shift+P` → "Memory Bank:":

**Setup:**
- Initialize Memory Bank
- Install MCP Server
- Configure MCP Server
- Create Copilot Agent Instructions

**Operations:**
- Set Memory Bank Path
- Refresh
- Reconnect to MCP Server
- Switch Mode
- Show Context Digest
- Show Logs

**Graph:**
- Search Graph
- Create/Update Entity
- Add Observation
- Link Entities
- Delete Entity/Observation
- Compact Graph
- Open Graph Visualization

**Remote:**
- Add Remote Server
- Refresh Remote Servers

## Configuration

The extension uses `.vscode/mcp.json` to configure the MCP server connection:

```json
{
  "servers": {
    "memory-bank-mcp": {
      "command": "npx",
      "args": ["-y", "@diazstg/memory-bank-mcp"],
      "env": {},
      "disabled": false
    }
  }
}
```

**Note:** If you installed the MCP server globally, you can use `"command": "memory-bank-mcp"` instead of npx.

### Extension Settings

Currently, the extension uses default settings. Configuration options may be added in future releases.

## GitHub Copilot Integration

When you create Copilot agent instructions via the extension, AI assistants will:

1. **Automatically read** Memory Bank context at task start
2. **Track progress** after completing milestones
3. **Log decisions** when making architectural choices
4. **Update active context** with tasks and next steps
5. **Maintain system patterns** with project conventions

The Language Model Tool provides:
- Current task list and blockers
- Recent progress history
- System patterns and conventions
- Mandatory workflow rules
- MCP tool reference

## Requirements

- **VS Code** 1.93.0 or higher
- **Node.js** 18+ (for MCP server)
- **Memory Bank MCP Server** (auto-installed via "Install MCP Server" command)

For remote servers:
- SSH access to target machine
- Memory Bank MCP server installed on remote machine

## Troubleshooting

### Extension not activating?

Check the Output panel: `View → Output → "Memory Bank Extension"`

### MCP Server not connecting?

1. Run: "Memory Bank: Show Logs" to see server output
2. Verify `.vscode/mcp.json` exists and is valid
3. Try: "Memory Bank: Reconnect to MCP Server"
4. Check that `@diazstg/memory-bank-mcp` is installed: `npm list -g @diazstg/memory-bank-mcp`

### "There is no data provider registered" error?

The extension failed to activate. Check:
1. Extension host logs: Help → Toggle Developer Tools → Console
2. Look for module resolution errors
3. Try reinstalling the extension

## Links

- **MCP Server Repository**: [github.com/diaz3618/memory-bank-mcp](https://github.com/diaz3618/memory-bank-mcp)
- **NPM Package**: [@diazstg/memory-bank-mcp](https://www.npmjs.com/package/@diazstg/memory-bank-mcp)
- **Documentation**: [github.com/diaz3618/memory-bank-mcp/tree/main/docs](https://github.com/diaz3618/memory-bank-mcp/tree/main/docs)
- **Issues**: [github.com/diaz3618/memory-bank-mcp/issues](https://github.com/diaz3618/memory-bank-mcp/issues)
- **MCP Protocol Spec**: [modelcontextprotocol.io](https://modelcontextprotocol.io)

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/diaz3618/memory-bank-mcp/blob/main/CONTRIBUTING.md) for guidelines.

## License

MIT License - See [LICENSE](LICENSE) file for details.

## Changelog

See [CHANGELOG.md](https://github.com/diaz3618/memory-bank-mcp/blob/main/CHANGELOG.md) for release history.

---

**Made with ❤️ for AI-assisted development**
