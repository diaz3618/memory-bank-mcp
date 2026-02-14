# Memory Bank Migration Guide

This guide helps you migrate existing Memory Banks to the new file naming convention.

## Background

In version 0.2.0, Memory Bank MCP introduced a new file naming convention that uses kebab-case (words separated by hyphens) instead of camelCase. This change makes the file names more consistent with the URI naming convention and simplifies the code.

## Migration Options

You have two options to migrate your existing Memory Banks:

### Option 1: Use the Migration Tool

Memory Bank MCP provides a built-in migration tool that automatically renames your files:

```javascript
// Example code using the MCP client
const result = await client.callTool("migrate_file_naming", {
  random_string: "migrate",
});
console.log(result);
```

Or if you're using the Memory Bank MCP directly in your code:

```typescript
import { MigrationUtils } from "@diazstg/memory-bank-mcp";

// Path to your Memory Bank directory
const memoryBankDir = "/path/to/your/memory-bank";

// Migrate files
const result = await MigrationUtils.migrateFileNamingConvention(memoryBankDir);
console.log(
  `Migration completed. Migrated files: ${result.migratedFiles.join(", ")}`
);
if (result.errors.length > 0) {
  console.error(`Errors during migration: ${result.errors.join(", ")}`);
}
```

### Option 2: Manual Migration

If you prefer to migrate manually, rename the following files in your Memory Bank directory:

| Old Name (camelCase) | New Name (kebab-case) |
| -------------------- | --------------------- |
| `productContext.md`  | `product-context.md`  |
| `activeContext.md`   | `active-context.md`   |
| `decisionLog.md`     | `decision-log.md`     |
| `systemPatterns.md`  | `system-patterns.md`  |

The `progress.md` file already uses the correct naming convention and doesn't need to be renamed.

## Backward Compatibility

Memory Bank MCP version 0.2.0 and later will automatically detect and use the new file naming convention. If you don't migrate your files, the software will still work with the old file names, but we recommend migrating to ensure compatibility with future versions.

## Verifying Migration

After migration, you can verify that your Memory Bank is using the new naming convention by checking that the following files exist:

- `product-context.md`
- `active-context.md`
- `progress.md`
- `decision-log.md`
- `system-patterns.md`

## Troubleshooting

If you encounter any issues during migration, check the following:

1. Make sure you have write permissions to the Memory Bank directory
2. Ensure no files are currently being edited or locked by other applications
3. Check if the target files already exist (the migration tool won't overwrite existing files)

If problems persist, you can:

- Try the manual migration option
- Restore from a backup if you made one before migration
- Contact support for assistance
