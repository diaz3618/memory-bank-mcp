/**
 * API Key Service
 *
 * REST client for the Memory Bank HTTP server's API key management endpoints.
 * Derives the server base URL from the configured MCP endpoint by stripping
 * the /mcp suffix, then calls:
 *
 *   POST   /api/keys       — Create a new API key
 *   GET    /api/keys       — List API keys
 *   DELETE /api/keys/:id   — Revoke an API key
 *
 * Authentication uses the same Bearer token configured for the MCP connection.
 */

import { ext } from '../extensionVariables';

// ---------- Types ----------

export interface ApiKeyCreateOptions {
  label?: string;
  scopes?: string[];
  rateLimit?: number;
  expiresInDays?: number;
  environment?: 'live' | 'test';
}

export interface ApiKeyCreateResult {
  id: string;
  key: string; // plaintext — shown only once
  prefix: string;
  label: string | null;
  scopes: string[];
  rateLimit: number;
  expiresAt: string | null;
  createdAt: string;
  warning: string;
}

export interface ApiKeyInfo {
  id: string;
  prefix: string;
  label: string | null;
  scopes: string[];
  rateLimit: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  status: 'active' | 'revoked' | 'expired';
}

export interface ApiKeyListResult {
  keys: ApiKeyInfo[];
  total: number;
}

export interface ApiKeyRevokeResult {
  message: string;
  id: string;
}

// ---------- Service ----------

export class ApiKeyService {
  /**
   * Derive the REST API base URL from the MCP connection config.
   *
   * The MCP baseUrl typically ends with `/mcp` (e.g. `http://host:3000/mcp`).
   * The API key routes live at `/api/keys` on the same server.
   * We strip the `/mcp` suffix (if present) to get the server root.
   */
  private getServerBaseUrl(): string {
    const config = ext.mcpClientManager.getConnectionConfig();
    if (!config || config.mode !== 'http') {
      throw new Error(
        'API key management requires an HTTP connection. ' +
        'Set memoryBank.connectionMode to "http" and configure memoryBank.http.baseUrl.',
      );
    }

    let baseUrl = config.baseUrl.replace(/\/$/, '');
    // Strip trailing /mcp (the MCP endpoint)
    if (baseUrl.endsWith('/mcp')) {
      baseUrl = baseUrl.slice(0, -4);
    }
    return baseUrl;
  }

  private getAuthToken(): string {
    const config = ext.mcpClientManager.getConnectionConfig();
    if (!config || config.mode !== 'http') {
      throw new Error('API key management requires an HTTP connection.');
    }
    return config.authToken ?? '';
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    const token = this.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Create a new API key.
   *
   * Returns the plaintext key — this is the ONLY time it's visible.
   */
  async createKey(options: ApiKeyCreateOptions = {}): Promise<ApiKeyCreateResult> {
    const url = `${this.getServerBaseUrl()}/api/keys`;

    ext.outputChannel.appendLine(`Creating API key: POST ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(options),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Failed to create API key: HTTP ${response.status} — ${body}`);
    }

    return (await response.json()) as ApiKeyCreateResult;
  }

  /**
   * List API keys for the authenticated user/project.
   */
  async listKeys(includeRevoked = false): Promise<ApiKeyListResult> {
    const base = this.getServerBaseUrl();
    const query = includeRevoked ? '?includeRevoked=true' : '';
    const url = `${base}/api/keys${query}`;

    ext.outputChannel.appendLine(`Listing API keys: GET ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: this.buildHeaders(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Failed to list API keys: HTTP ${response.status} — ${body}`);
    }

    return (await response.json()) as ApiKeyListResult;
  }

  /**
   * Revoke an API key (soft-delete).
   */
  async revokeKey(id: string): Promise<ApiKeyRevokeResult> {
    const url = `${this.getServerBaseUrl()}/api/keys/${encodeURIComponent(id)}`;

    ext.outputChannel.appendLine(`Revoking API key: DELETE ${url}`);

    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.buildHeaders(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Failed to revoke API key: HTTP ${response.status} — ${body}`);
    }

    return (await response.json()) as ApiKeyRevokeResult;
  }
}
