# Roo Code Integration

## Overview

[Roo Code](https://github.com/RooVetGit/Roo-Code) is an AI-powered VS Code extension that supports multiple operational modes and MCP (Model Context Protocol) servers. Memory Bank MCP integrates seamlessly with Roo Code to provide persistent memory and context.

## Setup

### Prerequisites

- VS Code with [Roo Code extension](https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline) installed
- Node.js and npx installed

### Configuration

Add Memory Bank MCP to Roo Code's MCP configuration. In VS Code:

1. Open Settings (Ctrl+,)
2. Search for "Roo Code MCP"  
3. Edit the MCP configuration file

Or edit `~/.roo-code/mcp_config.json` directly:

```json
{
  "mcpServers": {
    "memory-bank-mcp": {
      "command": "npx",
      "args": ["-y", "@diazstg/memory-bank-mcp", "--mode", "code", "--username", "YourName"]
    }
  }
}
```

### Per-Project Configuration

Create `.roocode/mcp.json` in your project root:

```json
{
  "servers": {
    "memory-bank-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@diazstg/memory-bank-mcp",
        "--path", ".",
        "--folder", "memory-bank",
        "--username", "YourName"
      ]
    }
  }
}
```

## Mode Alignment

Both Roo Code and Memory Bank MCP support operational modes. They align naturally:

| Roo Code Mode | Memory Bank Mode | Purpose |
|---------------|------------------|---------|
| Architect | architect | System design and planning |
| Code | code | Implementation and coding |
| Ask | ask | Questions and information |
| Debug | debug | Troubleshooting and fixing |
| Custom | - | Custom Roo Code modes |

Memory Bank MCP also has a **test** mode for testing workflows.

### Automatic Mode Switching

You can configure Roo Code to automatically switch Memory Bank modes:

1. When Roo Code switches to "Architect" mode, tell it to call `switch_mode` with `mode=architect`
2. Add this to your Roo Code custom instructions or workspace settings

## Usage

### Session Start

When beginning work with Roo Code, load context:

```
@roo Load the current context from Memory Bank using get_context_digest
```

Roo Code will call the `get_context_digest` MCP tool and load your project state.

### During Development

Roo Code can automatically use Memory Bank tools:

- **After completing features**: "Track this progress in the memory bank"
- **When making decisions**: "Log this architectural decision"
- **Finding related code**: "Search the knowledge graph for authentication-related entities"

### Session End

Update the memory bank before ending:

```
@roo Update the memory bank with current tasks, issues, and next steps
```

## Workflow Example

```
You: @roo Start by loading context from memory bank

Roo: [Calls get_context_digest]
     I've loaded the context. You're working on the authentication module.
     Current tasks:
     - Implement OAuth flow
     - Add password reset
     Known issues:
     - Token refresh needs improvement

You: Let's implement the OAuth flow with Google

Roo: [Implements OAuth flow]

You: Track this progress in memory bank

Roo: [Calls track_progress with action="OAuth Implementation", 
      description="Implemented Google OAuth flow with..."]
     Progress tracked!

You: This was a key decision - we chose OAuth over 
     traditional username/password. Log this decision.

Roo: [Calls log_decision with title="Authentication Strategy",
      decision="OAuth for social login", ...]
     Decision logged!
```

## Knowledge Graph Integration

Roo Code can leverage the Memory Bank knowledge graph:

```
You: @roo What components depend on the AuthService?

Roo: [Calls graph_search with query="AuthService"]
     [Calls graph_open_nodes to get details]
     
     The following components depend on AuthService:
     - LoginController
     - UserRegistrationService
     - SessionManager
```

## Tips

1. **Use @roo mentions**: Prefix requests with `@roo` to invoke Roo Code explicitly
2. **Mode switching**: When changing Roo Code modes, mention it should switch Memory Bank mode too
3. **Context loading**: Start each session by loading context with `get_context_digest`
4. **Workspace instructions**: Add Memory Bank workflow to `.vscode/settings.json` or Roo Code workspace config

## Workspace Instructions

Create a `.roocode/instructions.md` file:

```markdown
# Project: [Your Project Name]

## Memory Bank Workflow

### Session Start
1. Call `get_context_digest` to load current state
2. Review active tasks and issues

### During Work
- Call `track_progress` after milestones
- Call `log_decision` for architectural choices
- Use `graph_search` to find related components
- Call `update_active_context` when tasks change

### Session End
- Call `update_active_context` with final state
- Summarize session accomplishments
```

## Advanced: Custom Roo Code Modes with Memory Bank

You can create custom Roo Code modes that integrate with Memory Bank:

1. Define a custom mode in Roo Code settings
2. Configure it to call `switch_mode` when activated
3. Add mode-specific Memory Bank behaviors

Example custom mode: "Review"
- Switches Memory Bank to `ask` mode
- Focuses on reading and explaining code
- Uses `graph_search` extensively

## Troubleshooting

### Memory Bank Tools Not Available

- Verify MCP configuration in Roo Code settings
- Check npx can run: `npx @diazstg/memory-bank-mcp --help`
- Restart VS Code after configuration changes

### Mode Mismatches

- If Roo Code and Memory Bank modes are out of sync, manually call:
  ```
  @roo Switch memory bank mode to match current mode
  ```

### Context Not Loading

- Verify Memory Bank is initialized: check for `memory-bank/` directory
- Initialize if needed: `@roo Initialize memory bank in current directory`

## See Also

- [AI Assistant Integration Guide](./ai-assistant-integration.md) - General MCP integration patterns
- [Generic MCP Integration Guide](./generic-mcp-integration.md) - Full MCP configuration reference
- [Roo Code Documentation](https://roocode.com/docs) - Official Roo Code docs
- [Roo Code Memory Bank Comparison](../reference/roo-code-memory-bank-comparison.md) - Historical context

---

*Enhance Roo Code with persistent memory and project knowledge*
