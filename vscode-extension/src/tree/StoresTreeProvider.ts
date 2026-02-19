/**
 * Stores Tree - Multi-store management
 *
 * Shows available Memory Bank stores with status and switching.
 * Uses list_stores MCP tool for real data.
 */

import * as vscode from 'vscode';
import { ext } from '../extensionVariables';
import type { StoreInfo } from '../mcp/types';

type StoreNode = StoreItem | StoreInfoItem;

export class StoresTreeProvider implements vscode.TreeDataProvider<StoreNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<StoreNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: StoreNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: StoreNode): Promise<StoreNode[]> {
    if (!ext.mcpClientManager?.isConnected()) {
      return [new StoreInfoItem('Connect to server first', 'plug')];
    }

    // Stores are a local-only concept (multi-project on filesystem)
    const connMode = ext.mcpClientManager.getConnectionStatus()?.mode ?? 'stdio';
    if (connMode === 'http') {
      return [new StoreInfoItem(
        'Not available in HTTP mode',
        'info',
      )];
    }

    if (!element) {
      return this.getRootChildren();
    }

    if (element instanceof StoreItem) {
      return this.getStoreDetails(element.storeInfo);
    }

    return [];
  }

  private async getRootChildren(): Promise<StoreNode[]> {
    try {
      const client = await ext.mcpClientManager.getClient();
      const result = await client.listStores();

      if (!result.stores || result.stores.length === 0) {
        return [new StoreInfoItem('No stores found — initialize Memory Bank first', 'info')];
      }

      return result.stores.map(store => new StoreItem(store));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('Unknown tool')) {
        return [new StoreInfoItem('Store management requires server v1.2+', 'info')];
      }
      return [new StoreInfoItem('Error loading stores', 'error')];
    }
  }

  private getStoreDetails(store: StoreInfo): StoreInfoItem[] {
    const items: StoreInfoItem[] = [];
    items.push(new StoreInfoItem(`Path: ${store.path}`, 'folder'));
    items.push(new StoreInfoItem(`Kind: ${store.kind}`, 'remote-explorer'));
    items.push(new StoreInfoItem(`Files: ${store.fileCount}`, 'files'));
    items.push(new StoreInfoItem(
      `Graph: ${store.hasGraph ? 'Yes' : 'No'}`,
      store.hasGraph ? 'check' : 'close',
    ));
    return items;
  }
}

class StoreItem extends vscode.TreeItem {
  constructor(public readonly storeInfo: StoreInfo) {
    super(storeInfo.id, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = storeInfo.kind;
    this.tooltip = `${storeInfo.id} (${storeInfo.kind}) — ${storeInfo.path}`;

    if (storeInfo.isActive) {
      this.iconPath = new vscode.ThemeIcon('database', new vscode.ThemeColor('testing.iconPassed'));
      this.description = `${storeInfo.kind} (active)`;
    } else {
      this.iconPath = new vscode.ThemeIcon('database');
    }

    this.contextValue = storeInfo.isActive ? 'activeStore' : 'inactiveStore';
  }
}

class StoreInfoItem extends vscode.TreeItem {
  constructor(label: string, iconId: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(iconId);
    this.contextValue = 'storeInfo';
  }
}
