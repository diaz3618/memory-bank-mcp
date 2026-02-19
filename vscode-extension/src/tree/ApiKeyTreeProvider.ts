/**
 * API Key Tree — shows API keys and management actions.
 *
 * Fetches keys from the HTTP server's REST API via ApiKeyService.
 * Shows an actionable message when auth is not configured.
 */

import * as vscode from 'vscode';
import { ext } from '../extensionVariables';
import type { ApiKeyInfo } from '../services/ApiKeyService.js';

type ApiKeyNode = ApiKeyItem | ApiKeyInfoItem;

/** Format an ISO date string as a relative time (e.g. "3d ago", "2h ago"). */
function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) {
    // Future date (e.g. expiry)
    const absSec = Math.round(-ms / 1000);
    if (absSec < 60) return 'in <1m';
    if (absSec < 3600) return `in ${Math.floor(absSec / 60)}m`;
    if (absSec < 86400) return `in ${Math.floor(absSec / 3600)}h`;
    return `in ${Math.floor(absSec / 86400)}d`;
  }
  const sec = Math.round(ms / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 2592000) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export class ApiKeyTreeProvider implements vscode.TreeDataProvider<ApiKeyNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ApiKeyNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private cachedKeys: ApiKeyInfo[] | null = null;
  private lastError: string | null = null;
  private _showRevoked = true;
  private _filterText = '';

  /** Toggle showing revoked/expired keys. */
  toggleShowRevoked(): void {
    this._showRevoked = !this._showRevoked;
    this.cachedKeys = null;
    this._onDidChangeTreeData.fire(undefined);
  }

  get showRevoked(): boolean {
    return this._showRevoked;
  }

  /** Set filter text for searching keys. */
  setFilter(text: string): void {
    this._filterText = text.toLowerCase();
    this._onDidChangeTreeData.fire(undefined);
  }

  refresh(): void {
    this.cachedKeys = null;
    this.lastError = null;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ApiKeyNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ApiKeyNode): Promise<ApiKeyNode[]> {
    // Child nodes for an individual key
    if (element) {
      if (element instanceof ApiKeyItem) {
        return this.getKeyDetails(element.keyInfo);
      }
      return [];
    }

    // Root level
    const items: ApiKeyNode[] = [];

    // Check HTTP mode + auth
    const config = vscode.workspace.getConfiguration('memoryBank');
    const mode = config.get<string>('connectionMode', 'stdio');

    if (mode !== 'http') {
      items.push(new ApiKeyInfoItem(
        'HTTP mode required',
        'warning',
        'API key management requires memoryBank.connectionMode = "http"',
      ));
      items.push(new ApiKeyInfoItem(
        'Open Settings...',
        'gear',
        'Configure HTTP connection',
        { command: 'memoryBank.configureServer', title: 'Configure Server' },
      ));
      return items;
    }

    const authToken = config.get<string>('http.authToken', '');
    if (!authToken) {
      items.push(new ApiKeyInfoItem(
        'No API key configured',
        'lock',
        'An API key is required to authenticate with the server',
      ));
      items.push(new ApiKeyInfoItem(
        '$(key) Enter API Key...',
        'key',
        'Paste an API key from your deployment (docker logs, .env, etc.)',
        { command: 'memoryBank.apiKeys.enterToken', title: 'Enter API Key' },
      ));
      items.push(new ApiKeyInfoItem(
        '$(terminal) Bootstrap from Database...',
        'database',
        'Connect directly to Postgres/Supabase to create the first API key',
        { command: 'memoryBank.apiKeys.bootstrap', title: 'Bootstrap API Key' },
      ));
      items.push(new ApiKeyInfoItem(
        '$(gear) Open Settings...',
        'gear',
        'Configure auth token manually in VS Code settings',
        { command: 'memoryBank.configureServer', title: 'Configure Server' },
      ));
      return items;
    }

    // Fetch keys
    try {
      if (!this.cachedKeys) {
        const { ApiKeyService } = await import('../services/ApiKeyService.js');
        const service = new ApiKeyService();
        const result = await service.listKeys(this._showRevoked);
        this.cachedKeys = result.keys;
      }

      let displayKeys = this.cachedKeys;

      // Apply text filter
      if (this._filterText) {
        displayKeys = displayKeys.filter(k =>
          (k.prefix.toLowerCase().includes(this._filterText)) ||
          (k.label?.toLowerCase().includes(this._filterText)) ||
          (k.status.toLowerCase().includes(this._filterText)) ||
          (k.id.toLowerCase().includes(this._filterText)),
        );
      }

      if (displayKeys.length === 0) {
        const msg = this._filterText
          ? `No keys matching "${this._filterText}"`
          : 'No API keys found';
        items.push(new ApiKeyInfoItem(
          msg,
          'info',
          'Create a new API key to get started',
        ));
      } else {
        // Summary header
        const active = displayKeys.filter(k => k.status === 'active').length;
        const revoked = displayKeys.filter(k => k.status !== 'active').length;
        const summaryParts = [`${active} active`];
        if (revoked > 0) summaryParts.push(`${revoked} revoked/expired`);
        items.push(new ApiKeyInfoItem(
          summaryParts.join(', '),
          'info',
          `Total: ${displayKeys.length} key(s)`,
        ));

        for (const key of displayKeys) {
          items.push(new ApiKeyItem(key));
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      ext.outputChannel.appendLine(`ApiKeyTree: Failed to load keys — ${msg}`);
      items.push(new ApiKeyInfoItem(
        'Failed to load keys',
        'error',
        msg,
      ));
      items.push(new ApiKeyInfoItem(
        'Retry',
        'refresh',
        'Reload API keys',
        { command: 'memoryBank.apiKeys.refresh', title: 'Refresh' },
      ));
    }

    return items;
  }

  private getKeyDetails(key: ApiKeyInfo): ApiKeyInfoItem[] {
    const details: ApiKeyInfoItem[] = [];

    details.push(new ApiKeyInfoItem(`ID: ${key.id}`, 'key'));

    if (key.label) {
      details.push(new ApiKeyInfoItem(`Label: ${key.label}`, 'tag'));
    }

    details.push(new ApiKeyInfoItem(`Prefix: ${key.prefix}...`, 'symbol-key'));

    const statusIcon = key.status === 'active' ? 'pass-filled'
      : key.status === 'revoked' ? 'circle-slash'
      : 'warning'; // expired
    details.push(new ApiKeyInfoItem(`Status: ${key.status}`, statusIcon));

    if (key.scopes.length > 0) {
      details.push(new ApiKeyInfoItem(`Scopes: ${key.scopes.join(', ')}`, 'shield'));
    }

    details.push(new ApiKeyInfoItem(
      `Rate limit: ${key.rateLimit > 0 ? `${key.rateLimit}/min` : 'Unlimited'}`,
      'dashboard',
    ));

    const createdRel = formatRelative(key.createdAt);
    details.push(new ApiKeyInfoItem(
      `Created: ${createdRel}`,
      'calendar',
      key.createdAt,
    ));

    if (key.lastUsedAt) {
      const usedRel = formatRelative(key.lastUsedAt);
      details.push(new ApiKeyInfoItem(
        `Last used: ${usedRel}`,
        'clock',
        key.lastUsedAt,
      ));
    } else {
      details.push(new ApiKeyInfoItem('Last used: never', 'clock'));
    }

    if (key.expiresAt) {
      const expiresRel = formatRelative(key.expiresAt);
      const isExpired = new Date(key.expiresAt) < new Date();
      details.push(new ApiKeyInfoItem(
        `${isExpired ? 'Expired' : 'Expires'}: ${expiresRel}`,
        isExpired ? 'warning' : 'watch',
        key.expiresAt,
      ));
    }

    if (key.revokedAt) {
      const revokedRel = formatRelative(key.revokedAt);
      details.push(new ApiKeyInfoItem(
        `Revoked: ${revokedRel}`,
        'circle-slash',
        key.revokedAt,
      ));
    }

    return details;
  }
}

// ---------- Tree Items ----------

export class ApiKeyItem extends vscode.TreeItem {
  constructor(public readonly keyInfo: ApiKeyInfo) {
    super(
      `${keyInfo.prefix}...`,
      vscode.TreeItemCollapsibleState.Collapsed,
    );

    const statusIcon = keyInfo.status === 'active' ? 'pass-filled'
      : keyInfo.status === 'revoked' ? 'circle-slash'
      : 'warning';
    const statusColor = keyInfo.status === 'active' ? 'testing.iconPassed'
      : keyInfo.status === 'revoked' ? 'testing.iconFailed'
      : 'editorWarning.foreground';

    // Show label + environment badge in description
    const env = keyInfo.prefix.startsWith('mbmcp_test') ? '[TEST]' : '[LIVE]';
    this.description = `${env} ${keyInfo.label ?? keyInfo.status}`;

    const createdRel = formatRelative(keyInfo.createdAt);
    const expiresInfo = keyInfo.expiresAt
      ? `Expires: ${formatRelative(keyInfo.expiresAt)}`
      : 'No expiry';

    this.tooltip = [
      `Prefix: ${keyInfo.prefix}`,
      `Status: ${keyInfo.status}`,
      keyInfo.label ? `Label: ${keyInfo.label}` : null,
      `Environment: ${env}`,
      `Created: ${createdRel} (${keyInfo.createdAt})`,
      expiresInfo,
      keyInfo.scopes.length > 0 ? `Scopes: ${keyInfo.scopes.join(', ')}` : null,
      `Rate limit: ${keyInfo.rateLimit > 0 ? `${keyInfo.rateLimit}/min` : 'Unlimited'}`,
    ].filter(Boolean).join('\n');

    this.iconPath = new vscode.ThemeIcon(statusIcon, new vscode.ThemeColor(statusColor));
    this.contextValue = keyInfo.status === 'active' ? 'apiKey-active' : 'apiKey-inactive';
  }
}

class ApiKeyInfoItem extends vscode.TreeItem {
  constructor(
    label: string,
    iconId: string,
    tooltip?: string,
    command?: vscode.Command,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(iconId);
    if (tooltip) { this.tooltip = tooltip; }
    if (command) { this.command = command; }
    this.contextValue = 'apiKeyInfo';
  }
}
