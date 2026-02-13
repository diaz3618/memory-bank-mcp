# Claude Code Integration

## Setup

Add Memory Bank MCP to your Claude Code configuration:

```bash
claude mcp add memory-bank-mcp -- npx -y @diazstg/memory-bank-mcp
```

Or add manually to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "memory-bank-mcp": {
      "command": "npx",
      "args": ["-y", "@diazstg/memory-bank-mcp"]
    }
  }
}
```

### With Custom Path

```json
{
  "mcpServers": {
    "memory-bank-mcp": {
      "command": "npx",
      "args": ["-y", "@diazstg/memory-bank-mcp", "--path", "/your/project"]
    }
  }
}
```

## Usage

Once configured, Claude Code will have access to all Memory Bank tools. Start a session with:

```
Initialize the memory bank for this project, then read the active context.
```

Claude Code will call `initialize_memory_bank` and `read_memory_bank_file` automatically.

## Session Workflow

1. **Start** — Ask Claude to read `active-context.md` and `progress.md`
2. **During work** — Claude uses `track_progress` and `log_decision` as needed
3. **End** — Ask Claude to update the memory bank with current state

## Knowledge Graph

Claude Code can use the knowledge graph tools to build a persistent understanding of your project:

```
Search the knowledge graph for entities related to "authentication"
```

## Tips

- Claude Code supports MCP natively — no extension needed
- Add a `/CLAUDE.md` or project instructions file that references Memory Bank tools
- Use `get_context_digest` at session start for a compressed overview
