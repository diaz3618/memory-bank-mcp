/**
 * MCP Client Factory and Exports
 * 
 * Provides a factory function to create the appropriate MCP client
 * based on the connection configuration.
 */

import { StdioMcpClient } from './StdioMcpClient';
import { HttpMcpClient } from './HttpMcpClient';
import { ConnectionConfig, ConnectionMode, IMcpClient } from './types';

export * from './types';
export { BaseMcpClient } from './BaseMcpClient';
export { StdioMcpClient } from './StdioMcpClient';
export { HttpMcpClient } from './HttpMcpClient';

/**
 * Creates an MCP client based on the connection mode
 */
export function createMcpClient(mode: ConnectionMode): IMcpClient {
  switch (mode) {
    case 'stdio':
      return new StdioMcpClient();
    case 'http':
      return new HttpMcpClient();
    default:
      throw new Error(`Unknown connection mode: ${mode}`);
  }
}

/**
 * Creates and connects an MCP client with the given configuration
 */
export async function createAndConnectMcpClient(config: ConnectionConfig): Promise<IMcpClient> {
  const client = createMcpClient(config.mode);
  await client.connect(config);
  return client;
}

/**
 * Singleton MCP client manager for the extension
 */
class McpClientManager {
  private client: IMcpClient | null = null;
  private config: ConnectionConfig | null = null;

  async getClient(): Promise<IMcpClient> {
    if (!this.client || !this.client.getStatus().connected) {
      throw new Error('MCP client not connected. Call connect() first.');
    }
    return this.client;
  }

  async connect(config: ConnectionConfig): Promise<IMcpClient> {
    // Disconnect existing client if different config
    if (this.client && this.config !== config) {
      await this.disconnect();
    }

    if (!this.client) {
      this.client = createMcpClient(config.mode);
      this.config = config;
    }

    if (!this.client.getStatus().connected) {
      await this.client.connect(config);
    }

    return this.client;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
      this.config = null;
    }
  }

  isConnected(): boolean {
    return this.client?.getStatus().connected ?? false;
  }

  getStatus() {
    return this.client?.getStatus() ?? {
      connected: false,
      mode: null,
    };
  }

  onStatusChange(callback: (status: ReturnType<IMcpClient['getStatus']>) => void): void {
    this.client?.onStatusChange(callback);
  }
}

// Export singleton instance
export const mcpClientManager = new McpClientManager();
