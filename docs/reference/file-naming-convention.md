# File Naming Convention

## Overview

This document describes the file naming conventions used in the Memory Bank MCP system. All Memory Bank files follow the kebab-case format (with hyphens) for consistency and readability.

## Memory Bank File Names

### Core Files

The Memory Bank system uses the following core files:

| File Name (kebab-case) | Description                                              |
| ---------------------- | -------------------------------------------------------- |
| `product-context.md`   | Overall project information and goals                    |
| `active-context.md`    | Current state, ongoing tasks, and next steps             |
| `progress.md`          | History of project updates and milestones                |
| `decision-log.md`      | Record of important decisions with context and rationale |
| `system-patterns.md`   | Architecture and code patterns used in the project       |

### Additional Files

Additional files created in the Memory Bank should also follow the kebab-case convention:

- `user-stories.md`
- `api-documentation.md`
- `deployment-guide.md`
- `feature-roadmap.md`

## Configuration Files

The system uses the following configuration files:

| File Name               | Description                  |
| ----------------------- | ---------------------------- |
| `.clinerules-architect` | Rules for the Architect mode |
| `.clinerules-ask`       | Rules for the Ask mode       |
| `.clinerules-code`      | Rules for the Code mode      |
| `.clinerules-debug`     | Rules for the Debug mode     |
| `.clinerules-test`      | Rules for the Test mode      |

## Historical Context

The Memory Bank system previously used camelCase for file naming (e.g., `productContext.md`, `activeContext.md`). The system was migrated to kebab-case for better readability and consistency with common Markdown file naming conventions.

For backward compatibility, the system still recognizes both formats, but all new files should use the kebab-case format.

## Migration

If you have existing Memory Bank files in camelCase format, you can use the `migrate_file_naming` tool to automatically rename them to kebab-case:

```
/mcp memory-bank-mcp migrate_file_naming random_string=migrate
```

## Best Practices

1. **Use kebab-case for all new files**: All new files should use the kebab-case format (with hyphens).
2. **Be consistent**: Use the same naming convention throughout your project.
3. **Use descriptive names**: File names should clearly indicate the content of the file.
4. **Keep names concise**: Avoid overly long file names.

---

_Last updated: March 8, 2024_
