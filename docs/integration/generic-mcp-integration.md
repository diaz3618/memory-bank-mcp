# Generic MCP Client Integration

This guide covers integrating Memory Bank MCP with any client that supports the Model Context Protocol (MCP).

## Configuration

All MCP clients use a similar configuration pattern:

```json
{
  "command": "npx",
  "args": ["-y", "@diazstg/memory-bank-mcp"]
}
```

### Common CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--path <dir>` | Project directory | Current working directory |
| `--folder <name>` | Memory bank folder name | `memory-bank` |
| `--mode <mode>` | Initial mode | `code` |
| `--remote` | Use SSH remote storage | — |

### Client-Specific Configuration

| Client | Config Location |
|--------|----------------|
| VS Code | `.vscode/mcp.json` |
| Cursor | `.cursor/mcp.json` or settings |
| Claude Desktop | `~/.claude/claude_desktop_config.json` |
| Claude Code | `claude mcp add` or `~/.claude/claude_desktop_config.json` |
| Cline | `.vscode/mcp.json` or Cline settings |
| Roo Code | `.vscode/mcp.json` or Roo Code settings |
| Codex | Environment configuration |
| Gemini CLI | MCP server configuration |
| Qwen Coder | MCP server configuration |

## Available Tools

After connecting, the client has access to these MCP tools:

### Core
- `initialize_memory_bank` — Create the memory bank directory and files
- `get_memory_bank_status` — Check if memory bank exists and is active
- `read_memory_bank_file` — Read a specific markdown file
- `write_memory_bank_file` — Write content to a file

### Progress & Decisions
- `track_progress` — Log a progress entry
- `add_progress_entry` — Add a structured entry
- `log_decision` — Record a decision with rationale
- `update_active_context` — Update current tasks and state

### Modes
- `switch_mode` — Change to architect/ask/code/debug/test
- `get_current_mode` — Get current mode and rules

### Knowledge Graph
- `graph_upsert_entity` — Create or update an entity
- `graph_add_observation` — Add observation to an entity
- `graph_delete_observation` — Remove an observation
- `graph_link_entities` — Create a relation
- `graph_unlink_entities` — Remove a relation
- `graph_delete_entity` — Delete an entity
- `graph_search` — Search by name or type
- `graph_open_nodes` — Get full entity details
- `graph_compact` — Compact the event log

### Context
- `get_context_digest` — Compressed overview of all context
- `get_context_bundle` — Full context package

## Recommended Session Workflow

### Session Start
```
1. Call get_memory_bank_status → check if initialized
2. If not: call initialize_memory_bank
3. Call get_context_digest → load compressed context
4. Call graph_search with broad query → load relevant entities
```

### During Session
```
1. Call track_progress after milestones
2. Call log_decision for important choices
3. Call add_session_note for observations
4. Use graph tools to update project knowledge
```

### Session End
```
1. Call update_active_context with current state
2. Call track_progress with session summary
```

## Modes

Modes control the AI's behavior and tool permissions via `.clinerules-{mode}` files:

| Mode | Focus |
|------|-------|
| `architect` | System design and planning |
| `code` | Implementation and development |
| `ask` | Q&A and information retrieval |
| `debug` | Troubleshooting and diagnostics |
| `test` | Testing and quality assurance |

Missing `.clinerules-*` files are auto-created from templates during initialization. Modes work with any MCP client — they are not tied to any specific editor or extension.
