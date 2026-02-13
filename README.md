# Memory Bank MCP

[![NPM Version](https://img.shields.io/npm/v/@diazstg/memory-bank-mcp.svg)](https://www.npmjs.com/package/@diazstg/memory-bank-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An MCP server that gives AI assistants persistent memory across sessions. It stores project context, decisions, and progress in structured markdown files — locally or on a remote server via SSH.

## Quick Start

```bash
# Run directly (no install needed)
npx @diazstg/memory-bank-mcp

# Or install globally
npm install -g @diazstg/memory-bank-mcp
```

### Via Smithery (Claude Desktop)

```bash
npx -y @smithery/cli install @diazstg/memory-bank-mcp --client claude
```

## Configuration

Add to your editor's MCP config (`.vscode/mcp.json`, Cursor, Claude Desktop, etc.):

```json
{
  "servers": {
    "memory-bank-mcp": {
      "command": "npx",
      "args": ["-y", "@diazstg/memory-bank-mcp"]
    }
  }
}
```

### Common Options

```bash
npx @diazstg/memory-bank-mcp --mode code          # Set operational mode
npx @diazstg/memory-bank-mcp --path /my/project    # Custom project path
npx @diazstg/memory-bank-mcp --folder my-memory    # Custom folder name (default: memory-bank)
npx @diazstg/memory-bank-mcp --help                # All options
```

### Remote Server (SSH)

Store your Memory Bank on a remote server:

```bash
npx @diazstg/memory-bank-mcp --remote \
  --remote-user username \
  --remote-host example.com \
  --remote-path /home/username/memory-bank \
  --ssh-key ~/.ssh/id_ed25519
```

See [Remote Server Guide](docs/guides/remote-server.md) and [SSH Keys Guide](docs/guides/ssh-keys-guide.md).

## How It Works

Memory Bank stores project context as markdown files in a `memory-bank/` directory:

| File | Purpose |
|------|---------|
| `product-context.md` | Project overview, goals, tech stack |
| `active-context.md` | Current state, ongoing tasks, next steps |
| `progress.md` | Chronological record of updates |
| `decision-log.md` | Decisions with context and rationale |
| `system-patterns.md` | Architecture and code patterns |

The AI assistant reads these files at the start of each session and updates them as work progresses, maintaining continuity across conversations.

## MCP Tools

| Tool | Description |
|------|-------------|
| `initialize_memory_bank` | Create a new Memory Bank |
| `get_memory_bank_status` | Check current status |
| `read_memory_bank_file` | Read a specific file |
| `write_memory_bank_file` | Write/update a file |
| `track_progress` | Add a progress entry |
| `log_decision` | Record a decision |
| `update_active_context` | Update current context |
| `switch_mode` | Change operational mode |
| `graph_upsert_entity` | Create or update a knowledge graph entity |
| `graph_add_observation` | Add an observation to an entity |
| `graph_link_entities` | Create a relation between entities |
| `graph_search` | Search entities by name or type |
| `graph_open_nodes` | Get full details of specific entities |
| `graph_compact` | Compact the event log |

## Modes

| Mode | Focus |
|------|-------|
| `code` | Implementation and development |
| `architect` | System design and planning |
| `ask` | Q&A and information retrieval |
| `debug` | Troubleshooting and diagnostics |
| `test` | Testing and quality assurance |

Modes can be set via CLI (`--mode code`), tool call (`switch_mode`), or `.clinerules-[mode]` files. See [Usage Modes](docs/guides/usage-modes.md).

## As a Library

```typescript
import { MemoryBankServer } from "@diazstg/memory-bank-mcp";

const server = new MemoryBankServer();
server.run().catch(console.error);
```

## Documentation

| Topic | Link |
|-------|------|
| Getting Started | [npx usage](docs/getting-started/npx-usage.md), [build with Bun](docs/getting-started/build-with-bun.md), [custom folder](docs/getting-started/custom-folder-name.md) |
| Guides | [Remote server](docs/guides/remote-server.md), [SSH keys](docs/guides/ssh-keys-guide.md), [usage modes](docs/guides/usage-modes.md), [status system](docs/guides/memory-bank-status-prefix.md), [migration](docs/guides/migration-guide.md), [debug MCP](docs/guides/debug-mcp-config.md) |
| Integrations | [VS Code/Copilot](docs/integration/vscode-copilot-integration.md), [Claude Code](docs/integration/claude-code-integration.md), [Cursor](docs/integration/cursor-integration.md), [Cline](docs/integration/cline-integration.md), [Roo Code](docs/integration/roo-code-integration.md), [generic MCP](docs/integration/generic-mcp-integration.md) |
| Reference | [MCP protocol](docs/reference/mcp-protocol-specification.md), [rules format](docs/reference/rule-formats.md), [file naming](docs/reference/file-naming-convention.md) |
| Development | [Architecture](ARCHITECTURE.md), [testing](docs/development/testing-guide.md), [logging](docs/development/logging-system.md) |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
