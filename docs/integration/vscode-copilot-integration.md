# VS Code Copilot Integration

## Setup

### Option 1: Via `.vscode/mcp.json` (Recommended)

Create `.vscode/mcp.json` in your project:

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

VS Code will detect this file and start the MCP server automatically.

### Option 2: Via the Extension

If you have the Memory Bank MCP extension installed:

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Run `Memory Bank: Install MCP Server`
3. The extension writes `.vscode/mcp.json` for you

## Copilot Chat

Once the MCP server is running, Copilot Chat can use Memory Bank tools in Agent mode. Start with:

```
@workspace Initialize the memory bank and read the current context
```

## Copilot Instructions

Create `.github/copilot-instructions.md` to tell Copilot to use Memory Bank automatically:

```markdown
# Project Instructions

This project uses Memory Bank MCP for persistent context.

## At session start
1. Call `get_context_digest` to load current state
2. Read `active-context.md` for ongoing tasks

## During work
- Call `track_progress` after completing milestones
- Call `log_decision` for architectural choices

## At session end
- Call `update_active_context` with current state
```

## Tips

- Copilot Agent mode is required for MCP tool calls
- The `.vscode/mcp.json` approach works without any extension
- Use `get_context_digest` for a fast context load instead of reading individual files
