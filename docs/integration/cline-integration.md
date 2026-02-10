# Cline Integration

## Overview

This document describes how the Memory Bank Server integrates with Cline through `.clinerules` files to provide mode-specific functionality and context management. It also covers the automatic creation of missing `.clinerules` files during initialization.

## Supported Files

The Memory Bank Server supports the following `.clinerules` files:

- `.clinerules-architect`: Rules for the Architect mode, focused on design and architecture
- `.clinerules-ask`: Rules for the Ask mode, focused on answering questions
- `.clinerules-code`: Rules for the Code mode, focused on code implementation
- `.clinerules-debug`: Rules for the Debug mode, focused on debugging
- `.clinerules-test`: Rules for the Test mode, focused on testing

## Structure of .clinerules Files

Each `.clinerules` file must follow a specific structure:

```json
{
  "mode": "mode_name",
  "instructions": {
    "general": ["Instruction 1", "Instruction 2", "..."],
    "umb": {
      "trigger": "^(Update Memory Bank|UMB)$",
      "instructions": ["UMB Instruction 1", "UMB Instruction 2", "..."],
      "override_file_restrictions": true
    },
    "memory_bank": {}
  },
  "mode_triggers": {
    "other_mode": [{ "condition": "trigger_for_other_mode" }]
  }
}
```

## Automatic Creation of .clinerules Files

### Feature Overview

The Memory Bank Server automatically creates missing `.clinerules` files during initialization. Previously, the system would fail if any of the required `.clinerules` files were missing. Now, it will automatically create the missing files using predefined templates.

### Template System

- A file `src/utils/ClineruleTemplates.ts` contains templates for all required `.clinerules` files
- Each template follows the current structure and format of the corresponding `.clinerules` file
- A utility function `getTemplateForMode(mode: string)` retrieves the template for a specific mode

### ExternalRulesLoader Enhancements

- A method `createMissingClinerules(missingFiles: string[])` in the `ExternalRulesLoader` class creates the missing `.clinerules` files using the templates
- It returns information about which files were successfully created and which failed

### MemoryBankManager Updates

- `initializeMemoryBank` has been modified to create missing `.clinerules` files instead of failing
- `initializeModeManager` has been modified to create missing `.clinerules` files before initializing the mode manager
- Both methods now log information about the creation process and only fail if the creation of any file fails

## Supported Features

### 1. Modes

The Memory Bank Server supports switching between different modes based on the available `.clinerules` files. Each mode can have specific behaviors and rules.

### 2. Status Prefix

All server responses include a status prefix that indicates whether the Memory Bank is active or inactive:

- `[MEMORY BANK: ACTIVE]`: Indicates that a Memory Bank was found and is being used
- `[MEMORY BANK: INACTIVE]`: Indicates that no Memory Bank was found
- `[MEMORY BANK: UPDATING]`: Indicates that the Memory Bank is being updated (during UMB command execution)

### 3. UMB Command (Update Memory Bank)

The UMB command allows temporarily updating Memory Bank files, even in modes that normally don't allow file modifications.

To use the UMB command:

1. Send the command "Update Memory Bank" or "UMB"
2. The server will enter UMB mode, allowing temporary updates
3. After completing the updates, the server will return to normal mode

### 4. Mode Triggers

Mode triggers allow automatic detection of situations that may require a mode change. When a trigger is detected, the server suggests switching to the corresponding mode.

## Command Line Usage

You can specify the initial mode when starting the server:

```bash
memory-bank-mcp --mode architect
# or
memory-bank-mcp -m code
```

## Additional MCP Tools

The integration with `.clinerules` files adds the following MCP tools:

### switch_mode

Switches to a specific mode.

```json
{
  "name": "switch_mode",
  "arguments": {
    "mode": "architect"
  }
}
```

### get_current_mode

Gets information about the current mode.

```json
{
  "name": "get_current_mode",
  "arguments": {
    "random_string": "dummy"
  }
}
```

### process_umb_command

Processes the Update Memory Bank (UMB) command.

```json
{
  "name": "process_umb_command",
  "arguments": {
    "command": "Update Memory Bank"
  }
}
```

## Workflow Example

1. Start the server with a specific mode:

   ```bash
   memory-bank-mcp --mode architect
   ```

2. The server detects the `.clinerules` files in the project directory (creating missing ones if necessary)

3. The server applies the rules of the specified mode

4. When needed, use the UMB command to update the Memory Bank:

   ```json
   {
     "name": "process_umb_command",
     "arguments": {
       "command": "Update Memory Bank"
     }
   }
   ```

5. Switch between modes as needed:

   ```json
   {
     "name": "switch_mode",
     "arguments": {
       "mode": "code"
     }
   }
   ```

## Impact for Users

- Users no longer need to manually create `.clinerules` files before initializing a Memory Bank
- The system will automatically create any missing files with sensible defaults
- This makes the system more user-friendly and reduces the chance of initialization failures

## Impact for Developers

- The template system makes it easy to update the default content of `.clinerules` files
- The creation process is well-documented and tested
- The system still validates that all required files exist, but now has a fallback mechanism to create them if needed

## Security Considerations

- UMB mode allows temporary file modifications, but only for files within the Memory Bank
- File restrictions are applied based on the current mode
- Only modes with corresponding `.clinerules` files are available

## Testing

New tests have been added to verify the automatic creation of `.clinerules` files:

1. `initializeMemoryBank should succeed even if .clinerules files are missing`: Verifies that `initializeMemoryBank` creates missing `.clinerules` files and succeeds.
2. `initializeModeManager should create missing .clinerules files`: Verifies that `initializeModeManager` creates missing `.clinerules` files.

---

_Last updated: March 8, 2024_
