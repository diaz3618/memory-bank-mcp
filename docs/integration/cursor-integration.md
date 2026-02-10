# Integrating Memory Bank MCP with Cursor

This guide provides detailed instructions for integrating Memory Bank MCP with the Cursor code editor.

## What is Cursor?

[Cursor](https://cursor.sh/) is an AI-powered code editor built on top of VS Code that supports the Model Context Protocol (MCP). It allows AI assistants to interact with external tools and resources, such as Memory Bank MCP.

## Prerequisites

Before integrating Memory Bank MCP with Cursor, ensure you have:

1. Installed [Cursor](https://cursor.sh/)
2. Verified that npx is available on your system:

   ```bash
   npx --version
   ```

3. Verified that Memory Bank MCP is accessible via npx:

   ```bash
   npx @movibe/memory-bank-mcp --help
   ```

## Configuration Steps

### 1. Verify npx Access to Memory Bank MCP

Ensure that you can access Memory Bank MCP via npx:

```bash
npx @movibe/memory-bank-mcp --help
```

This command should display the help information for Memory Bank MCP.

### 2. Open Cursor Settings

1. Launch Cursor
2. Go to Settings (⚙️) in the bottom left corner
3. Navigate to Extensions > MCP
4. Click on "Add MCP Server"

### 3. Configure the MCP Server

Fill in the following details:

- **Name**: Memory Bank MCP
- **Command**: npx
- **Arguments**: `@movibe/memory-bank-mcp` followed by any optional modes
  - Example: `@movibe/memory-bank-mcp --mode code` for code-focused mode
  - Example: `@movibe/memory-bank-mcp --mode architect` for architecture-focused mode

### 4. Save and Activate

1. Click "Save" to add the MCP server
2. Enable the MCP server by toggling it on in the MCP servers list

### 5. Verify Connection

1. Open a project in Cursor
2. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
3. Type "MCP: List Available Servers" and select it
4. Verify that "Memory Bank MCP" is listed and active

## Using Memory Bank MCP in Cursor

Once configured, you can interact with Memory Bank MCP in Cursor through AI commands.

### Basic Commands

Use the `/mcp` command prefix to interact with Memory Bank MCP:

```
/mcp memory-bank-mcp <tool_name> <parameters>
```

### Common Tools

#### Memory Bank Management

- **Initialize a Memory Bank**:

  ```
  /mcp memory-bank-mcp initialize_memory_bank path=./memory-bank
  ```

- **Set Memory Bank Path**:

  ```
  /mcp memory-bank-mcp set_memory_bank_path path=./memory-bank
  ```

- **List Memory Bank Files**:

  ```
  /mcp memory-bank-mcp list_memory_bank_files random_string=list
  ```

- **Get Memory Bank Status**:

  ```
  /mcp memory-bank-mcp get_memory_bank_status random_string=status
  ```

#### Progress Tracking

- **Track Progress**:

  ```
  /mcp memory-bank-mcp track_progress action="Feature Implementation" description="Implemented feature X"
  ```

#### Decision Logging

- **Log Decision**:

  ```
  /mcp memory-bank-mcp log_decision title="API Design" context="Needed to design the API for feature X" decision="Used REST API with JSON responses"
  ```

#### Mode Management

- **Switch Mode**:

  ```
  /mcp memory-bank-mcp switch_mode mode=code
  ```

- **Get Current Mode**:

  ```
  /mcp memory-bank-mcp get_current_mode random_string=mode
  ```

### Reading and Writing Files

- **Read Memory Bank File**:

  ```
  /mcp memory-bank-mcp read_memory_bank_file filename=progress.md
  ```

- **Write to Memory Bank File**:

  ```
  /mcp memory-bank-mcp write_memory_bank_file filename=notes.md content="# Project Notes\n\n- Note 1\n- Note 2"
  ```

### Active Context Management

- **Update Active Context**:

  ```
  /mcp memory-bank-mcp update_active_context tasks=["Task 1", "Task 2"] issues=["Issue 1"] nextSteps=["Step 1", "Step 2"]
  ```

## Workflow Examples

### Starting a New Project

1. Initialize a Memory Bank:

   ```
   /mcp memory-bank-mcp initialize_memory_bank path=./memory-bank
   ```

2. Update the product context with project information:

   ```
   /mcp memory-bank-mcp read_memory_bank_file filename=product-context.md
   ```

   (Edit the content as needed)

   ```
   /mcp memory-bank-mcp write_memory_bank_file filename=product-context.md content="..."
   ```

3. Set up initial tasks:

   ```
   /mcp memory-bank-mcp update_active_context tasks=["Set up project structure", "Implement core features"] nextSteps=["Create initial files", "Set up testing framework"]
   ```

### During Development

1. Track progress on completed tasks:

   ```
   /mcp memory-bank-mcp track_progress action="Project Setup" description="Created initial project structure with necessary configuration files"
   ```

2. Log important decisions:

   ```
   /mcp memory-bank-mcp log_decision title="Database Selection" context="Needed to select a database for the project" decision="Selected PostgreSQL for its reliability and feature set"
   ```

3. Update active context as tasks are completed:

   ```
   /mcp memory-bank-mcp update_active_context tasks=["Implement core features"] issues=["Performance issue in X module"] nextSteps=["Optimize X module", "Add more tests"]
   ```

## Troubleshooting

### Memory Bank Not Found

If you see "Memory Bank not found" errors:

1. Verify the Memory Bank path:

   ```
   /mcp memory-bank-mcp set_memory_bank_path path=/absolute/path/to/memory-bank
   ```

2. Initialize a new Memory Bank if needed:

   ```
   /mcp memory-bank-mcp initialize_memory_bank path=./memory-bank
   ```

### MCP Server Not Responding

If the MCP server is not responding:

1. Check if npx can access the package:

   ```bash
   npx @movibe/memory-bank-mcp --help
   ```

2. Restart Cursor and try again

3. Clear npx cache if needed:

   ```bash
   npx clear-npx-cache
   ```

## Best Practices

1. **Initialize Early**: Create a Memory Bank at the start of your project
2. **Track Regularly**: Record progress and decisions as they happen
3. **Use Modes**: Switch modes based on your current task (coding, debugging, etc.)
4. **Review Context**: Regularly review the active context to stay focused
5. **Backup**: Regularly backup your Memory Bank files

## Additional Resources

- [Memory Bank MCP Documentation](https://github.com/movibe/memory-bank-server#readme)
- [Cursor Documentation](https://cursor.sh/docs)
- [Model Context Protocol Specification](https://github.com/ModelContext/protocol)
