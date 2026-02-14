#!/usr/bin/env node
// Reference Node.js types
/// <reference types="node" />

import { MemoryBankServer } from './server/MemoryBankServer.js';
import { getLogManager, logger, LogLevel } from './utils/LogManager.js';
import { FileSystemFactory } from './utils/storage/FileSystemFactory.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Display startup banner with version information
 */
function displayBanner(): void {
  try {
    // Read version from package.json
    // Resolve path from current directory (works in both development and production)
    let packageJson: any;
    let version = 'unknown';
    
    try {
      // Try build/ location first (production)
      const packageJsonPath = join(__dirname, '..', 'package.json');
      const content = readFileSync(packageJsonPath, 'utf-8') as string;
      packageJson = JSON.parse(content);
      version = packageJson.version || 'unknown';
    } catch {
      try {
        // If not found, try from src/ location (development)
        const packageJsonPath = join(__dirname, '..', '..', 'package.json');
        const content = readFileSync(packageJsonPath, 'utf-8') as string;
        packageJson = JSON.parse(content);
        version = packageJson.version || 'unknown';
      } catch {
        // If still not found, use 'unknown'
        version = 'unknown';
      }
    }

    const banner = `
╭──────────────────────────────────────────────────────────────────────────────╮
│                                                                              │
│                                                                              │
│                █▀▄▀█ █▀▀ █▀▄▀█ █▀█ █▀█ █▄█   █▄▄ ▄▀█ █▄ █ █▄▀                │
│                █ ▀ █ ██▄ █ ▀ █ █▄█ █▀▄  █    █▄█ █▀█ █ ▀█ █ █                │
│                                                                              │
│                                █▀▄▀█ █▀▀ █▀█                                 │
│                                █ ▀ █ █▄▄ █▀▀                                 │
│                                                                              │
│                                                                              │
│                            Memory Bank MCP ${version.padEnd(5)}                             │
│            https://www.npmjs.com/package/@diazstg/memory-bank-mcp            │
│                                                                              │
│                                 GitHub Repo:                                 │
│                 https://github.com/diaz3618/memory-bank-mcp                  │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
╭──────────────────────────────────────────────────────────────────────────────╮
│                            Memory Bank MCP ${version.padEnd(5)}                             │
│        MCP Server for managing persistent context across AI sessions         │
╰──────────────────────────────────────────────────────────────────────────────╯
`;

    // Write to stderr so it appears in logs (stdout is for MCP protocol)
    console.error(banner);
  } catch (error) {
    // Silently fail if banner cannot be displayed
    console.error('Memory Bank MCP Server starting...');
  }
}

/**
 * Display program help
 */
function showHelp(): never {
  process.stderr.write(`
Memory Bank MCP - MCP Server for managing Memory Bank

Usage: memory-bank-mcp [options]

Options:
  --mode, -m <mode>    Set execution mode (code, ask, architect, etc.)
  --path, -p <path>    Set project path (default: current directory)
  --folder, -f <folder> Set Memory Bank folder name (default: memory-bank)
  --username, -u <name> Set username for progress tracking (can be name or GitHub URL)
  --debug, -d          Enable debug mode (show detailed logs)
  --help, -h           Display this help

Remote Server Options:
  --remote, -r         Enable remote server mode
  --ssh-key, -k <path> Path to SSH private key (default: ~/.ssh/your_ssh_key)
  --remote-user <user> Remote server username
  --remote-host <host> Remote server hostname or IP address
  --remote-path, -rp <path> Remote server base path for memory bank storage
  
Examples:
  memory-bank-mcp
  memory-bank-mcp --mode code
  memory-bank-mcp --path /path/to/project
  memory-bank-mcp --folder custom-memory-bank
  memory-bank-mcp --username "John Doe"
  memory-bank-mcp --username "https://github.com/username"
  memory-bank-mcp --debug
  memory-bank-mcp --remote --remote-user remoteuser --remote-host example.host.com --remote-path /home/remoteuser/memory-bank
  
For more information, visit: https://github.com/diaz3618/memory-bank-mcp
`);
  process?.exit?.(0);
  // This is to satisfy TypeScript that the function never returns
  throw new Error("Exit failed");
}

/**
 * Process command line arguments
 * @returns Object with processed options
 */
