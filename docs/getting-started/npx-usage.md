# Using Memory Bank MCP via npx

Memory Bank MCP can be easily executed via npx without prior installation.

## Basic Usage

```bash
npx @diazstg/memory-bank-mcp
```

## Available Options

### Execution Mode

You can specify a specific execution mode:

```bash
npx @diazstg/memory-bank-mcp --mode code
```

### Project Path

You can specify a custom project path:

```bash
npx @diazstg/memory-bank-mcp --path /path/to/project
```

### Memory Bank Folder Name

You can specify a custom folder name for the Memory Bank:

```bash
npx @diazstg/memory-bank-mcp --folder custom-memory-bank
```

### Username for Progress Tracking

You can specify your name or GitHub username for attribution in progress entries:

```bash
npx @diazstg/memory-bank-mcp --username your-github-username
```

## Global Installation

If you prefer, you can also install the package globally:

```bash
npm install -g @diazstg/memory-bank-mcp
```

And then run it directly:

```bash
memory-bank-mcp
```

## Installation Verification

To verify if the package is working correctly after installation, run:

```bash
npx @diazstg/memory-bank-mcp --help
```

## Important Notes

1. Memory Bank MCP requires Node.js version 18 or higher.
2. When running via npx, the package will be temporarily downloaded and executed without permanent installation.
3. The first execution may be a bit slower due to the package download.
