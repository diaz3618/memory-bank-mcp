/**
 * Stdio MCP Client
 * 
 * Spawns memory-bank-mcp as a child process and communicates via stdio.
 * This is the recommended connection mode for local development.
 */

import { spawn, ChildProcess } from 'child_process';
import { BaseMcpClient } from './BaseMcpClient';
import {
  ConnectionConfig,
  McpTool,
  McpResource,
  McpResourceContent,
  StdioConnectionConfig,
} from './types';

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
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface McpInitializeResult {
  protocolVersion: string;
  serverInfo: {
    name: string;
    version: string;
  };
  capabilities: {
    tools?: Record<string, unknown>;
    resources?: Record<string, unknown>;
  };
}

interface McpToolsListResult {
  tools: McpTool[];
}

interface McpResourcesListResult {
  resources: McpResource[];
}

interface McpResourceReadResult {
  contents: McpResourceContent[];
}

interface McpCallToolResult {
  content: Array<{
    type: string;
    text?: string;
  }>;
  isError?: boolean;
}

export class StdioMcpClient extends BaseMcpClient {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private buffer = '';
  private serverCapabilities: McpInitializeResult['capabilities'] | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    if (config.mode !== 'stdio') {
      throw new Error('StdioMcpClient only supports stdio mode');
    }

    const stdioConfig = config as StdioConnectionConfig;
    
    try {
      this.updateStatus({ connected: false, mode: 'stdio', error: undefined });
      
      // Spawn the MCP server process
      this.process = spawn(stdioConfig.command, stdioConfig.args, {
        cwd: stdioConfig.cwd,
        env: { ...process.env, ...stdioConfig.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Handle stdout - parse JSON-RPC messages
      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleData(data.toString());
      });

      // Handle stderr - log errors but don't fail
      this.process.stderr?.on('data', (data: Buffer) => {
        console.error('[MCP Server Error]', data.toString());
      });

      // Handle process exit
      this.process.on('exit', (code) => {
        this.updateStatus({ connected: false, error: `Process exited with code ${code}` });
        this.process = null;
        this.rejectAllPending(new Error(`MCP server process exited with code ${code}`));
      });

      this.process.on('error', (err) => {
        this.updateStatus({ connected: false, error: err.message });
        this.rejectAllPending(err);
      });

      // Initialize the MCP connection
      const initResult = await this.sendRequest<McpInitializeResult>('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: { listChanged: true },
        },
        clientInfo: {
          name: 'memory-bank-vscode',
          version: '1.0.0',
        },
      });

      this.serverCapabilities = initResult.capabilities;
      
      // Send initialized notification
      this.sendNotification('notifications/initialized', {});

      this.updateStatus({
        connected: true,
        serverVersion: initResult.serverInfo.version,
        lastConnected: new Date(),
      });
    } catch (error) {
      this.updateStatus({ 
        connected: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.rejectAllPending(new Error('Client disconnected'));
    this.updateStatus({ connected: false, mode: null });
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.sendRequest<McpToolsListResult>('tools/list', {});
    return result.tools;
  }

  async listResources(): Promise<McpResource[]> {
    const result = await this.sendRequest<McpResourcesListResult>('resources/list', {});
    return result.resources;
  }

  async readResource(uri: string): Promise<McpResourceContent> {
    const result = await this.sendRequest<McpResourceReadResult>('resources/read', { uri });
    return result.contents[0];
  }

  async callTool<T = unknown>(name: string, args: object): Promise<T> {
    const result = await this.sendRequest<McpCallToolResult>('tools/call', {
      name,
      arguments: args,
    });

    if (result.isError) {
      const errorText = result.content.find(c => c.type === 'text')?.text || 'Unknown error';
      throw new Error(errorText);
    }

    // Parse the text content as JSON if possible
    const textContent = result.content.find(c => c.type === 'text')?.text;
    if (textContent) {
      return this.parseToolResult<T>(textContent);
    }

    return result as unknown as T;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private handleData(data: string): void {
    this.buffer += data;
    
    // Process complete JSON-RPC messages (newline-delimited)
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      
      if (line) {
        try {
          const message = JSON.parse(line) as JsonRpcResponse;
          this.handleMessage(message);
        } catch (e) {
          console.error('[MCP] Failed to parse message:', line, e);
        }
      }
    }
  }

  private handleMessage(message: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(message.id);
    if (pending) {
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        pending.reject(new Error(`${message.error.message} (code: ${message.error.code})`));
      } else {
        pending.resolve(message.result);
      }
    }
  }

  private sendRequest<T>(method: string, params: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('MCP server not connected'));
        return;
      }

      const id = ++this.requestId;
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      try {
        this.process.stdin.write(JSON.stringify(request) + '\n');
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.process?.stdin) {
      return;
    }

    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    try {
      this.process.stdin.write(JSON.stringify(notification) + '\n');
    } catch (error) {
      console.error('[MCP] Failed to send notification:', error);
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [, pending] of this.pendingRequests) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}
