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

export class ApiKeyTreeProvider implements vscode.TreeDataProvider<ApiKeyNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ApiKeyNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private cachedKeys: ApiKeyInfo[] | null = null;
  private lastError: string | null = null;

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
        'Auth token not configured',
        'lock',
        'Set memoryBank.http.authToken to authenticate with the server',
      ));
      items.push(new ApiKeyInfoItem(
        'Open Settings...',
        'gear',
        'Configure auth token',
        { command: 'memoryBank.configureServer', title: 'Configure Server' },
      ));
      return items;
    }

    // Fetch keys
    try {
      if (!this.cachedKeys) {
        const { ApiKeyService } = await import('../services/ApiKeyService.js');
        const service = new ApiKeyService();
        const result = await service.listKeys(true); // include revoked for full view
        this.cachedKeys = result.keys;
      }

      if (this.cachedKeys.length === 0) {
        items.push(new ApiKeyInfoItem(
          'No API keys found',
          'info',
          'Create a new API key to get started',
        ));
      } else {
        for (const key of this.cachedKeys) {
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

    details.push(new ApiKeyInfoItem(`Rate limit: ${key.rateLimit}/min`, 'dashboard'));

    details.push(new ApiKeyInfoItem(`Created: ${key.createdAt}`, 'calendar'));

    if (key.lastUsedAt) {
      details.push(new ApiKeyInfoItem(`Last used: ${key.lastUsedAt}`, 'clock'));
    }

    if (key.expiresAt) {
      details.push(new ApiKeyInfoItem(`Expires: ${key.expiresAt}`, 'watch'));
    }

    if (key.revokedAt) {
      details.push(new ApiKeyInfoItem(`Revoked: ${key.revokedAt}`, 'circle-slash'));
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

    this.description = keyInfo.label ?? keyInfo.status;
    this.tooltip = [
      `Prefix: ${keyInfo.prefix}`,
      `Status: ${keyInfo.status}`,
      keyInfo.label ? `Label: ${keyInfo.label}` : null,
      `Created: ${keyInfo.createdAt}`,
      keyInfo.expiresAt ? `Expires: ${keyInfo.expiresAt}` : null,
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
