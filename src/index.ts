#!/usr/bin/env node
// Reference Node.js types
/// <reference types="node" />

import { MemoryBankServer } from './server/MemoryBankServer.js';
import { getLogManager, logger, LogLevel } from './utils/LogManager.js';
import { DatabaseManager } from './utils/DatabaseManager.js';
import { RedisManager } from './utils/RedisManager.js';
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
│                             Memory Bank MCP ${version.padEnd(5)}                            │
│                   HTTP + Postgres + Redis — Docker variant                   │
│                                                                              │
│                                 GitHub Repo:                                 │
│                 https://github.com/diaz3618/memory-bank-mcp                  │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
╭──────────────────────────────────────────────────────────────────────────────╮
│                             Memory Bank MCP ${version.padEnd(5)}                            │
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

Usage: memory-bank-mcp [options]  (or via Docker: docker compose up)

Options:
  --mode, -m <mode>    Set execution mode (code, ask, architect, etc.)
  --path, -p <path>    Set project path (default: current directory)
  --folder, -f <folder> Set Memory Bank folder name (default: memory-bank)
  --username, -u <name> Set username for progress tracking (can be name or GitHub URL)
  --debug, -d          Enable debug mode (show detailed logs)
  --transport, -t <type> Transport mode: stdio (default) or http
  --help, -h           Display this help

HTTP Transport Options (also configurable via environment variables):
  DATABASE_URL         PostgreSQL connection string (required for http mode)
  REDIS_URL            Redis connection string (optional, for caching/rate limiting)
  MCP_PORT             HTTP listen port (default: 3100)
  MCP_HOST             HTTP bind address (default: 127.0.0.1 local, 0.0.0.0 in Docker)
  DB_PROVIDER          Database provider: postgres or supabase (default: postgres)
  
Examples:
  memory-bank-mcp                          # stdio mode (local)
  memory-bank-mcp --transport http          # HTTP mode (requires DATABASE_URL)
  memory-bank-mcp --mode code --debug       # stdio with debug logging
  docker compose up -d                      # full HTTP+Postgres+Redis stack
  
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
    transport?: 'stdio' | 'http';
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
    } else if (arg === '--transport' || arg === '-t') {
      const val = args[++i];
      if (val !== 'stdio' && val !== 'http') {
        process.stderr.write(`Invalid transport: ${val}. Use "stdio" or "http".\n`);
        process?.exit?.(1);
      }
      options.transport = val;
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
    
    // Determine transport mode from CLI or env
    const transportMode = options.transport
      ?? (process.env.MCP_TRANSPORT as 'stdio' | 'http' | undefined)
      ?? 'stdio';

    let db: DatabaseManager | undefined;
    let redis: RedisManager | undefined;
    let httpConfig: { port: number; host: string; enableJsonResponse?: boolean } | undefined;

    if (transportMode === 'http') {
      // Validate required env vars for HTTP mode
      const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
      if (!databaseUrl) {
        logger.error('Main', 'DATABASE_URL or SUPABASE_DB_URL is required for HTTP transport.');
        process?.exit?.(1);
        return;
      }

      const dbProvider = (process.env.DB_PROVIDER as 'postgres' | 'supabase') || 'postgres';
      logger.info('Main', `Database provider: ${dbProvider}`);

      db = new DatabaseManager({
        provider: dbProvider,
        connectionString: databaseUrl,
        maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
      });

      // Run migrations for local Postgres (skip for Supabase — migrations are applied manually)
      if (dbProvider === 'postgres') {
        const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
        logger.info('Main', `Running migrations from ${migrationsDir}...`);
        try {
          await db.runMigrations(migrationsDir);
          logger.info('Main', 'Migrations completed');
        } catch (err) {
          logger.warn('Main', `Migration warning: ${err}`);
        }
      }

      // Redis (optional)
      const redisUrl = process.env.REDIS_URL;
      if (redisUrl) {
        redis = new RedisManager({
          url: redisUrl,
          keyPrefix: process.env.REDIS_KEY_PREFIX,
        });
        await redis.connect();
        logger.info('Main', 'Redis connected');
      } else {
        logger.info('Main', 'Redis not configured — running without cache/rate limiting');
      }

      httpConfig = {
        port: parseInt(process.env.MCP_PORT || '3100', 10),
        // Default to localhost for security; Docker compose sets MCP_HOST=0.0.0.0
        host: process.env.MCP_HOST || '127.0.0.1',
        enableJsonResponse: process.env.MCP_JSON_RESPONSE === 'true',
      };

      logger.info('Main', `HTTP transport configured on ${httpConfig.host}:${httpConfig.port}`);
    }

    const server = new MemoryBankServer(
      options.mode, 
      options.projectPath, 
      options.userId, 
      options.folderName, 
      options.debug,
      httpConfig,
      db,
      redis,
    );
    await server.run(transportMode);
    logger.info('Main', `Memory Bank Server started successfully (transport: ${transportMode})`);
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