# Testing Clinerules Integration

This document describes how to test the integration between Memory Bank Server and `.clinerules` files.

## Manual Testing

### 1. Basic Mode Detection

1. Create a `.clinerules-code` file in your project directory with the following content:

```json
{
  "mode": "code",
  "instructions": {
    "general": [
      "Status Prefix: Begin EVERY response with either '[MEMORY BANK: ACTIVE]' or '[MEMORY BANK: INACTIVE]'",
      "Implement features and maintain code quality"
    ],
    "umb": {
      "trigger": "^(Update Memory Bank|UMB)$",
      "instructions": [
        "Halt Current Task: Stop current activity",
        "Acknowledge Command: '[MEMORY BANK: UPDATING]'"
      ],
      "override_file_restrictions": true
    },
    "memory_bank": {}
  },
  "mode_triggers": {
    "architect": [
      { "condition": "needs_architectural_changes" },
      { "condition": "design_clarification_needed" }
    ]
  }
}
```

2. Start the Memory Bank Server:

```bash
memory-bank-mcp
```

3. Check the console output to verify that the server detected the `.clinerules-code` file and is using the "code" mode.

### 2. Mode Switching

1. Create a `.clinerules-architect` file in your project directory with the following content:

```json
{
  "mode": "architect",
  "instructions": {
    "general": [
      "Status Prefix: Begin EVERY response with either '[MEMORY BANK: ACTIVE]' or '[MEMORY BANK: INACTIVE]'",
      "Design and document architecture"
    ],
    "umb": {
      "trigger": "^(Update Memory Bank|UMB)$",
      "instructions": [
        "Halt Current Task: Stop current activity",
        "Acknowledge Command: '[MEMORY BANK: UPDATING]'"
      ],
      "override_file_restrictions": true
    },
    "memory_bank": {}
  },
  "mode_triggers": {
    "code": [
      { "condition": "implementation_needed" },
      { "condition": "code_modification_needed" }
    ]
  }
}
```

2. Start the Memory Bank Server with the architect mode:

```bash
memory-bank-mcp --mode architect
```

3. Use the `switch_mode` tool to switch to the code mode:

```json
{
  "name": "switch_mode",
  "arguments": {
    "mode": "code"
  }
}
```

4. Check the console output to verify that the server switched to the "code" mode.

### 3. UMB Command

1. Start the Memory Bank Server:

```bash
memory-bank-mcp
```

2. Initialize a Memory Bank:

```json
{
  "name": "initialize_memory_bank",
  "arguments": {
    "path": "."
  }
}
```

3. Use the `process_umb_command` tool to activate the UMB mode:

```json
{
  "name": "process_umb_command",
  "arguments": {
    "command": "Update Memory Bank"
  }
}
```

4. Check the console output to verify that the server activated the UMB mode.

5. Write to a Memory Bank file:

```json
{
  "name": "write_memory_bank_file",
  "arguments": {
    "filename": "activeContext.md",
    "content": "# Active Context\n\nThis is a test."
  }
}
```

6. Check that the file was updated successfully.

## Automated Testing

For automated testing, you can create test scripts that:

1. Create temporary `.clinerules` files
2. Start the Memory Bank Server with specific modes
3. Send requests to the server
4. Verify the responses

Here's an example of how to structure automated tests:

```typescript
import fs from "fs-extra";
import path from "path";
import { spawn } from "child_process";
import { ExternalRulesLoader } from "../src/utils/ExternalRulesLoader";
import { ModeManager } from "../src/utils/ModeManager";

describe("Clinerules Integration Tests", () => {
  const tempDir = path.join(__dirname, "temp");
  let rulesLoader: ExternalRulesLoader;
  let modeManager: ModeManager;

  beforeEach(async () => {
    // Create temporary directory
    await fs.ensureDir(tempDir);

    // Create test .clinerules files
    await fs.writeFile(
      path.join(tempDir, ".clinerules-code"),
      JSON.stringify({
        mode: "code",
        instructions: {
          general: ["Test instruction"],
          umb: {
            trigger: "^(Update Memory Bank|UMB)$",
            instructions: ["Test UMB instruction"],
            override_file_restrictions: true,
          },
        },
      })
    );

    // Initialize test objects
    rulesLoader = new ExternalRulesLoader(tempDir);
    modeManager = new ModeManager(rulesLoader);
    await modeManager.initialize();
  });

  afterEach(async () => {
    // Clean up
    modeManager.dispose();
    await fs.remove(tempDir);
  });

  test("Should detect and load .clinerules files", async () => {
    const rules = await rulesLoader.detectAndLoadRules();
    expect(rules.size).toBe(1);
    expect(rules.has("code")).toBe(true);
  });

  test("Should switch modes correctly", () => {
    const result = modeManager.switchMode("code");
    expect(result).toBe(true);

    const state = modeManager.getCurrentModeState();
    expect(state.name).toBe("code");
  });

  test("Should detect UMB trigger", () => {
    const result = modeManager.checkUmbTrigger("Update Memory Bank");
    expect(result).toBe(true);
  });

  // Add more tests as needed
});
```

## Integration Testing with Real AI Assistants

To test the integration with real AI assistants:

1. Set up a test environment with the Memory Bank Server and an AI assistant that supports MCP.

2. Create test `.clinerules` files with specific instructions and triggers.

3. Interact with the AI assistant and observe its behavior based on the rules.

4. Test mode switching by using triggers defined in the `.clinerules` files.

5. Test the UMB command by sending "Update Memory Bank" or "UMB" to the AI assistant.

## Troubleshooting

If you encounter issues during testing:

1. Check the console output for error messages.

2. Verify that the `.clinerules` files are valid JSON.

3. Make sure the Memory Bank Server has permission to read the `.clinerules` files.

4. Check that the mode names in the `.clinerules` files match the expected values (architect, ask, code, debug, test).

5. Use the `get_current_mode` tool to check the current mode and status:

```json
{
  "name": "get_current_mode",
  "arguments": {
    "random_string": "dummy"
  }
}
```
