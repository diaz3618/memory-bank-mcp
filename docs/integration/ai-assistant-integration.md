# AI Assistant Integration Guide

This guide explains how to integrate Memory Bank MCP with AI assistants through the Model Context Protocol (MCP).

## Overview

Memory Bank MCP is a **stdio-based MCP server** that provides AI assistants with:

- Persistent memory and context across sessions
- Progress tracking and decision logging 
- Project-specific knowledge management
- Multiple operational modes (architect, code, ask, debug, test)
- Knowledge graph for project relationships

## Supported AI Assistants

Memory Bank MCP works with any AI assistant that supports the Model Context Protocol via stdio transport:

- **Claude Desktop** - Native MCP support
- **Cursor** - See [Cursor Integration Guide](./cursor-integration.md)
- **Cline** - Includes `.clinerules` support, see [Cline Integration Guide](./cline-integration.md)
- **Roo Code** - See [Roo Code Integration Guide](./roo-code-integration.md)
- **Claude Code** - See [Claude Code Integration Guide](./claude-code-integration.md)
- **VS Code Copilot** - See [VS Code Copilot Integration Guide](./vscode-copilot-integration.md)
- **Any MCP-compatible client** - See [Generic MCP Integration Guide](./generic-mcp-integration.md)

## Architecture

Memory Bank MCP uses the Model Context Protocol stdio transport:

```
┌─────────────────────┐      stdio (JSON-RPC)    ┌──────────────────────┐
│   AI Assistant      │◄───────────────────────►│  Memory Bank MCP     │
│                     │  stdin/stdout            │  Server              │
│  (Claude, Cursor,   │                          │                      │
│   Cline, etc.)      │                          │  • Tools             │
│                     │                          │  • Resources         │
│                     │                          │  • File Management   │
└─────────────────────┘                          └──────────────────────┘
                                                          │
                                                          ▼
                                                 ┌──────────────────┐
                                                 │  Memory Bank     │
                                                 │  Directory       │
                                                 │                  │
                                                 │  • Core files    │
                                                 │  • Knowledge     │
                                                 │    graph         │
                                                 │  • .clinerules   │
                                                 └──────────────────┘
```

## MCP Configuration

### Basic Setup

Add Memory Bank MCP to your AI assistant's MCP configuration (typically `mcp_config.json`):

```json
{
  "mcpServers": {
    "memory-bank-mcp": {
      "command": "npx",
      "args": ["-y", "@diazstg/memory-bank-mcp"],
      "type": "stdio"
    }
  }
}
```

### Configuration with Options

```json
{
  "mcpServers": {
    "memory-bank-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@diazstg/memory-bank-mcp",
        "--mode", "code",
        "--folder", "memory-bank",
        "--username", "YourName"
      ],
      "type": "stdio"
    }
  }
}
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--mode <mode>` | Operational mode: architect, code, ask, debug, test | - |
| `--path <path>` | Project path | Current directory |
| `--folder <name>` | Memory Bank folder name | memory-bank |
| `--username <name>` | Username for progress tracking | Unknown User |
| `--debug` | Enable debug logging | false |

See [Generic MCP Integration Guide](./generic-mcp-integration.md) for complete CLI documentation.

## Available Tools

Once configured, the AI assistant has access to these MCP tools:

### Core Tools

- `initialize_memory_bank` - Create new Memory Bank
- `set_memory_bank_path` - Change Memory Bank location
- `get_memory_bank_status` - Get status and configuration
- `read_memory_bank_file` - Read Memory Bank file
- `write_memory_bank_file` - Write to Memory Bank file
- `list_memory_bank_files` - List all Memory Bank files
- `search_memory_bank` - Search Memory Bank content
- `get_context_bundle` - Get all context in one call
- `get_context_digest` - Get summarized context

### Progress & Context Tools

- `track_progress` - Log progress milestones
- `add_progress_entry` - Add detailed progress entry
- `update_active_context` - Update tasks, issues, next steps
- `add_session_note` - Add session observation
- `update_tasks` - Update task list

### Decision Logging

- `log_decision` - Log architectural/design decisions

### Mode Management

- `switch_mode` - Change operational mode
- `get_current_mode` - Get current mode info
- `process_umb_command` - Process "Update Memory Bank" command
- `complete_umb` - Complete UMB operation

