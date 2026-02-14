/**
 * Stdio MCP Client
 * 
 * JSON-RPC 2.0 over stdin/stdout child process transport.
 * Ported from backup with fixes for buffer parsing and error handling.
 */

import { ChildProcess, spawn } from 'child_process';
import {
  ConnectionConfig,
  McpResource,
  McpResourceContent,
  McpTool,
  StdioConnectionConfig,
} from './types';
import { BaseMcpClient } from './BaseMcpClient';
import { ext } from '../extensionVariables';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  method: string;
}

export class StdioMcpClient extends BaseMcpClient {
  private process: ChildProcess | null = null;
  private nextId = 1;
  private pendingRequests = new Map<number, PendingRequest>();
  private buffer = '';
  private decoder = new TextDecoder();

  async connect(config: ConnectionConfig): Promise<void> {
    if (config.mode !== 'stdio') {
      throw new Error('StdioMcpClient requires stdio config');
    }
    const stdioConfig = config as StdioConnectionConfig;

    ext.outputChannel.appendLine(
      `Connecting to MCP server (stdio mode)...`
    );
    ext.outputChannel.appendLine(
      `Command: ${stdioConfig.command} ${stdioConfig.args.join(' ')}`
    );

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout (30s)'));
      }, 30000);

      try {
        this.process = spawn(stdioConfig.command, stdioConfig.args, {
          cwd: stdioConfig.cwd,
          env: { ...process.env, ...stdioConfig.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.process.stderr?.on('data', (data: Buffer) => {
          const text = data.toString().trim();
          if (text) {
            ext.outputChannel.appendLine(`[MCP stderr] ${text}`);
          }
        });

        this.process.stdout?.on('data', (data: Buffer) => {
          this.handleData(data);
        });

        this.process.on('error', (err) => {
          ext.outputChannel.appendLine(`MCP process error: ${err.message}`);
          this.updateStatus({ connected: false, error: err.message });
          clearTimeout(timeout);
          reject(err);
        });

        this.process.on('exit', (code) => {
          ext.outputChannel.appendLine(`MCP process exited with code ${code}`);
          this.updateStatus({ connected: false });
          this.rejectAllPending(new Error(`Process exited with code ${code}`));
        });

        // Initialize handshake
        this.sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'memory-bank-vscode', version: '2.0.0' },
        }).then(() => {
          // Send initialized notification
          this.sendNotification('notifications/initialized', {});
          ext.outputChannel.appendLine('Connected to MCP server');
          this.updateStatus({ connected: true, mode: 'stdio' });
          clearTimeout(timeout);
          resolve();
        }).catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.rejectAllPending(new Error('Disconnecting'));
      this.process.kill();
      this.process = null;
    }
    this.updateStatus({ connected: false, mode: null });
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.sendRequest('tools/list', {}) as { tools: McpTool[] };
    return result.tools || [];
  }

  async listResources(): Promise<McpResource[]> {
    const result = await this.sendRequest('resources/list', {}) as { resources: McpResource[] };
    return result.resources || [];
  }

  async readResource(uri: string): Promise<McpResourceContent> {
    const result = await this.sendRequest('resources/read', { uri }) as {
      contents: McpResourceContent[];
    };
    return result.contents[0];
  }

  async callTool<T = unknown>(name: string, args: object): Promise<T> {
    const result = await this.sendRequest('tools/call', { name, arguments: args }) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };

    if (result.isError) {
      const errorText = result.content?.[0]?.text || 'Tool call failed';
      throw new Error(errorText);
    }

    const text = result.content?.[0]?.text;
    if (text === undefined) {
      return undefined as T;
    }

    // Try JSON parse first
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        reject(new Error('MCP process not running'));
        return;
      }

      const id = this.nextId++;
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject, method });
      const data = JSON.stringify(request) + '\n';
      this.process.stdin.write(data);
    });
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.process?.stdin?.writable) { return; }
    const notification = { jsonrpc: '2.0', method, params };
    this.process.stdin.write(JSON.stringify(notification) + '\n');
  }

  private handleData(data: Buffer): void {
    this.buffer += this.decoder.decode(data, { stream: true });
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { continue; }
      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse;
        if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
          const pending = this.pendingRequests.get(msg.id)!;
          this.pendingRequests.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(msg.error.message));
          } else {
            pending.resolve(msg.result);
          }
        }
      } catch {
        // Not JSON - skip
      }
    }
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}
