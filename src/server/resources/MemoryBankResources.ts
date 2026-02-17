import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** Low-level MCP Server type (avoids deprecated Server import) */
type LowLevelServer = McpServer['server'];

import { ErrorCode, ListResourcesRequestSchema, McpError, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { MemoryBankManager } from '../../core/MemoryBankManager.js';
import path from 'path';

/**
 * Sets up Memory Bank resources for the MCP server
 * @param server MCP Server
 * @param memoryBankManager Memory Bank Manager
 */
export function setupMemoryBankResources(
  server: LowLevelServer,
  memoryBankManager: MemoryBankManager
) {
  // Define available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: `memory-bank://product-context`,
        name: `Product Context`,
        mimeType: 'text/markdown',
        description: 'Project overview and context',
      },
      {
        uri: `memory-bank://active-context`,
        name: `Active Context`,
        mimeType: 'text/markdown',
        description: 'Current project context and tasks',
      },
      {
        uri: `memory-bank://progress`,
        name: `Progress`,
        mimeType: 'text/markdown',
        description: 'Project progress and milestones',
      },
      {
        uri: `memory-bank://decision-log`,
        name: `Decision Log`,
        mimeType: 'text/markdown',
        description: 'Project decisions and rationale',
      },
      {
        uri: `memory-bank://system-patterns`,
        name: `System Patterns`,
        mimeType: 'text/markdown',
        description: 'System patterns and architecture',
      },
    ],
  }));

  // Implement handler for reading resources
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    // Find Memory Bank directory if not found yet
    const memoryBankDir = memoryBankManager.getMemoryBankDir();
    if (!memoryBankDir) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "Memory Bank not found. Use initialize_memory_bank to create one."
      );
    }

    // Extract filename from URI by removing the protocol prefix
    const uriParts = request.params.uri.split('://');
    if (uriParts.length !== 2 || uriParts[0] !== 'memory-bank') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Invalid URI format: ${request.params.uri}`
      );
    }
    
    // The filename is the same as the URI path with .md extension
    const filename = `${uriParts[1]}.md`;

    try {
      // Read file content
      const content = await memoryBankManager.readFile(filename);

      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: "text/markdown",
            text: content,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Failed to read resource: ${error}`
      );
    }
  });
}