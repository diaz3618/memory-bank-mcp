import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** Low-level MCP Server type (avoids deprecated Server import) */
type LowLevelServer = McpServer['server'];

import { MemoryBankManager } from '../../core/MemoryBankManager.js';
import { setupMemoryBankResources } from './MemoryBankResources.js';

/**
 * Sets up all resource handlers for the MCP server
 * @param server MCP Server (low-level)
 * @param memoryBankManager Memory Bank Manager
 */
export function setupResourceHandlers(
  server: LowLevelServer,
  memoryBankManager: MemoryBankManager
) {
  setupMemoryBankResources(server, memoryBankManager);
}