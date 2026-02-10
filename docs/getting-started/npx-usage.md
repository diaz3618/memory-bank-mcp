# Using Memory Bank MCP via npx

Memory Bank MCP can be easily executed via npx without prior installation.

## Basic Usage

```bash
npx @movibe/memory-bank-mcp
```

## Available Options

### Execution Mode

You can specify a specific execution mode:

```bash
npx @movibe/memory-bank-mcp --mode code
```

### Project Path

You can specify a custom project path:

```bash
npx @movibe/memory-bank-mcp --path /path/to/project
```

### Memory Bank Folder Name

You can specify a custom folder name for the Memory Bank:

```bash
npx @movibe/memory-bank-mcp --folder custom-memory-bank
```

### GitHub Profile URL

You can specify your GitHub profile URL for tracking changes:

```bash
npx @movibe/memory-bank-mcp --githubProfileUrl https://github.com/username
```

## Global Installation

If you prefer, you can also install the package globally:

```bash
npm install -g @movibe/memory-bank-mcp
```

And then run it directly:

```bash
memory-bank-mcp
```

## Installation Verification

To verify if the package is working correctly after installation, run:

```bash
npx @movibe/memory-bank-mcp --help
```

## Important Notes

1. Memory Bank MCP requires Node.js version 18 or higher.
2. When running via npx, the package will be temporarily downloaded and executed without permanent installation.
3. The first execution may be a bit slower due to the package download.
