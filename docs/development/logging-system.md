# Logging System

## Overview

Memory Bank MCP includes a centralized logging system that provides consistent log formatting, level-based filtering, and debug mode support. This system helps control which logs are displayed to users and ensures a clean output in production environments.

## Features

- **Log Levels**: Support for DEBUG, INFO, WARN, and ERROR log levels
- **Debug Mode**: Optional debug mode that shows detailed logs
- **Source Tracking**: Each log message includes its source component
- **Timestamp Support**: Optional timestamps for each log message
- **Singleton Pattern**: Centralized log management through a singleton instance

## Usage

### Basic Usage

```typescript
import { logger } from "../utils/LogManager.js";

// Different log levels
logger.debug("ComponentName", "This is a debug message");
logger.info("ComponentName", "This is an info message");
logger.warn("ComponentName", "This is a warning message");
logger.error("ComponentName", "This is an error message");
```

### Configuration

```typescript
import { getLogManager, LogLevel } from "../utils/LogManager.js";

const logManager = getLogManager();

// Enable debug mode
logManager.enableDebugMode();

// Disable debug mode
logManager.disableDebugMode();

// Custom configuration
logManager.configure({
  debugMode: true,
  showTimestamp: true,
  showSource: true,
  minLevel: LogLevel.INFO,
});
```

## Log Levels

The logging system supports the following log levels, in order of increasing severity:

1. **DEBUG**: Detailed information, typically useful only for diagnosing problems

   - Initialization details
   - Configuration values
   - Path information
   - File operations details
   - Memory Bank detection and initialization details

2. **INFO**: Confirmation that things are working as expected

   - Server start/stop messages
   - Mode changes
   - Important status updates
   - User-facing operational messages

3. **WARN**: Indication that something unexpected happened, but the application can continue

   - Missing configuration files
   - Invalid rule formats
   - Non-critical failures

4. **ERROR**: Error events that might still allow the application to continue running
   - File operation failures
   - Initialization errors
   - Rule loading errors
   - Memory Bank operation errors

## Debug Mode

When debug mode is disabled (default), only INFO, WARN, and ERROR messages are displayed. When debug mode is enabled, all messages including DEBUG level are displayed.

### What's Shown in Normal Mode (Debug Disabled)

- Server start/stop messages
- Important status updates
- Warnings and errors

### What's Shown in Debug Mode

- All of the above
- Detailed initialization information
- Configuration values
- File operations details
- Memory Bank detection and initialization details

## Command Line Support

Debug mode can be enabled via the command line using the `--debug` or `-d` flag:

```bash
memory-bank-mcp --debug
```

## Implementation Details

The logging system is implemented as a singleton class in `src/utils/LogManager.ts`. It uses the following components:

- **LogLevel enum**: Defines the available log levels
- **LogManagerConfig interface**: Defines the configuration options
- **LogManager class**: Implements the logging functionality
- **logger object**: Provides convenient access to logging methods

## Benefits

- **Consistent Formatting**: All logs follow the same format
- **Centralized Control**: Log levels and debug mode can be controlled centrally
- **Clean Output**: Production environments show only relevant logs
- **Detailed Debugging**: Debug mode provides detailed information when needed

## Best Practices

1. Use appropriate log levels:

   - DEBUG for detailed diagnostic information
   - INFO for general operational information
   - WARN for unexpected but non-critical issues
   - ERROR for error conditions

2. Include meaningful source names to identify the component generating the log

3. Write clear, concise log messages that provide useful information

4. Use debug mode during development and troubleshooting, but disable it in production

## Examples of Appropriate Log Levels

### DEBUG Level

```typescript
logger.debug(
  "MemoryBankManager",
  `Initialized with project path: ${projectPath}`
);
logger.debug(
  "ExternalRulesLoader",
  `Loaded ${filename} rules from project directory`
);
logger.debug(
  "MemoryBankManager",
  `Found existing Memory Bank at: ${memoryBankPath}`
);
```

### INFO Level

```typescript
logger.info("Main", "Starting Memory Bank Server...");
logger.info("Main", "Memory Bank Server started successfully");
logger.info("ModeManager", `Mode changed to: ${mode}`);
```

### WARN Level

```typescript
logger.warn(
  "ExternalRulesLoader",
  `Missing .clinerules files: ${missingFiles.join(", ")}`
);
logger.warn("ExternalRulesLoader", `Invalid rule format in ${filename}`);
```

### ERROR Level

```typescript
logger.error(
  "MemoryBankManager",
  `Error reading file ${filename} from Memory Bank: ${error}`
);
logger.error("FileUtils", `Failed to write to file ${filePath}: ${error}`);
```
