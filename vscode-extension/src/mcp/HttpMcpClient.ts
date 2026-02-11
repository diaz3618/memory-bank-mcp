/**
 * HTTP MCP Client
 *
 * JSON-RPC 2.0 over Streamable HTTP transport.
 *
 * Implements the MCP Streamable HTTP protocol:
 * - POST JSON-RPC requests to the server endpoint
 * - Handles direct JSON-RPC responses (Content-Type: application/json)
 * - Handles SSE streams for long-running operations (Content-Type: text/event-stream)
 * - Session management via Mcp-Session-Id header
 *
 * Uses built-in fetch (Node 18+ / Electron), no external dependencies.
 */

import {
  ConnectionConfig,
  HttpConnectionConfig,
  McpResource,
  McpResourceContent,
  McpTool,
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

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export class HttpMcpClient extends BaseMcpClient {
  private baseUrl = '';
  private authToken = '';
  private sessionId: string | null = null;
  private nextId = 1;
  private abortController: AbortController | null = null;
  private timeout: number;

  constructor() {
    super();
    this.timeout = 30_000;
  }

  async connect(config: ConnectionConfig): Promise<void> {
    if (config.mode !== 'http') {
      throw new Error('HttpMcpClient requires http config');
    }
    const httpConfig = config as HttpConnectionConfig;
    this.baseUrl = httpConfig.baseUrl.replace(/\/$/, '');
    this.authToken = httpConfig.authToken ?? '';
    this.timeout = httpConfig.timeout ?? 30_000;
    this.abortController = new AbortController();

    ext.outputChannel.appendLine(`Connecting to MCP server (HTTP mode): ${this.baseUrl}`);

    try {
      // Initialize handshake
      const result = await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'memory-bank-vscode', version: '2.0.0' },
      });

      // Send initialized notification
      await this.sendNotification('notifications/initialized', {});

      ext.outputChannel.appendLine(
        `Connected to MCP server (HTTP). Session: ${this.sessionId ?? 'none'}`,
      );
      this.updateStatus({ connected: true, mode: 'http' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ext.outputChannel.appendLine(`HTTP connection failed: ${message}`);
      this.updateStatus({ connected: false, mode: null, error: message });
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    // Terminate session if we have one
    if (this.sessionId) {
      try {
        await fetch(this.baseUrl, {
          method: 'DELETE',
          headers: this.buildHeaders(),
          signal: AbortSignal.timeout(5_000),
        });
      } catch {
        // Best-effort session termination
      }
    }

    this.abortController?.abort();
    this.abortController = null;
    this.sessionId = null;
    this.updateStatus({ connected: false, mode: null });
  }

  async listTools(): Promise<McpTool[]> {
    const result = (await this.sendRequest('tools/list', {})) as { tools: McpTool[] };
    return result.tools || [];
  }

  async listResources(): Promise<McpResource[]> {
    const result = (await this.sendRequest('resources/list', {})) as {
      resources: McpResource[];
    };
    return result.resources || [];
  }

  async readResource(uri: string): Promise<McpResourceContent> {
    const result = (await this.sendRequest('resources/read', { uri })) as {
      contents: McpResourceContent[];
    };
    return result.contents[0];
  }

  async callTool<T = unknown>(name: string, args: object): Promise<T> {
    const result = (await this.sendRequest('tools/call', { name, arguments: args })) as {
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

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  // ---------- Internal transport ----------

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }

    return headers;
  }

  private async sendRequest(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(request),
      signal: this.abortController
        ? AbortSignal.any([this.abortController.signal, AbortSignal.timeout(this.timeout)])
        : AbortSignal.timeout(this.timeout),
    });

    // Capture session ID from response headers
    const newSessionId = response.headers.get('Mcp-Session-Id');
    if (newSessionId) {
      this.sessionId = newSessionId;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${response.statusText}${body ? ` — ${body}` : ''}`);
    }

    const contentType = response.headers.get('Content-Type') ?? '';

    if (contentType.includes('text/event-stream')) {
      // SSE response — collect events until we get a result for our request ID
      return this.readSseResponse(response, id);
    }

    // Direct JSON-RPC response
    const json = (await response.json()) as JsonRpcResponse;
    if (json.error) {
      throw new Error(`RPC error ${json.error.code}: ${json.error.message}`);
    }
    return json.result;
  }

  private async sendNotification(method: string, params: unknown): Promise<void> {
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    try {
      await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(notification),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      // Notifications are fire-and-forget
    }
  }

  /**
   * Read an SSE stream and extract the JSON-RPC response matching our request ID.
   *
   * SSE format:
   *   event: message
   *   data: { "jsonrpc": "2.0", "id": 1, "result": ... }
   */
  private async readSseResponse(response: Response, requestId: number): Promise<unknown> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body for SSE stream');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();

          // SSE data line
          if (trimmed.startsWith('data:')) {
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr) {
              continue;
            }

            try {
              const msg = JSON.parse(jsonStr) as JsonRpcResponse;
              if (msg.id === requestId) {
                reader.cancel().catch(() => {});
                if (msg.error) {
                  throw new Error(`RPC error ${msg.error.code}: ${msg.error.message}`);
                }
                return msg.result;
              }
            } catch (parseErr) {
              // Skip non-JSON or non-matching messages
              if (parseErr instanceof Error && parseErr.message.startsWith('RPC error')) {
                throw parseErr;
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    throw new Error('SSE stream ended without a response for our request');
  }
}
