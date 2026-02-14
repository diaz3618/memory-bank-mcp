# Memory Bank Status Prefix System

## Overview

The Memory Bank MCP implements a status prefix system that provides immediate visibility into the operational state of the Memory Bank. This system ensures users always know whether the AI assistant is operating with full context awareness or limited information.

## Status Prefixes

Every response from an AI assistant using Memory Bank MCP begins with one of these status indicators:

### `[MEMORY BANK: ACTIVE]`

This status indicates that:

- The Memory Bank directory has been successfully located
- Core files (active-context.md, product-context.md, progress.md, decision-log.md, system-patterns.md) are present
- The AI assistant is actively using Memory Bank information to provide context-aware responses
- Historical decisions, project progress, and system patterns are being considered

### `[MEMORY BANK: INACTIVE]`

This status indicates that:

- The Memory Bank directory could not be found
- Required core files are missing
- The AI assistant is operating with limited context
- Responses are based only on the current conversation and general knowledge
- Historical project information is not available

### `[MEMORY BANK: UPDATING]`

This special status appears temporarily when:

- The Update Memory Bank (UMB) command has been triggered
- The AI assistant is in the process of updating Memory Bank files
- Normal operation is paused during the update process
- The status will return to ACTIVE once the update is complete

## Implementation Details

The status prefix system is implemented through instructions in the `.clinerules` files for each mode. The key instruction is:

```yaml
- "Status Prefix: Begin EVERY response with either '[MEMORY BANK: ACTIVE]' or '[MEMORY BANK: INACTIVE]' or '[MEMORY BANK: UPDATING]'"
```

This instruction is included in all mode configurations (architect, ask, code, debug, test) to ensure consistent status reporting regardless of the current operational mode.

## Benefits

The status prefix system provides several benefits:

1. **Transparency**: Users always know whether the AI has access to the full project context
2. **Troubleshooting**: Makes it immediately obvious when Memory Bank is not properly configured
3. **Context Awareness**: Helps users understand why certain responses may lack historical context
4. **Operational Confidence**: Confirms when the Memory Bank is working correctly
5. **Update Visibility**: Clearly indicates when the Memory Bank is being updated

## Usage Example

When interacting with an AI assistant using Memory Bank MCP:

```
User: What's the current status of the authentication feature?

[MEMORY BANK: ACTIVE]
Based on the project history in the Memory Bank, the authentication feature is currently in development. According to the progress.md file, the team implemented basic user registration last week and is now working on the login functionality. The decision-log.md shows that JWT was selected as the authentication method over session-based authentication.

User: What's the status of the Memory Bank?

[MEMORY BANK: INACTIVE]
I cannot access the Memory Bank at the moment. The Memory Bank directory or its core files may be missing. Would you like me to switch to Architect mode to initialize the Memory Bank?

User: Update Memory Bank

[MEMORY BANK: UPDATING]
I'm now updating the Memory Bank based on our conversation. I'll add information about the authentication feature discussion to the progress.md file and update the active-context.md with the current tasks.

[MEMORY BANK: ACTIVE]
Memory Bank has been updated successfully. I've added our discussion about the authentication feature to the progress.md file and updated the active-context.md with the current tasks.
```

## Troubleshooting

If you consistently see `[MEMORY BANK: INACTIVE]` when you expect the Memory Bank to be active:

1. Verify the Memory Bank directory exists in your project
2. Check that all core files are present and properly formatted
3. Ensure the Memory Bank MCP server is running with the correct path configuration
4. Try initializing the Memory Bank using the Architect mode

## Related Documentation

- [Cline Integration](cline-integration.md)
- [Usage Modes](usage-modes.md)
- [Cursor Integration](cursor-integration.md)

---

_Last updated: March 8, 2024_
