/**
 * MCP Client Manager
 * 
 * Singleton that manages the MCP client lifecycle.
 */

import * as vscode from 'vscode';
import { ConnectionConfig, ConnectionStatus, IMcpClient } from './types';
import { StdioMcpClient } from './StdioMcpClient';
import { HttpMcpClient } from './HttpMcpClient';
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
    } else if (config.mode === 'http') {
      this.client = new HttpMcpClient();
    } else {
      // Exhaustive check — TypeScript ensures all ConnectionConfig variants are handled
      const _exhaustive: never = config;
      throw new Error(`Unsupported connection config: ${JSON.stringify(_exhaustive)}`);
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

  /**
   * Resolve connection config. Returns null if no config is found
   * (no .vscode/mcp.json, no explicit settings). The extension must
   * NOT auto-connect with a blind npx fallback.
   */
  getConnectionConfig(): ConnectionConfig | null {
    const config = vscode.workspace.getConfiguration('memoryBank');
    const mode = config.get<string>('connectionMode', 'stdio');

    if (mode === 'stdio') {
      // Priority 1: .vscode/mcp.json (shared with Copilot / VS Code MCP)
      const mcpJsonConfig = this.readMcpJsonConfig();
      if (mcpJsonConfig) {
        return mcpJsonConfig;
      }

      // Priority 2: User-explicit settings (workspace or global, NOT defaults)
      const inspection = config.inspect<string>('stdio.command');
      const hasExplicitCommand =
        inspection?.workspaceValue !== undefined ||
        inspection?.workspaceFolderValue !== undefined ||
        inspection?.globalValue !== undefined;

      if (hasExplicitCommand && inspection) {
        const command = inspection.workspaceFolderValue
          ?? inspection.workspaceValue
          ?? inspection.globalValue
          ?? '';
        const userArgs = config.get<string[]>('stdio.args') || [];
        ext.outputChannel.appendLine(
          `Using explicit memoryBank.stdio settings: ${command} ${userArgs.join(' ')}`
        );
        return {
          mode: 'stdio',
          command,
          args: expandTildeInArgs(userArgs),
          cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        };
      }

      // No config found — do NOT blindly fallback to npx
      ext.outputChannel.appendLine(
        'No .vscode/mcp.json or explicit settings found. Use "Install Server" to configure.'
      );
      return null;
    }

    if (mode === 'http') {
      const baseUrl = config.get<string>('http.baseUrl', '');
      if (!baseUrl) {
        ext.outputChannel.appendLine('HTTP mode configured but no baseUrl set.');
        return null;
      }
      return {
        mode: 'http',
        baseUrl,
        authToken: config.get<string>('http.authToken', ''),
      };
    }

    return null;
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
export function expandTildeInArgs(args: string[]): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return args.map(a => a.startsWith('~/') ? home + a.slice(1) : a);
}
