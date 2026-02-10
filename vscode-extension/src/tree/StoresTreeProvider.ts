/**
 * Stores Tree - Multi-store support (placeholder for Phase 2)
 * 
 * Template for store switching. Will show available stores when
 * list_stores and select_store tools are implemented.
 */

import * as vscode from 'vscode';

export class StoresTreeProvider implements vscode.TreeDataProvider<StoreItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<StoreItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: StoreItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<StoreItem[]> {
    return [
      new StoreItem(
        'default',
        'Default local store',
        'database',
        true,
      ),
      new StoreItem(
        'Multi-store support coming in Phase 2',
        'Store switching will be available in a future release',
        'info',
        false,
      ),
    ];
  }
}

class StoreItem extends vscode.TreeItem {
  constructor(
    label: string,
    tooltip: string,
    iconId: string,
    isActive: boolean,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = tooltip;
    if (isActive) {
      this.iconPath = new vscode.ThemeIcon('database', new vscode.ThemeColor('testing.iconPassed'));
      this.description = '(active)';
    } else {
      this.iconPath = new vscode.ThemeIcon(iconId);
    }
    this.contextValue = isActive ? 'activeStore' : 'storeItem';
  }
}
