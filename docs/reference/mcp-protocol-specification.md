# Memory Bank MCP Protocol Specification

## Overview

This document specifies the Model Context Protocol (MCP) implementation for Memory Bank MCP. The protocol defines how AI assistants can interact with the Memory Bank through stdio-based JSON-RPC to maintain context and memory across sessions.

## Protocol Details

- **Protocol**: Model Context Protocol (MCP) 1.0
- **Transport**: stdio (standard input/output)
- **Message Format**: JSON-RPC 2.0
- **Server Type**: MCP Tool Server
- **Implementation**: TypeScript/Node.js

## Architecture

Memory Bank MCP is a **stdio-based MCP server**, not an HTTP server. Communication happens through:

```
┌──────────────────┐      JSON-RPC over      ┌──────────────────────┐
│  MCP Client      │      stdin/stdout       │  Memory Bank MCP     │
│  (AI Assistant)  │◄───────────────────────►│  Server              │
│                  │                         │                      │
│  - Claude        │                         │  - Provides tools    │
│  - Cursor        │                         │  - Provides resources│
│  - Cline         │                         │  - Manages files     │
│  - Custom        │                         │  - Tracks progress   │
└──────────────────┘                         └──────────────────────┘
```

## Server Initialization

Memory Bank MCP is started via the command line or through MCP client configuration:

```bash
npx @diazstg/memory-bank-mcp [options]
```

### Command Line Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--mode` | `-m` | Operational mode | - |
| `--path` | `-p` | Project path | Current directory |
| `--folder` | `-f` | Memory Bank folder name | memory-bank |
| `--username` | `-u` | Username for progress tracking | Unknown User |
| `--debug` | `-d` | Enable debug logging | false |
| `--remote` | `-r` | Enable remote server mode | false |

See full CLI documentation for remote server options.

### MCP Client Configuration

Example MCP client configuration (e.g., `mcp_config.json`):

```json
{
  "mcpServers": {
    "memory-bank-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@diazstg/memory-bank-mcp",
        "--mode", "code",
        "--username", "Alice"
      ],
      "type": "stdio"
    }
  }
}
```

## MCP Protocol Messages

### Initialization

When started, the server performs MCP initialization handshake:

1. **Client → Server**: `initialize` request with client capabilities
2. **Server → Client**: `initialize` response with server capabilities
3. **Client → Server**: `initialized` notification

The server exposes:
- **Tools**: 40+ tools for Memory Bank operations
- **Resources**: Memory Bank file access via `memory-bank://` URIs
- **Capabilities**: Tool execution, resource reading

### Tool Invocation

Tools are invoked via standard MCP `tools/call` request:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "track_progress",
    "arguments": {
      "action": "Feature Implementation",
      "description": "Implemented user authentication module"
    }
  }
}
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Progress tracked successfully. Updated progress.md with entry: [2026-02-13 10:30:00] [Alice] - Feature Implementation: Implemented user authentication module"
      }
    ],
    "isError": false
  }
}
```

### Resource Access

Resources use the `memory-bank://` URI scheme:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "resources/read",
  "params": {
    "uri": "memory-bank://active-context.md"
  }
}
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "contents": [
      {
        "uri": "memory-bank://active-context.md",
        "mimeType": "text/markdown",
        "text": "# Active Context\n\n## Current Tasks\n- Implement authentication\n- Add tests\n\n..."
      }
    ]
  }
}
```

## Available Tools

Memory Bank MCP provides the following tool categories:

### Core Tools

| Tool Name | Description |
|-----------|-------------|
| `initialize_memory_bank` | Create new Memory Bank |
| `set_memory_bank_path` | Change Memory Bank location |
| `get_memory_bank_status` | Get status and configuration |
| `read_memory_bank_file` | Read Memory Bank file |
| `write_memory_bank_file` | Write to Memory Bank file |
| `list_memory_bank_files` | List all Memory Bank files |
| `search_memory_bank` | Search Memory Bank content |
| `get_context_bundle` | Get all context in one call |
| `get_context_digest` | Get summarized context |

### Progress & Context Tools

| Tool Name | Description |
|-----------|-------------|
| `track_progress` | Log progress milestones |
| `add_progress_entry` | Add detailed progress entry |
| `update_active_context` | Update tasks, issues, next steps |
| `add_session_note` | Add session observation |
| `update_tasks` | Update task list |

### Decision Logging

| Tool Name | Description |
|-----------|-------------|
| `log_decision` | Log architectural/design decisions |

### Mode Management

| Tool Name | Description |
|-----------|-------------|
| `switch_mode` | Change operational mode |
| `get_current_mode` | Get current mode info |
| `process_umb_command` | Process "Update Memory Bank" command |
| `complete_umb` | Complete UMB operation |

### Knowledge Graph Tools

| Tool Name | Description |
|-----------|-------------|
| `graph_search` | Search knowledge graph |
| `graph_upsert_entity` | Create/update entity |
| `graph_add_observation` | Add observation to entity |
| `graph_link_entities` | Create relationships |
| `graph_unlink_entities` | Remove relationships |
| `graph_open_nodes` | Get entity details |
| `graph_delete_entity` | Delete entity |
| `graph_delete_observation` | Delete observation |
| `graph_rebuild` | Rebuild graph |
| `graph_compact` | Compact graph storage |

### Memory Bank Stores

| Tool Name | Description |
|-----------|-------------|
| `list_stores` | List all Memory Bank stores |
| `select_store` | Switch active store |
| `register_store` | Register new store |
| `unregister_store` | Unregister store |

### Backup & Restore

| Tool Name | Description |
|-----------|-------------|
| `create_backup` | Create Memory Bank backup |
| `list_backups` | List available backups |
| `restore_backup` | Restore from backup |

### Batch Operations

| Tool Name | Description |
|-----------|-------------|
| `batch_read_files` | Read multiple files |
| `batch_write_files` | Write multiple files |

## Tool Schemas

Each tool has a JSON Schema defining its parameters. Example for `track_progress`:

```json
{
  "name": "track_progress",
  "description": "Tracks progress by adding an entry to the progress file",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "description": "The action performed (e.g., 'Implemented feature', 'Fixed bug')"
      },
      "description": {
        "type": "string",
        "description": "Detailed description of what was accomplished"
      },
      "filename": {
        "type": "string",
        "description": "Optional filename related to the action"
      },
      "status": {
        "type": "string",
        "enum": ["success", "error", "warning"],
        "description": "Optional status of the action"
      }
    },
    "required": ["action", "description"]
  }
}
```

## Resources

Memory Bank files are exposed as MCP resources with the `memory-bank://` URI scheme:

