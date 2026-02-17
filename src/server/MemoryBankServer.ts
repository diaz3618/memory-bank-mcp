/**
 * @modelcontextprotocol/sdk >= 1.26.0 required to address:
 *   - GHSA-8r9q-7v3j-jr4g (ReDoS in UriTemplate, fixed in 1.25.2)
 *   - GHSA-345p-7cg4-v4c7 (cross-client data leak, fixed in 1.26.0)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MemoryBankManager } from '../core/MemoryBankManager.js';
import { ProgressTracker } from '../core/ProgressTracker.js';
import { setupToolHandlers } from './tools/index.js';
import { setupResourceHandlers } from './resources/index.js';
import { ModeManagerEvent } from '../utils/ModeManager.js';
import { coreTools } from './tools/CoreTools.js';
import { progressTools } from './tools/ProgressTools.js';
import { contextTools } from './tools/ContextTools.js';
import { decisionTools } from './tools/DecisionTools.js';
import { modeTools } from './tools/ModeTools.js';
import { HttpTransportServer, type HttpTransportConfig } from './HttpTransportServer.js';
import type { DatabaseManager } from '../utils/DatabaseManager.js';
import type { RedisManager } from '../utils/RedisManager.js';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the canonical version from package.json at startup so the MCP
// handshake always reports the same version as `npm pkg get version`.
function getVersion(): string {
  try {
    // Try using createRequire first (works in development)
    const require = createRequire(import.meta.url);
    const pkg = require('../../package.json') as { version: string };
    return pkg.version;
  } catch {
    try {
      // In production (build/), try reading from resolved path
      const packageJsonPath = join(__dirname, '..', '..', 'package.json');
      const content = readFileSync(packageJsonPath, 'utf-8') as string;
      const pkg = JSON.parse(content) as { version: string };
      return pkg.version;
    } catch {
      // Fallback to unknown if package.json cannot be found
      return 'unknown';
    }
  }
}

const PKG_VERSION: string = getVersion();

/**
 * Main MCP server class for Memory Bank
 * 
 * This class is responsible for setting up and running the MCP server
 * that provides tools and resources for managing memory banks.
 * Supports both stdio (default) and HTTP Streamable transport modes.
 */
export class MemoryBankServer {
  private server: McpServer;
  private memoryBankManager: MemoryBankManager;
  private isRunning: boolean = false;
  private httpTransportServer: HttpTransportServer | null = null;

  // Optional infrastructure for HTTP mode
  private db: DatabaseManager | null = null;
  private redis: RedisManager | null = null;