### Knowledge Graph

- `graph_search` - Search knowledge graph
- `graph_upsert_entity` - Create/update entity
- `graph_add_observation` - Add observation to entity
- `graph_link_entities` - Create relationships
- `graph_unlink_entities` - Remove relationships
- `graph_open_nodes` - Get entity details
- `graph_delete_entity` - Delete entity
- `graph_delete_observation` - Delete observation
- `graph_rebuild` - Rebuild graph
- `graph_compact` - Compact graph storage

### Memory Bank Stores

- `list_stores` - List all Memory Bank stores
- `select_store` - Switch active store
- `register_store` - Register new store
- `unregister_store` - Unregister store

### Backup & Restore

- `create_backup` - Create Memory Bank backup
- `list_backups` - List available backups
- `restore_backup` - Restore from backup

### Batch Operations

- `batch_read_files` - Read multiple files
- `batch_write_files` - Write multiple files

## Integration Patterns

### Pattern 1: Start-of-Session Context Loading

**Best Practice**: Load context at the beginning of each session.

```typescript
// AI assistant calls at session start:
const context = await mcp.callTool('get_context_digest', {
  random_string: 'init'
});

// Use context.content for system prompt
```

### Pattern 2: Progress Tracking

**Best Practice**: Track milestones after significant work.

```typescript
// After completing a feature:
await mcp.callTool('track_progress', {
  action: 'Feature Implementation',
  description: 'Completed user authentication module'
});
```

### Pattern 3: Decision Logging

**Best Practice**: Log architectural decisions when made.

```typescript
// After making a design decision:
await mcp.callTool('log_decision', {
  title: 'Database Selection',
  context: 'Needed to choose database for new feature',
  decision: 'Selected PostgreSQL for reliability and features',
  alternatives: ['MySQL', 'MongoDB'],
  consequences: ['Need to set up PostgreSQL server', 'Strong ACID guarantees']
});
```

### Pattern 4: Mode-Specific Behavior

**Best Practice**: Switch modes based on task type.

```typescript
// When starting architectural work:
await mcp.callTool('switch_mode', {
  mode: 'architect'
});

// When implementing code:
await mcp.callTool('switch_mode', {
  mode: 'code'
});

// When debugging:
await mcp.callTool('switch_mode', {
  mode: 'debug'
});
```

### Pattern 5: Knowledge Graph Usage

**Best Practice**: Use the knowledge graph for project understanding.

```typescript
// Search for related concepts:
const results = await mcp.callTool('graph_search', {
  query: 'authentication',
  store_id: 'default',
  limit: 10
});

// Add new relationships:
await mcp.callTool('graph_link_entities', {
  from_entity_name: 'UserService',
  to_entity_name: 'AuthModule',
  relation_type: 'depends_on',
  store_id: 'default'
});
```

## Mode-Specific Integration

Memory Bank MCP supports five operational modes, each optimized for different tasks:

### Architect Mode

**Use When**: Designing system architecture, planning components, making high-level decisions.

**Tools to Emphasize**:
- `log_decision` - Document architectural choices
- `update_active_context` - Update system design status
- `graph_upsert_entity` - Model system components
- `graph_link_entities` - Model component relationships

**Example System Prompt**:
```
You are in Architect mode. Focus on high-level system design, component relationships,
and architectural decisions. Use the knowledge graph to model system structure.
```

### Code Mode

**Use When**: Writing implementation code, refactoring, adding features.

**Tools to Emphasize**:
- `track_progress` - Log completed implementations
- `add_session_note` - Note code observations
- `read_memory_bank_file` - Reference system patterns
- `update_active_context` - Update implementation tasks

**Example System Prompt**:
```
You are in Code mode. Focus on clean implementation, following established patterns,
and tracking progress on coding tasks.
```

### Ask Mode

**Use When**: Answering questions, explaining concepts, providing information.

**Tools to Emphasize**:
- `get_context_digest` - Get full project context
- `search_memory_bank` - Find relevant information
- `graph_search` - Find related concepts
- `read_memory_bank_file` - Read documentation

