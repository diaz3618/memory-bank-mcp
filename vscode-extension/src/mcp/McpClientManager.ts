/**
 * MCP Client Manager
 * 
 * Singleton that manages the MCP client lifecycle.
 */

import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
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
   *
   * Priority order:
   *   1. .vscode/mcp.json  (supports both stdio and http entries)
   *   2. VS Code settings   (memoryBank.connectionMode + sub-settings)
   */
  getConnectionConfig(): ConnectionConfig | null {
    // Priority 1: .vscode/mcp.json — works for BOTH stdio and HTTP configs
    const mcpJsonConfig = this.readMcpJsonConfig();
    if (mcpJsonConfig) {
      return mcpJsonConfig;
    }

    // Priority 2: User-explicit VS Code settings
    const config = vscode.workspace.getConfiguration('memoryBank');
    const mode = config.get<string>('connectionMode', 'stdio');

    if (mode === 'stdio') {
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
      let baseUrl = config.get<string>('http.baseUrl', '');
      if (!baseUrl) {
        ext.outputChannel.appendLine('HTTP mode configured but no baseUrl set.');
        return null;
      }
      // Ensure URL ends with /mcp — it's the MCP endpoint
      baseUrl = baseUrl.replace(/\/$/, '');
      if (!baseUrl.endsWith('/mcp')) {
        baseUrl += '/mcp';
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
   * Supports both stdio (`command` + `args`) and HTTP (`type: "http"` + `url`).
   */
  readMcpJsonConfig(): ConnectionConfig | null {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) { return null; }

    try {
      const mcpJsonPath = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode', 'mcp.json');
      // Use fs.readFileSync since we need this synchronously during config reading
      const fs = require('fs');
      const raw = fs.readFileSync(mcpJsonPath.fsPath, 'utf-8');
      // Use jsonc-parser to safely handle // and /* */ comments in mcp.json
      const parsed = jsonc.parse(raw);
      const server = parsed?.servers?.['memory-bank-mcp'];
      if (!server) { return null; }

      // HTTP mode: { "type": "http", "url": "...", "headers": { "Authorization": "Bearer ..." } }
      if (server.type === 'http' && server.url) {
        let authToken = '';
        const authHeader: unknown = server.headers?.Authorization || server.headers?.authorization;
        if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
          authToken = authHeader.slice(7);
        }

        ext.outputChannel.appendLine(
          `Using HTTP config from .vscode/mcp.json: ${server.url}`
        );
        return {
          mode: 'http',
          baseUrl: server.url, // use the full URL as-is — it's the MCP endpoint
          authToken,
        };
      }

      // stdio mode: { "command": "...", "args": [...] }
      if (server.command) {
        ext.outputChannel.appendLine(
          `Using stdio config from .vscode/mcp.json: ${server.command} ${(server.args || []).join(' ')}`
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
