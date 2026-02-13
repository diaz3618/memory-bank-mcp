# Custom Memory Bank Folder Name

## Overview

Memory Bank MCP allows you to customize the name of the folder where the Memory Bank is stored. This feature provides greater flexibility for projects that may already have a `memory-bank` directory for other purposes or that want to use a different naming convention.

## Configuration Options

### Command Line Option

You can specify a custom folder name using the `--folder` or `-f` command line option:

```bash
# Use a custom folder name
npx @diazstg/memory-bank-mcp --folder custom-memory

# Combine with other options
npx @diazstg/memory-bank-mcp --path /path/to/project --folder custom-memory --mode code
```

### Default Value

If no folder name is specified, Memory Bank MCP will use `memory-bank` as the default folder name.

## How It Works

When you specify a custom folder name, Memory Bank MCP will:

1. Create the Memory Bank in `<project_path>/<folder_name>` when initializing a new Memory Bank
2. Look for an existing Memory Bank in `<project_path>/<folder_name>` when setting a custom path
3. Use the specified folder name for all operations that involve the Memory Bank directory

## Examples

### Using a Custom Folder Name

```bash
# Initialize a Memory Bank with a custom folder name
npx @diazstg/memory-bank-mcp --folder my-memory-bank initialize_memory_bank path=.

# This will create the Memory Bank in ./my-memory-bank
```

### Using Different Folder Names for Different Projects

```bash
# Project 1
cd /path/to/project1
npx @diazstg/memory-bank-mcp --folder project1-memory initialize_memory_bank path=.

# Project 2
cd /path/to/project2
npx @diazstg/memory-bank-mcp --folder project2-memory initialize_memory_bank path=.
```

### Using with MCP Tools

When using MCP tools, the custom folder name will be automatically used:

```
/mcp memory-bank-mcp initialize_memory_bank path=.
```

If you've started the Memory Bank MCP server with a custom folder name, the above command will create the Memory Bank in the specified folder.

## Benefits

- **Flexibility**: Use any folder name that fits your project's naming conventions
- **Compatibility**: Avoid conflicts with existing directories
- **Organization**: Use different folder names for different types of Memory Banks
- **Clarity**: Choose descriptive names that reflect the purpose of the Memory Bank

## Limitations

- Once a Memory Bank is initialized with a specific folder name, you should continue using the same folder name for that Memory Bank
- Changing the folder name after initialization will not automatically migrate existing Memory Bank files
- The folder name is applied globally to all Memory Bank operations during a session

## Best Practices

- Choose a descriptive folder name that reflects the purpose of the Memory Bank
- Use consistent folder names across related projects
- Document the folder name used for each project to ensure consistency
- Consider using configuration files or scripts to ensure consistent folder names across environments