**Example System Prompt**:
```
You are in Ask mode. Provide informative answers based on project context and
existing documentation. Use Memory Bank to find accurate information.
```

### Debug Mode

**Use When**: Investigating bugs, analyzing errors, troubleshooting issues.

**Tools to Emphasize**:
- `add_session_note` - Log debugging observations
- `track_progress` - Log bug fixes
- `graph_search` - Find related components
- `update_active_context` - Update known issues

**Example System Prompt**:
```
You are in Debug mode. Focus on systematic problem identification, root cause
analysis, and thorough testing of fixes.
```

### Test Mode

**Use When**: Writing tests, improving test coverage, ensuring quality.

**Tools to Emphasize**:
- `track_progress` - Log test additions
- `add_session_note` - Note testing observations
- `update_active_context` - Update testing tasks

**Example System Prompt**:
```
You are in Test mode. Focus on comprehensive test coverage, edge cases,
and maintaining test quality.
```

## Troubleshooting

### Memory Bank Not Found

**Symptom**: "Memory Bank not found" errors

**Solution**:
```json
// Use set_memory_bank_path to configure location:
await mcp.callTool('set_memory_bank_path', {
  path: '/absolute/path/to/memory-bank'
});

// Or initialize a new one:
await mcp.callTool('initialize_memory_bank', {
  path: './memory-bank'
});
```

### MCP Server Not Responding

**Symptom**: Tool calls timeout or fail

**Solutions**:
1. Verify npx can access the package: `npx @diazstg/memory-bank-mcp --help`
2. Check MCP configuration syntax in your AI assistant settings
3. Enable debug logging: `--debug` flag in MCP args
4. Clear npx cache: `npx clear-npx-cache`
5. Restart your AI assistant

### Username Shows "Unknown User"

**Symptom**: Progress entries show "[Unknown User]" in timestamps

**Solution**: Add `--username` flag to MCP configuration:
```json
"args": [
  "-y",
  "@diazstg/memory-bank-mcp",
  "--username", "YourName"
]
```

## Best Practices

### 1. Initialize Early

Create Memory Bank at project start:
```typescript
await mcp.callTool('initialize_memory_bank', {
  path: './memory-bank'
});
```

### 2. Track Regularly

Record progress and decisions as they happen, not after the fact.

### 3. Use Appropriate Modes

Switch modes based on current task for optimized tool selection and behavior.

### 4. Maintain Context

Regularly update active context with current tasks, known issues, and next steps.

### 5. Leverage Knowledge Graph

Use the graph to model project relationships for better context understanding.

### 6. Backup Regularly

Create backups before major changes:
```typescript
await mcp.callTool('create_backup', {
  backup_name: 'before-refactor'
});
```

## Example: Claude Desktop Integration

For Claude Desktop, add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "memory-bank": {
      "command": "npx",
      "args": [
        "-y",
        "@diazstg/memory-bank-mcp",
        "--mode", "code",
        "--username", "Claude"
      ]
    }
  }
}
```

Then restart Claude Desktop. Memory Bank tools will appear in Claude's tool palette.

## Example: Custom AI Assistant Integration

For custom AI assistants using the MCP SDK:

```typescript
import { McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Create stdio transport
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@diazstg/memory-bank-mcp', '--mode', 'code']
});

// Create MCP client
const client = new McpClient({
  name: 'my-ai-assistant',
  version: '1.0.0'
}, {
  capabilities: {
    tools: {}
  }
});

// Connect
await client.connect(transport);

// List available tools
const { tools } = await client.listTools();
console.log('Available tools:', tools.map(t => t.name));

// Call a tool
const result = await client.callTool({
  name: 'get_context_digest',
  arguments: { random_string: 'status' }
});
console.log('Context:', result.content);
```

## See Also

- [Generic MCP Integration Guide](./generic-mcp-integration.md) - Full MCP configuration reference
- [Cursor Integration Guide](./cursor-integration.md) - Cursor-specific setup
- [Cline Integration Guide](./cline-integration.md) - Cline + `.clinerules` integration
- [Memory Bank Documentation](../../README.md) - Complete project documentation
- [Model Context Protocol Specification](https://github.com/ModelContext/protocol) - MCP standard

---

*Memory Bank MCP - Persistent memory and context for AI assistants*
