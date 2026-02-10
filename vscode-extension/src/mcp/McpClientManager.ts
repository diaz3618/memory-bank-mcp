/**
 * MCP Client Manager
 * 
 * Singleton that manages the MCP client lifecycle.
 */

import * as vscode from 'vscode';
import { ConnectionConfig, ConnectionStatus, IMcpClient } from './types';
import { StdioMcpClient } from './StdioMcpClient';
import { ext } from '../extensionVariables';

export class McpClientManager implements vscode.Disposable {
  private client: IMcpClient | null = null;
  private statusListeners: Array<(status: ConnectionStatus) => void> = [];

  dispose(): void {
    this.disconnect();
  }

  async connect(config: ConnectionConfig): Promise<void> {
    await this.disconnect();

    if (config.mode === 'stdio') {
      this.client = new StdioMcpClient();
    } else {
      throw new Error(`Connection mode "${config.mode}" not yet supported`);
    }

    this.client.onStatusChange((status) => {
      this.statusListeners.forEach(cb => cb(status));
    });

    await this.client.connect(config);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      this.client = null;
    }
  }

  async getClient(): Promise<IMcpClient> {
    if (!this.client || !this.client.getStatus().connected) {
      throw new Error('MCP server not connected. Use "Memory Bank: Reconnect" to connect.');
    }
    return this.client;
  }

  isConnected(): boolean {
    return this.client?.getStatus().connected ?? false;
  }

  getConnectionStatus(): ConnectionStatus {
    return this.client?.getStatus() ?? { connected: false, mode: null };
  }

  onStatusChange(callback: (status: ConnectionStatus) => void): void {
    this.statusListeners.push(callback);
  }

  getConnectionConfig(): ConnectionConfig {
    const config = vscode.workspace.getConfiguration('memoryBank');
    const mode = config.get<string>('connectionMode', 'stdio');

    if (mode === 'stdio') {
      // Check if user has explicit settings first
      const userCommand = config.get<string>('stdio.command');
      const userArgs = config.get<string[]>('stdio.args');

      if (userCommand) {
        return {
          mode: 'stdio',
          command: userCommand,
          args: expandTildeInArgs(userArgs || []),
          cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        };
      }

      // Try reading from .vscode/mcp.json
      const mcpJsonConfig = this.readMcpJsonConfig();
      if (mcpJsonConfig) {
        return mcpJsonConfig;
      }

      // Fallback defaults
      return {
        mode: 'stdio',
        command: 'npx',
        args: ['-y', '@diazstg/memory-bank-mcp'],
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      };
    }

    return {
      mode: 'http',
      baseUrl: config.get<string>('http.baseUrl', ''),
      authToken: config.get<string>('http.authToken', ''),
    };
  }

  /**
   * Read memory-bank-mcp server config from .vscode/mcp.json if it exists.
   */
  private readMcpJsonConfig(): ConnectionConfig | null {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) { return null; }

    try {
      const mcpJsonPath = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode', 'mcp.json');
      // Use fs.readFileSync since we need this synchronously during config reading
      const fs = require('fs');
      const raw = fs.readFileSync(mcpJsonPath.fsPath, 'utf-8');
      // Strip JSON comments (// and /* */)
      const stripped = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const parsed = JSON.parse(stripped);
      const server = parsed?.servers?.['memory-bank-mcp'];

      if (server && server.command) {
        ext.outputChannel.appendLine(
          `Using memory-bank-mcp config from .vscode/mcp.json: ${server.command} ${(server.args || []).join(' ')}`
        );
        return {
          mode: 'stdio',
          command: server.command,
          args: expandTildeInArgs(server.args || []),
          cwd: workspaceFolder.uri.fsPath,
          env: server.env,
        };
      }
    } catch {
      // mcp.json doesn't exist or is invalid — fall through
    }
    return null;
  }
}

/** Expand ~ to $HOME in each arg (Node spawn doesn't do shell expansion). */
function expandTildeInArgs(args: string[]): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return args.map(a => a.startsWith('~/') ? home + a.slice(1) : a);
}
