/**
 * HTTP MCP Client
 * 
 * Connects to a remote MCP server via HTTP/REST.
 * Useful for shared server deployments or cloud-based setups.
 */

import { BaseMcpClient } from './BaseMcpClient';
import {
  ConnectionConfig,
  HttpConnectionConfig,
  McpTool,
  McpResource,
  McpResourceContent,
} from './types';

interface HttpMcpResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
}

export class HttpMcpClient extends BaseMcpClient {
  private baseUrl: string = '';
  private authToken?: string;
  private timeout: number = 30000;
  private abortController?: AbortController;

  async connect(config: ConnectionConfig): Promise<void> {
    if (config.mode !== 'http') {
      throw new Error('HttpMcpClient only supports http mode');
    }

    const httpConfig = config as HttpConnectionConfig;
    this.baseUrl = httpConfig.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.authToken = httpConfig.authToken;
    this.timeout = httpConfig.timeout || 30000;

    try {
      this.updateStatus({ connected: false, mode: 'http', error: undefined });

      // Test the connection by getting server info
      const serverInfo = await this.request<{ name: string; version: string }>('GET', '/info');

      this.updateStatus({
        connected: true,
        serverVersion: serverInfo.version,
        lastConnected: new Date(),
      });
    } catch (error) {
      this.updateStatus({
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.abortController?.abort();
    this.updateStatus({ connected: false, mode: null });
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.request<{ tools: McpTool[] }>('GET', '/tools');
    return result.tools;
  }

  async listResources(): Promise<McpResource[]> {
    const result = await this.request<{ resources: McpResource[] }>('GET', '/resources');
    return result.resources;
  }

  async readResource(uri: string): Promise<McpResourceContent> {
    const result = await this.request<{ content: McpResourceContent }>(
      'GET',
      `/resources/${encodeURIComponent(uri)}`
    );
    return result.content;
  }

  async callTool<T = unknown>(name: string, args: object): Promise<T> {
    const result = await this.request<{ result: T }>('POST', '/tools/call', {
      name,
      arguments: args,
    });
    return result.result;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    this.abortController = new AbortController();
    const timeoutId = setTimeout(() => this.abortController?.abort(), this.timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: this.abortController.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(
          errorData.error?.message || 
          `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json() as HttpMcpResponse<T>;
      
      if (!data.success && data.error) {
        throw new Error(data.error.message);
      }

      return data.data as T;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      
      throw error;
    }
  }
}
