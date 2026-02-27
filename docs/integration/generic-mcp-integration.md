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
| `--mode <mode>` | Initial mode | — |
| `--username <name>` | Username for progress tracking | Unknown User |
| `--debug` | Enable debug logging | false |
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

- `switch_mode` — Switch mode, get current mode (no params), or manage UMB (`umb: true/false`)

### Knowledge Graph

- `graph_upsert_entity` — Create or update an entity
- `graph_add_observation` — Add observation to an entity
- `graph_link_entities` — Create or remove a relation (`action: "link"` or `"unlink"`)
- `graph_delete_entity` — Delete an entity or a specific observation (`observationId` param)
- `graph_maintain` — Rebuild, compact, or get stats (`operation: "rebuild"|"compact"|"stats"`)
- `graph_search` — Search by name or type
- `graph_open_nodes` — Get full entity details
- `graph_add_doc_pointer` — Add document pointer to entity

### Context

- `get_context_digest` — Compressed overview of all context
- `get_context_bundle` — Full context package
- `get_targeted_context` — Minimal context slice for a specific query
- `search_memory_bank` — Full-text search across Memory Bank files

### Stores & Backup

- `list_stores` — List registered stores
- `select_store` — Select, register, or unregister a store (`action: "select"|"register"|"unregister"`)
- `create_backup` — Create backup or list existing ones (`listOnly: true`)
- `restore_backup` — Restore from a backup

### Sequential Thinking

- `sequential_thinking` — Record a thinking step, or reset history (`reset: true`)
- `finalize_thinking_session` — Persist thinking session to Memory Bank

### Utilities

- `get_instructions` — Full tool catalog and workflow guide
- `debug_mcp_config` — Debug MCP and Memory Bank configuration
- `migrate_file_naming` — Migrate legacy camelCase file names to kebab-case
- `batch_read_files` — Read multiple files in one call
- `batch_write_files` — Write multiple files in one call

> **Deprecated (kept for backward compatibility)**: `get_current_mode`, `process_umb_command`, `complete_umb`, `graph_unlink_entities`, `graph_delete_observation`, `graph_rebuild`, `graph_compact`, `register_store`, `unregister_store`, `list_backups`, `reset_sequential_thinking`

## Recommended Session Workflow

### Session Start

```markdown
1. Call get_memory_bank_status → check if initialized
2. If not: call initialize_memory_bank
3. Call get_context_digest → load compressed context
4. Call graph_search with broad query → load relevant entities
```

### During Session

```markdown
1. Call track_progress after milestones
2. Call log_decision for important choices
3. Call add_session_note for observations
4. Use graph tools to update project knowledge
```

### Session End

```markdown
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
