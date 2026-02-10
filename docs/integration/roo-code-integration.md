# Integration with Roo Code Memory Bank

## Overview

Memory Bank MCP was inspired by [Roo Code Memory Bank](https://github.com/GreatScottyMac/roo-code-memory-bank), a memory management system for AI assistants developed by Scott MacKenzie (GreatScottyMac). This documentation explores the similarities, differences, and how the two systems can be integrated or used together.

## About Roo Code Memory Bank

[Roo Code Memory Bank](https://github.com/GreatScottyMac/roo-code-memory-bank) is a system designed to help AI assistants maintain context and memory across sessions. It provides a framework for:

- Storing and retrieving project information
- Maintaining a record of decisions and progress
- Organizing knowledge in different operation modes
- Facilitating collaboration between humans and AI assistants

## Comparison between Memory Bank MCP and Roo Code Memory Bank

### Similarities

1. **Mode Concept**: Both systems use the concept of "modes" to adapt the AI assistant's behavior for different tasks (architect, code, debug, etc.).

2. **Context Files**: Both maintain similar context files:

   - `activeContext.md` - Current project state
   - `progress.md` - Progress record
   - `decisionLog.md` - Decision record
   - `systemPatterns.md` - System patterns and architecture

3. **Persistence Philosophy**: Both aim to maintain context and memory across sessions, enabling continuous collaboration.

4. **Software Development Focus**: Both are optimized for software development tasks and technical project management.

### Differences

1. **Technical Implementation**:

   - Memory Bank MCP: Implemented as an MCP (Model Context Protocol) server in TypeScript/Node.js
   - Roo Code: Implemented as a set of instructions and templates for AI assistants

2. **Integration**:

   - Memory Bank MCP: Provides an API and programmatic tools for system integration
   - Roo Code: Primarily designed for direct use by humans and AI assistants

3. **Rule Formats**:

   - Memory Bank MCP: Supports multiple formats (JSON, YAML, TOML)
   - Roo Code: Primarily focuses on text format instructions

4. **Extensibility**:
   - Memory Bank MCP: Modular architecture with plugin and extension support
   - Roo Code: More focused on a fixed set of functionalities

## How to Use the Systems Together

### Migrating from Roo Code to Memory Bank MCP

If you're already using Roo Code Memory Bank, you can migrate to Memory Bank MCP by following these steps:

1. **Transfer Context Files**:

   ```bash
   # Copy files from Roo Code to Memory Bank MCP
   cp /path/to/roo-code/*.md /path/to/memory-bank/
   ```

2. **Convert Instructions to Rule Files**:

   - Transform Roo Code instructions into `.clinerules-[mode]` files in JSON, YAML, or TOML
   - Use the examples provided in `rule-examples.md` as a base

3. **Adapt Commands**:
   - Replace Roo Code-specific commands with Memory Bank MCP equivalents
   - Use MCP tools to interact with the Memory Bank

### Complementary Use

The two systems can be used complementarily:

1. **Roo Code for Conceptual Structure**:

   - Use Roo Code as a conceptual guide and thinking structure
   - Leverage its templates and prompt examples

2. **Memory Bank MCP for Technical Implementation**:

   - Use Memory Bank MCP as the technical implementation and infrastructure
   - Leverage programmatic resources and MCP integration

3. **Knowledge Sharing**:
   - Keep context files synchronized between the two systems
   - Use scripts for automatic synchronization if needed

## Integration Examples

### Example 1: Using Roo Code Concepts with Memory Bank MCP

```typescript
// Import Memory Bank MCP
import { MemoryBankManager } from "memory-bank-mcp";

// Initialize with Roo Code-inspired structure
const memoryBank = new MemoryBankManager({
  templates: {
    activeContext: require("./roo-code-templates/activeContext.md"),
    progress: require("./roo-code-templates/progress.md"),
    decisionLog: require("./roo-code-templates/decisionLog.md"),
    systemPatterns: require("./roo-code-templates/systemPatterns.md"),
  },
});

// Use Memory Bank MCP with Roo Code concepts
memoryBank.initialize();
```

### Example 2: Synchronization Script

```bash
#!/bin/bash
# Script to synchronize Roo Code and Memory Bank MCP

# Directories
ROO_DIR="/path/to/roo-code"
MCP_DIR="/path/to/memory-bank"

# Synchronize context files
cp $ROO_DIR/activeContext.md $MCP_DIR/
cp $ROO_DIR/progress.md $MCP_DIR/
cp $ROO_DIR/decisionLog.md $MCP_DIR/
cp $ROO_DIR/systemPatterns.md $MCP_DIR/

# Synchronize back
cp $MCP_DIR/activeContext.md $ROO_DIR/
cp $MCP_DIR/progress.md $ROO_DIR/
cp $MCP_DIR/decisionLog.md $ROO_DIR/
cp $MCP_DIR/systemPatterns.md $ROO_DIR/

echo "Synchronization complete!"
```

## Credits and Acknowledgments

Memory Bank MCP acknowledges and thanks Scott MacKenzie (GreatScottyMac) for developing Roo Code Memory Bank, which served as a fundamental inspiration for this project. We recommend visiting the [original Roo Code repository](https://github.com/GreatScottyMac/roo-code-memory-bank) to understand the fundamental concepts that inspired Memory Bank MCP.

---

_Memory Bank MCP is inspired by [Roo Code Memory Bank](https://github.com/GreatScottyMac/roo-code-memory-bank) developed by Scott MacKenzie._