  /**
   * Creates a new MemoryBankServer instance
   * 
   * Initializes the MCP server with the necessary handlers for tools and resources.
   * @param initialMode Initial mode (optional)
   * @param projectPath Project path (optional)
   * @param userId Username for progress tracking (can be name or GitHub URL)
   * @param folderName Memory Bank folder name (optional, default: 'memory-bank')
   * @param debugMode Enable debug mode (optional, default: false)
   * @param httpConfig HTTP transport configuration (optional — if provided, runs in HTTP mode)
   * @param db DatabaseManager for HTTP/Postgres mode (optional)
   * @param redis RedisManager for caching/rate limiting (optional)
   */
  constructor(
    initialMode?: string, 
    projectPath?: string, 
    userId?: string, 
    folderName?: string, 
    debugMode?: boolean,
    httpConfig?: HttpTransportConfig,
    db?: DatabaseManager,
    redis?: RedisManager,
  ) {
    this.db = db ?? null;
    this.redis = redis ?? null;

    this.memoryBankManager = new MemoryBankManager(
      projectPath, 
      userId, 
      folderName, 
      debugMode
    );
    
    // Combine all tools
    const allTools = [
      ...coreTools,
      ...progressTools,
      ...contextTools,
      ...decisionTools,
      ...modeTools,
    ];
    
    this.server = new McpServer(
      {
        name: '@diazstg/memory-bank-mcp',
        version: PKG_VERSION,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    // Set up tool and resource handlers (low-level API via .server)
    setupToolHandlers(
      this.server.server, 
      this.memoryBankManager, 
      () => this.memoryBankManager.getProgressTracker()
    );
    setupResourceHandlers(this.server.server, this.memoryBankManager);

    // Initialize the mode manager
    this.memoryBankManager.initializeModeManager(initialMode).catch(error => {
      console.error('Error initializing mode manager:', error);
    });

    // Set up listeners for mode manager events
    const modeManager = this.memoryBankManager.getModeManager();
    if (modeManager) {
      modeManager.on(ModeManagerEvent.MODE_CHANGED, (modeState) => {
        console.error(`Mode changed to: ${modeState.name}`);
        console.error(`Memory Bank status: ${modeState.memoryBankStatus}`);
      });

      modeManager.on(ModeManagerEvent.MODE_TRIGGER_DETECTED, (triggeredModes) => {
        console.error(`Mode triggers detected: ${triggeredModes.join(', ')}`);
      });

      modeManager.on(ModeManagerEvent.UMB_TRIGGERED, () => {
        console.error('UMB mode activated');
      });

      modeManager.on(ModeManagerEvent.UMB_COMPLETED, () => {
        console.error('UMB mode deactivated');
      });
    }

    // Error handling
    this.server.server.onerror = (error) => {
      console.error('[MCP Error]', error);
      // Log additional details if available
      if (error instanceof Error && error.stack) {
        console.error('[MCP Error Stack]', error.stack);
      }
    };

    // Set up HTTP transport server if config provided
    if (httpConfig && db) {
      this.httpTransportServer = new HttpTransportServer(
        httpConfig,
        db,
        redis ?? null,
        (sessionUserId: string, sessionProjectId: string) => {
          return this.createMcpServerInstance(initialMode, sessionUserId, sessionProjectId);
        },
      );
    }

    // Handle process termination
    process.on('SIGINT', async () => {
      await this.shutdown();
    });
    
    process.on('SIGTERM', async () => {
      await this.shutdown();
    });
  }

  /**
   * Creates a new MCP Server instance with tool/resource handlers.
   * Used by HttpTransportServer to create per-session servers.
   *
   * TODO [integration-gap]: _userId and _projectId are received from
   * HttpTransportServer session auth but currently ignored. A future task
   * must create a per-session MemoryBankManager backed by PostgresFileSystem
   * so each session reads/writes its own project in Postgres, not the shared
   * local filesystem.
   */
  private createMcpServerInstance(
    initialMode?: string,
    _userId?: string,
    _projectId?: string,
  ): McpServer {
    const allTools = [
      ...coreTools,
      ...progressTools,
      ...contextTools,
      ...decisionTools,
      ...modeTools,
    ];

    const mcpServer = new McpServer(
      {
        name: '@diazstg/memory-bank-mcp',
        version: PKG_VERSION,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      },
    );

    // Re-use the same MemoryBankManager (it handles multi-project via path)
    setupToolHandlers(
      mcpServer.server,
      this.memoryBankManager,
      () => this.memoryBankManager.getProgressTracker(),
    );
    setupResourceHandlers(mcpServer.server, this.memoryBankManager);

    mcpServer.server.onerror = (error) => {
      console.error('[MCP Session Error]', error);
    };

    return mcpServer;
  }

  /**
   * Starts the MCP server
   * 
   * In stdio mode: connects to stdio transport.
   * In HTTP mode: starts the Express HTTP server.
   * Can run both simultaneously if configured.
   */
  async run(transport: 'stdio' | 'http' = 'stdio') {
    if (this.isRunning) {
      console.error('Server is already running');
      return;
    }

    try {
      if (transport === 'http' && this.httpTransportServer) {
        // HTTP transport mode
        await this.httpTransportServer.start();
        this.isRunning = true;
        console.error('Memory Bank MCP server running on HTTP');
      } else {
        // Default: stdio transport
        const stdioTransport = new StdioServerTransport();
        await this.server.connect(stdioTransport);
        this.isRunning = true;
        console.error('Memory Bank MCP server running on stdio');
      }
      
      // Display information about available modes
      const modeManager = this.memoryBankManager.getModeManager();
      if (modeManager) {
        const availableModes = modeManager.getCurrentModeState();
        console.error(`Current mode: ${availableModes.name}`);
        console.error(`Memory Bank status: ${availableModes.memoryBankStatus}`);
      }
    } catch (error) {
      console.error('Failed to start Memory Bank server:', error);
      throw error;
    }
  }

  /**
   * Gracefully shuts down the server
   */
  async shutdown() {
    if (!this.isRunning) {
      return;
    }
    
    console.error('Shutting down Memory Bank server...');
    try {
      // Clean up mode manager resources
      const modeManager = this.memoryBankManager.getModeManager();
      if (modeManager) {
        modeManager.dispose();
      }
      
      // Shut down HTTP transport if running
      if (this.httpTransportServer) {
        await this.httpTransportServer.shutdown();
      }

      // Close Redis and DB connections if present
      if (this.redis) {
        await this.redis.close();
      }
      if (this.db) {
        await this.db.close();
      }

      await this.server.close();
      this.isRunning = false;
      console.error('Memory Bank server shut down successfully');
    } catch (error) {
      console.error('Error during shutdown:', error);
    } finally {
      process.exit(0);
    }
  }
}