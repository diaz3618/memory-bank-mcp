# MCP Server Development

## Overview

Guide for developing and extending the Memory Bank MCP server. This project implements the Model Context Protocol (MCP) using `@modelcontextprotocol/sdk` v1.6.1, communicating via stdio transport.

## Architecture

```
src/
├── index.ts                      # Entry point, CLI arg parsing, server init
├── core/
│   ├── MemoryBankManager.ts      # Memory bank lifecycle (init, read, write, find)
│   ├── ProgressTracker.ts        # Progress/decision tracking
│   └── templates/                # Markdown templates for memory bank files
├── server/
│   ├── MemoryBankServer.ts       # Main MCP server class
│   ├── tools/                    # Tool definitions and handlers
│   │   ├── CoreTools.ts          # initialize, read, write, find, status, debug
│   │   ├── ProgressTools.ts      # track_progress
│   │   ├── ContextTools.ts       # update_active_context
│   │   ├── DecisionTools.ts      # log_decision
│   │   ├── ModeTools.ts          # switch_mode, get_mode_info
│   │   └── index.ts              # Tool registration and dispatch
│   └── resources/                # MCP resource definitions
├── utils/
│   ├── FileUtils.ts              # Atomic writes, file operations
│   ├── ETagUtils.ts              # Optimistic concurrency (ETags)
│   ├── SshUtils.ts               # SSH command execution
│   ├── LogManager.ts             # Centralized logging singleton
│   ├── ModeManager.ts            # Mode detection and switching (EventEmitter)
│   ├── ExternalRulesLoader.ts    # .clinerules file loading
│   ├── MigrationUtils.ts         # File naming migration
│   └── storage/
│       ├── FileSystemInterface.ts  # Abstract FS interface
│       ├── FileSystemFactory.ts    # Factory for FS implementations
│       ├── LocalFileSystem.ts      # Local FS implementation
│       └── RemoteFileSystem.ts     # SSH-based remote FS
└── types/                        # Type definitions, constants, guards
```

## MCP Protocol Basics

### Server Initialization

The server uses stdio transport:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  { name: '@diaz3618/memory-bank-mcp', version: '0.5.0' },
  { capabilities: { tools: {}, resources: {} } }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Tool Definition Pattern

Each tool has a definition (schema) and a handler:

```typescript
// 1. Define the tool schema
export const myTools = [
  {
    name: 'my_tool_name',
    description: 'What this tool does',
    inputSchema: {
      type: 'object',
      properties: {
        param1: {
          type: 'string',
          description: 'Description of param1',
        },
        param2: {
          type: 'boolean',
          description: 'Optional flag',
          default: false,
        },
      },
      required: ['param1'],
    },
  },
];

// 2. Handle the tool call
async function handleMyTool(args: Record<string, unknown>): Promise<ToolResult> {
  const param1 = args.param1 as string;

  try {
    // Do work...
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: true, data: result }) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
      isError: true,
    };
  }
}
```

### Tool Response Format

All tools return content as an array of content blocks:

```typescript
// Success response
{
  content: [{ type: 'text', text: JSON.stringify(resultData) }]
}

// Error response
{
  content: [{ type: 'text', text: 'Error message' }],
  isError: true
}
```

## Adding a New Tool

1. **Define the tool** in the appropriate file under `src/server/tools/`:
   - Core operations: `CoreTools.ts`
   - Progress/tracking: `ProgressTools.ts`
   - Context management: `ContextTools.ts`
   - Decision logging: `DecisionTools.ts`
   - Mode operations: `ModeTools.ts`

2. **Register the tool** in `src/server/tools/index.ts`

3. **Add the handler** in the tool dispatch logic

4. **Write tests** in `src/__tests__/server/`

## Existing Tools Reference

| Tool | Purpose |
|------|---------|
| `initialize_memory_bank` | Create memory bank in a directory |
| `set_memory_bank_path` | Set custom path for memory bank |
| `debug_mcp_config` | Debug current MCP configuration |
| `read_memory_bank_file` | Read file with ETag support |
| `write_memory_bank_file` | Write file with optimistic concurrency |
| `find_memory_bank` | Locate existing memory bank |
| `get_memory_bank_status` | Get current status |
| `track_progress` | Track progress with action/description |
| `update_active_context` | Update tasks, issues, next steps |
| `log_decision` | Log decisions with context/alternatives |
| `switch_mode` | Switch operational mode |
| `get_mode_info` | Get current mode information |

## File System Abstraction

All file operations go through `FileSystemInterface`:

```typescript
// Never use fs directly in tool handlers
// Instead, use the file system from the manager
const fs: FileSystemInterface = FileSystemFactory.create(config);

await fs.fileExists(path);
await fs.readFile(path);
await fs.writeFile(path, content);
await fs.ensureDirectory(path);
await fs.listFiles(path);
```

This abstraction enables both local and remote (SSH) storage backends.

## Optimistic Concurrency Control

File writes support ETags to prevent lost updates:

```typescript
// Read file with ETag
const content = await fs.readFile(filePath);
const etag = ETagUtils.generateETag(content);

// Write with ETag check (fails if file changed since read)
await writeMemoryBankFile(filePath, newContent, etag);
```

## Memory Bank Files

Standard files created during initialization:

| File | Purpose |
|------|---------|
| `product-context.md` | Project overview, objectives, tech stack |
| `active-context.md` | Current tasks, issues, next steps |
| `progress.md` | Chronological progress log |
| `decision-log.md` | Architectural decisions with rationale |
| `system-patterns.md` | Code and architecture patterns |

## Operational Modes

Five modes optimize AI interactions: `code`, `architect`, `ask`, `debug`, `test`.

Modes are managed by `ModeManager` (extends `EventEmitter`):

```typescript
// Mode changes emit events
modeManager.on('MODE_CHANGED', (newMode) => {
  logger.info('ModeManager', `Switched to ${newMode} mode`);
});
```

## Security Requirements

- Validate all file paths with `validateFilename()` before operations
- Only allow `.md` and `.json` extensions
- Prevent path traversal (`../`, `./`, backslashes, null bytes)
- SSH uses key-based authentication only
- StrictHostKeyChecking enabled for SSH connections

## IDE Configuration

### VS Code (`.vscode/mcp.json`)

```json
{
  "servers": {
    "memory-bank-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["build/index.js", "--mode", "code"]
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "memory-bank": {
      "command": "node",
      "args": ["build/index.js", "--path", "/path", "--folder", "memory-bank"]
    }
  }
}
```
