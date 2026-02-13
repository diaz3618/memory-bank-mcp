# Debug MCP Configuration Tool

This document describes the `debug_mcp_config` tool, which provides detailed information about the current Memory Bank MCP configuration.

## Overview

The `debug_mcp_config` tool collects and returns comprehensive information about the current state of the Memory Bank MCP server, including Memory Bank status, mode information, system details, and other relevant configuration data. This tool is particularly useful for troubleshooting issues, understanding the current state of the server, and verifying configuration settings.

## Usage

The tool can be called using the MCP protocol with the following parameters:

```json
{
  "name": "debug_mcp_config",
  "arguments": {
    "verbose": true|false
  }
}
```

### Parameters

- `verbose` (optional, boolean): Whether to include detailed information, such as environment variables. Defaults to `false`.

## Response

The tool returns a JSON object containing the following information:

```json
{
  "timestamp": "ISO-8601 timestamp",
  "memoryBank": {
    "directory": "Path to the Memory Bank directory or null if not set",
    "projectPath": "Path to the project directory",
    "language": "Language code (always 'en')",
    "folderName": "Name of the Memory Bank folder",
    "status": {
      "path": "Path to the Memory Bank directory",
      "files": ["List of files in the Memory Bank"],
      "coreFilesPresent": ["List of core files present"],
      "missingCoreFiles": ["List of core files missing"],
      "isComplete": true|false,
      "language": "Language code (always 'en')",
      "lastUpdated": "ISO-8601 timestamp"
    }
  },
  "mode": {
    "name": "Current mode name (code, ask, architect, etc.)",
    "isUmbActive": true|false,
    "memoryBankStatus": "ACTIVE|INACTIVE"
  },
  "system": {
    "platform": "Operating system platform",
    "release": "Operating system release",
    "arch": "System architecture",
    "nodeVersion": "Node.js version",
    "cwd": "Current working directory",
    "env": "Environment variables (only if verbose=true)"
  }
}
```

## Example

### Request

```json
{
  "name": "debug_mcp_config",
  "arguments": {
    "verbose": false
  }
}
```

### Response

```json
{
  "content": [
    {
      "type": "text",
      "text": "MCP Configuration Debug Information:\n{
        \"timestamp\": \"2025-03-09T20:30:45.123Z\",
        \"memoryBank\": {
          \"directory\": \"/path/to/memory-bank\",
          \"projectPath\": \"/path/to/project\",
          \"language\": \"en\",
          \"folderName\": \"memory-bank\",
          \"status\": {
            \"path\": \"/path/to/memory-bank\",
            \"files\": [
              \"product-context.md\",
              \"active-context.md\",
              \"progress.md\",
              \"decision-log.md\",
              \"system-patterns.md\"
            ],
            \"coreFilesPresent\": [
              \"product-context.md\",
              \"active-context.md\",
              \"progress.md\",
              \"decision-log.md\",
              \"system-patterns.md\"
            ],
            \"missingCoreFiles\": [],
            \"isComplete\": true,
            \"language\": \"en\",
            \"lastUpdated\": \"2025-03-09T20:25:30.456Z\"
          }
        },
        \"mode\": {
          \"name\": \"code\",
          \"isUmbActive\": false,
          \"memoryBankStatus\": \"ACTIVE\"
        },
        \"system\": {
          \"platform\": \"darwin\",
          \"release\": \"24.3.0\",
          \"arch\": \"x64\",
          \"nodeVersion\": \"v18.16.0\",
          \"cwd\": \"/path/to/project\"
        }
      }"
    }
  ]
}
```

## Use Cases

1. **Troubleshooting**: Identify issues with the Memory Bank configuration or mode settings.
2. **Verification**: Confirm that the Memory Bank is properly initialized and all core files are present.
3. **Debugging**: Understand the current state of the MCP server during development or testing.
4. **Support**: Provide detailed system information when reporting issues or seeking support.

## Implementation Details

The tool is implemented in the `handleDebugMcpConfig` function in the `CoreTools.ts` file. It collects information from various sources:

1. Basic Memory Bank information from the `MemoryBankManager`
2. Mode information from the `ModeManager`
3. Memory Bank status using the `getStatus` method
4. System information using the Node.js `os` module

The collected information is formatted as a JSON object and returned as a text response.

## Security Considerations

When `verbose` is set to `true`, the tool includes environment variables in the response. This may expose sensitive information, so use this option with caution and only in secure environments.