function processArgs() {
  const args = process?.argv?.slice(2) || [];
  const options: { 
    mode?: string; 
    projectPath?: string; 
    folderName?: string; 
    userId?: string;
    debug?: boolean;
    remote?: boolean;
    sshKey?: string;
    remoteUser?: string;
    remoteHost?: string;
    remotePath?: string;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--mode' || arg === '-m') {
      options.mode = args[++i];
    } else if (arg === '--path' || arg === '-p') {
      options.projectPath = args[++i];
    } else if (arg === '--folder' || arg === '-f') {
      options.folderName = args[++i];
    } else if (arg === '--username' || arg === '-u') {
      options.userId = args[++i];
    } else if (arg === '--debug' || arg === '-d') {
      options.debug = true;
    } else if (arg === '--remote' || arg === '-r') {
      options.remote = true;
    } else if (arg === '--ssh-key' || arg === '-k') {
      options.sshKey = args[++i];
    } else if (arg === '--remote-user') {
      options.remoteUser = args[++i];
    } else if (arg === '--remote-host') {
      options.remoteHost = args[++i];
    } else if (arg === '--remote-path' || arg === '-rp') {
      options.remotePath = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      showHelp();
    }
  }

  return options;
}

/**
 * Main entry point for the Memory Bank Server
 * 
 * This script initializes and runs the Memory Bank Server,
 * which provides MCP (Model Context Protocol) tools and resources
 * for managing memory banks.
 */
async function main() {
  try {
    // Display startup banner first (before any other output)
    displayBanner();
    
    const options = processArgs();
    
    // Configure log manager
    const logManager = getLogManager();
    if (options.debug) {
      logManager.enableDebugMode();
      logger.info('Main', 'Debug mode enabled');
    }
    
    logger.info('Main', 'Starting Memory Bank Server...');
    if (options.mode) {
      logger.debug('Main', `Using mode: ${options.mode}`);
    }
    if (options.projectPath) {
      logger.debug('Main', `Using project path: ${options.projectPath}`);
    }
    if (options.folderName) {
      logger.debug('Main', `Using Memory Bank folder name: ${options.folderName}`);
    }
    if (options.userId) {
      logger.debug('Main', `Using username: ${options.userId}`);
    }
    
    // Handle remote server configuration
    let remoteConfig = undefined;
    if (options.remote) {
      logger.info('Main', 'Remote server mode enabled');
      
      // Use default SSH key path if not specified
      const homeDir = process?.env?.HOME || '';
      let sshKey = options.sshKey || `${homeDir}/.ssh/your_ssh_key`;
      
      // Expand tilde (~) in SSH key path
      if (sshKey.startsWith('~')) {
        sshKey = sshKey.replace(/^~/, homeDir);
      }
      
      logger.debug('Main', `Using SSH key (resolved path): ${sshKey}`);
      
      // Validate required remote options
      if (!options.remoteUser) {
        logger.error('Main', 'Remote user is required. Use --remote-user to specify.');
        process?.exit?.(1);
        return;
      }
      
      if (!options.remoteHost) {
        logger.error('Main', 'Remote host is required. Use --remote-host to specify.');
        process?.exit?.(1);
        return;
      }
      
      if (!options.remotePath) {
        logger.error('Main', 'Remote path is required. Use --remote-path or -rp to specify.');
        process?.exit?.(1);
        return;
      }
      
      remoteConfig = {
        sshKeyPath: sshKey,
        remoteUser: options.remoteUser,
        remoteHost: options.remoteHost,
        remotePath: options.remotePath
      };
      
      logger.info('Main', `Remote server: ${options.remoteUser}@${options.remoteHost}:${options.remotePath}`);
      
      // Test connection to remote server
      logger.info('Main', 'Testing connection to remote server...');
      
      // Extract the values and validate they are strings to make TypeScript happy
      const remoteUser = options.remoteUser;
      const remoteHost = options.remoteHost;
      
      if (typeof remoteUser !== 'string' || typeof remoteHost !== 'string') {
        logger.error('Main', 'Remote user and host must be strings.');
        process?.exit?.(1);
        return;
      }
      
      const connected = await FileSystemFactory.testRemoteConnection(
        sshKey,
        remoteUser,
        remoteHost,
        options.remotePath
      );
      
      if (!connected) {
        logger.error('Main', 'Failed to connect to remote server. Please check your SSH key and remote server configuration.');
        process?.exit?.(1);
        return;
      }
      
      logger.info('Main', 'Successfully connected to remote server');
    }
    
    const server = new MemoryBankServer(
      options.mode, 
      options.projectPath, 
      options.userId, 
      options.folderName, 
      options.debug,
      remoteConfig
    );
    await server.run();
    logger.info('Main', 'Memory Bank Server started successfully');
  } catch (error) {
    logger.error('Main', `Error starting Memory Bank server: ${error}`);
    process?.exit?.(1);
  }
}

// Handle unhandled promise rejections
if (typeof process !== 'undefined') {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });
}

// Start the server
main().catch(error => {
  console.error('Fatal error in Memory Bank Server:', error);
  process?.exit?.(1);
});
