# Memory Bank MCP Protocol Specification

## Overview

This document specifies the Model Context Protocol (MCP) implementation for Memory Bank MCP. The protocol defines how AI assistants can interact with the Memory Bank to maintain context and memory across sessions.

## Protocol Version

- **Protocol Version**: 1.0.0
- **Compatibility**: Compatible with MCP 1.0 specification

## Endpoints

### Base URL

All API endpoints are relative to the base URL of the Memory Bank MCP server:

```
http://localhost:3000
```

### Status Endpoint

**GET /status**

Returns the status of the Memory Bank MCP server.

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "memoryBankStatus": "initialized"
}
```

### Memory Bank File Endpoints

**GET /memory-bank/file/:filename**

Retrieves the content of a Memory Bank file.

**Parameters:**
- `filename` (path parameter): The name of the file to retrieve

**Response:**
```json
{
  "content": "# File Content\n\nThis is the content of the file.",
  "status": "success"
}
```

**POST /memory-bank/file**

Creates or updates a Memory Bank file.

**Request Body:**
```json
{
  "filename": "example.md",
  "content": "# Example File\n\nThis is an example file."
}
```

**Response:**
```json
{
  "status": "success",
  "message": "File written successfully"
}
```

**DELETE /memory-bank/file/:filename**

Deletes a Memory Bank file.

**Parameters:**
- `filename` (path parameter): The name of the file to delete

**Response:**
```json
{
  "status": "success",
  "message": "File deleted successfully"
}
```

### Memory Bank Management Endpoints

**GET /memory-bank/files**

Lists all files in the Memory Bank.

**Response:**
```json
{
  "files": [
    "activeContext.md",
    "productContext.md",
    "progress.md",
    "decisionLog.md",
    "systemPatterns.md"
  ],
  "status": "success"
}
```

**GET /memory-bank/modes**

Lists all available modes in the Memory Bank.

**Response:**
```json
{
  "modes": [
    "architect",
    "code",
    "ask",
    "debug",
    "test"
  ],
  "status": "success"
}
```

**POST /memory-bank/trackProgress**

Tracks progress in the Memory Bank.

**Request Body:**
```json
{
  "action": "Implementation",
  "description": "Implemented feature X",
  "updateActiveContext": true
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Progress tracked successfully"
}
```

**POST /memory-bank/logDecision**

Logs a decision in the Memory Bank.

**Request Body:**
```json
{
  "title": "Authentication Method",
  "context": "We need to choose an authentication method for our API",
  "decision": "Use JWT for authentication",
  "alternatives": [
    "Session-based authentication",
    "OAuth 2.0",
    "API keys"
  ],
  "consequences": [
    "Stateless authentication",
    "Easy to implement across different platforms",
    "Need to handle token expiration and refresh"
  ]
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Decision logged successfully"
}
```

**POST /memory-bank/updateActiveContext**

Updates the active context in the Memory Bank.

**Request Body:**
```json
{
  "tasks": [
    "Implement authentication",
    "Add error handling",
    "Write tests"
  ],
  "issues": [
    "Performance issue in data processing",
    "UI not responsive on mobile"
  ],
  "nextSteps": [
    "Complete authentication implementation",
    "Fix performance issues",
    "Improve mobile UI"
  ]
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Active context updated successfully"
}
```

### Chat Endpoints

**POST /chat**

Sends a message to the AI assistant with Memory Bank context.

**Request Body:**
```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are an AI assistant with access to the project Memory Bank."
    },
    {
      "role": "user",
      "content": "What is the current status of our project?"
    }
  ],
  "mode": "ask",
  "useMemoryBank": true,
  "allowMemoryBankUpdates": true
}
```

**Response:**
```json
{
  "response": "Based on the Memory Bank, the current status of the project is...",
  "status": "success",
  "memoryBankUpdated": true
}
```

## MCP Tools

Memory Bank MCP provides the following tools that can be used by AI assistants:

### Memory Bank Tools

| Tool Name | Description | Parameters |
|-----------|-------------|------------|
| `mcp__initialize_memory_bank` | Initializes a Memory Bank in the specified directory | `path`: Path where the Memory Bank will be initialized |
| `mcp__set_memory_bank_path` | Sets a custom path for the Memory Bank | `path`: Custom path for the Memory Bank |
| `mcp__read_memory_bank_file` | Reads a file from the Memory Bank | `filename`: Name of the file to read |
| `mcp__write_memory_bank_file` | Writes to a Memory Bank file | `filename`: Name of the file to write<br>`content`: Content to write to the file |
| `mcp__list_memory_bank_files` | Lists Memory Bank files | None |
| `mcp__get_memory_bank_status` | Checks Memory Bank status | None |
| `mcp__track_progress` | Tracks progress and updates Memory Bank files | `action`: Action performed<br>`description`: Detailed description of the progress<br>`updateActiveContext`: Whether to update the active context file |
| `mcp__update_active_context` | Updates the active context file | `tasks`: List of ongoing tasks<br>`issues`: List of known issues<br>`nextSteps`: List of next steps |
| `mcp__log_decision` | Logs a decision in the decision log | `title`: Decision title<br>`context`: Decision context<br>`decision`: The decision made<br>`alternatives`: Alternatives considered<br>`consequences`: Consequences of the decision |

### Resource Tools

| Tool Name | Description | Parameters |
|-----------|-------------|------------|
| `mcp__Product_Context` | Retrieves project overview and context | None |
| `mcp__Active_Context` | Retrieves current project context and tasks | None |
| `mcp__Progress` | Retrieves project progress and milestones | None |
| `mcp__Decision_Log` | Retrieves project decisions and rationale | None |
| `mcp__System_Patterns` | Retrieves system patterns and architecture | None |

## Data Formats

### Memory Bank Files

Memory Bank files are stored in Markdown format with specific structures:

#### activeContext.md

```markdown
# Current Context