| URI | Description |
|-----|-------------|
| `memory-bank://active-context.md` | Current project state |
| `memory-bank://progress.md` | Progress history |
| `memory-bank://decision-log.md` | Decision history |
| `memory-bank://system-patterns.md` | System architecture patterns |
| `memory-bank://product-context.md` | Product and project information |

Resources support:
- **List**: Get all available resources
- **Read**: Get resource content as text or binary
- **Subscribe**: Receive updates when resources change (if supported by client)

## Operational Modes

Memory Bank MCP supports five operational modes that affect tool availability and behavior:

| Mode | Purpose | Key Tools |
|------|---------|-----------|
| `architect` | System design and planning | `log_decision`, knowledge graph tools |
| `code` | Implementation and coding | `track_progress`, file operations |
| `ask` | Questions and information | `search_memory_bank`, `get_context_digest` |
| `debug` | Troubleshooting and fixing | `add_session_note`, graph search |
| `test` | Testing and quality assurance | `track_progress`, file operations |

Modes can be switched via CLI `--mode` flag or the `switch_mode` tool.

## Error Handling

Errors follow MCP standard error responses:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "error": {
    "code": -32000,
    "message": "Memory Bank not found at path: /invalid/path",
    "data": {
      "expectedPath": "/invalid/path/memory-bank",
      "suggestion": "Use initialize_memory_bank to create a new Memory Bank"
    }
  }
}
```

Common error codes:
- `-32000`: Server error (e.g., Memory Bank not found, file operation failed)
- `-32601`: Method not found (invalid tool name)
- `-32602`: Invalid params (incorrect tool parameters)

## Logging

The server logs to stderr (not stdout, to avoid interfering with JSON-RPC):

```
[2026-02-13T10:30:00.000Z] [INFO] [MemoryBankServer] Server started
[2026-02-13T10:30:01.000Z] [DEBUG] [CoreTools] Tool called: track_progress
[2026-02-13T10:30:01.100Z] [INFO] [ProgressTracker] Progress tracked successfully
```

Enable debug logging with `--debug` flag.

## Remote Server Support

Memory Bank MCP supports SSH-based remote file systems:

```bash
npx @diazstg/memory-bank-mcp \
  --remote \
  --remote-user username \
  --remote-host example.com \
  --remote-path /home/username/memory-bank \
  --ssh-key ~/.ssh/id_rsa
```

All file operations transparently use SSH when remote mode is enabled.

## Extensibility

Memory Bank MCP is designed for extensibility:

### Custom Stores

Register multiple Memory Bank stores:

```javascript
// Via list_stores, select_store, register_store tools
```

### Knowledge Graph

Build project-specific knowledge graphs with custom entity types and relationships.

### Batch Operations

Efficient multi-file operations via `batch_read_files` and `batch_write_files`.

## Security Considerations

1. **File System Access**: Server has access to the Memory Bank directory and project files
2. **SSH Keys**: Remote mode requires SSH private key access
3. **Tool Execution**: All tool calls are logged for audit trail
4. **User Attribution**: Progress entries include username for accountability

## Implementation Notes

- **Language**: TypeScript/Node.js
- **Dependencies**: @modelcontextprotocol/sdk, Node.js built-ins
- **File Storage**: Local file system or SSH remote
- **Knowledge Graph**: JSONL storage with in-memory index
- **Concurrency**: Write queue for knowledge graph operations

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.7.0 | 2026-02-13 | Added research tools, fixed mode switching, renamed --githubProfileUrl to --username |
| 1.6.0 | 2026-02-10 | Added knowledge graph tools |
| 1.5.0 | 2026-02-08 | Added store management |
| 1.0.0 | 2025-12-01 | Initial MCP protocol implementation |

## References

- [Model Context Protocol Specification](https://modelcontextprotocol.io/docs)
- [MCP SDK Documentation](https://github.com/ModelContext/sdk)
- [Memory Bank MCP GitHub](https://github.com/diaz3618/memory-bank-mcp)

---

*Model Context Protocol implementation for persistent AI assistant memory*