## Ongoing Tasks

- Task 1
- Task 2
- Task 3

## Known Issues

- Issue 1
- Issue 2
- Issue 3

## Next Steps

- Step 1
- Step 2
- Step 3

## Current Session Notes

- Note 1
- Note 2
- Note 3
```

#### productContext.md

```markdown
# Project Name

## Overview
Project description and purpose.

## Key Features
- Feature 1
- Feature 2
- Feature 3

## Technical Stack
- Technology 1
- Technology 2
- Technology 3

## Architecture
Description of the project architecture.
```

#### progress.md

```markdown
# Project Progress

## Completed Milestones
- [Milestone 1] - [Date]
- [Milestone 2] - [Date]

## Pending Milestones
- [Milestone 3] - [Expected date]
- [Milestone 4] - [Expected date]

## Update History

- [Date] - [Update]
- [Date] - [Update]
```

#### decisionLog.md

```markdown
# Decision Log

## [Decision Title] - [Date]

### Context
Description of the context and problem.

### Decision
The decision that was made.

### Alternatives Considered
- Alternative 1
- Alternative 2
- Alternative 3

### Consequences
- Consequence 1
- Consequence 2
- Consequence 3
```

#### systemPatterns.md

```markdown
# System Patterns

## Architecture Patterns

### [Pattern Name]
Description of the pattern.

#### Usage
How and where the pattern is used.

#### Implementation
Details about the implementation.

## Design Patterns

### [Pattern Name]
Description of the pattern.

#### Usage
How and where the pattern is used.

#### Implementation
Details about the implementation.
```

### Rule Files

Rule files define the behavior of different modes and can be in JSON, YAML, or TOML format:

#### JSON Format

```json
{
  "mode": "mode_name",
  "instructions": {
    "general": [
      "Instruction 1",
      "Instruction 2",
      "Instruction 3"
    ],
    "umb": {
      "trigger": "mode_name",
      "instructions": [
        "UMB Instruction 1",
        "UMB Instruction 2",
        "UMB Instruction 3"
      ],
      "override_file_restrictions": true
    },
    "memory_bank": {
      "files_to_read": [
        "file1.md",
        "file2.md",
        "file3.md"
      ],
      "files_to_update": [
        "file1.md",
        "file2.md",
        "file3.md"
      ]
    }
  },
  "mode_triggers": {
    "mode_name": [
      { "condition": "Trigger 1" },
      { "condition": "Trigger 2" },
      { "condition": "Trigger 3" }
    ]
  }
}
```

#### YAML Format

```yaml
mode: mode_name
instructions:
  general:
    - Instruction 1
    - Instruction 2
    - Instruction 3
  umb:
    trigger: mode_name
    instructions:
      - UMB Instruction 1
      - UMB Instruction 2
      - UMB Instruction 3
    override_file_restrictions: true
  memory_bank:
    files_to_read:
      - file1.md
      - file2.md
      - file3.md
    files_to_update:
      - file1.md
      - file2.md
      - file3.md
mode_triggers:
  mode_name:
    - condition: Trigger 1
    - condition: Trigger 2
    - condition: Trigger 3
```

#### TOML Format

```toml
mode = "mode_name"

[instructions]
general = [
  "Instruction 1",
  "Instruction 2",
  "Instruction 3"
]

[instructions.umb]
trigger = "mode_name"
instructions = [
  "UMB Instruction 1",
  "UMB Instruction 2",
  "UMB Instruction 3"
]
override_file_restrictions = true

[instructions.memory_bank]
files_to_read = [
  "file1.md",
  "file2.md",
  "file3.md"
]
files_to_update = [
  "file1.md",
  "file2.md",
  "file3.md"
]

[mode_triggers]
mode_name = [
  { condition = "Trigger 1" },
  { condition = "Trigger 2" },
  { condition = "Trigger 3" }
]
```

## Error Handling

### Error Response Format

All error responses follow this format:

```json
{
  "status": "error",
  "error": {
    "code": "error_code",
    "message": "Error message"
  }
}
```

### Common Error Codes

| Error Code | Description |
|------------|-------------|
| `file_not_found` | The requested file was not found |
| `invalid_request` | The request was invalid |
| `unauthorized` | The request was not authorized |
| `server_error` | An internal server error occurred |
| `mode_not_found` | The requested mode was not found |
| `invalid_format` | The file format was invalid |

## Authentication

Memory Bank MCP supports the following authentication methods:

### API Key Authentication

**Headers:**
```
Authorization: Bearer <api_key>
```

### Session Authentication

**Cookie:**
```
session_id=<session_id>
```

## Rate Limiting

Memory Bank MCP implements rate limiting to prevent abuse:

- **Maximum requests per minute**: 60
- **Maximum requests per hour**: 1000

Rate limit headers are included in all responses:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 1614556800
```

## Versioning

The Memory Bank MCP API is versioned using semantic versioning:

- **Major version**: Breaking changes
- **Minor version**: New features, backwards compatible
- **Patch version**: Bug fixes, backwards compatible

API version can be specified in the request header:

```
X-API-Version: 1.0.0
```

## Conclusion

This protocol specification defines how AI assistants can interact with Memory Bank MCP to maintain context and memory across sessions. By following this specification, developers can integrate Memory Bank MCP with any AI assistant that supports the Model Context Protocol.

---

*Memory Bank MCP Protocol Specification v1.0.0*