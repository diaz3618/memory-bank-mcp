/**
 * Status Bar Manager
 * 
 * Manages the Memory Bank status bar items showing connection status,
 * current store, and sync information.
 */

import * as vscode from 'vscode';

export class StatusBarManager implements vscode.Disposable {
  private connectionItem: vscode.StatusBarItem;
  private storeItem: vscode.StatusBarItem;
  private syncItem: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];

  constructor(context: vscode.ExtensionContext) {
    // Connection status item (leftmost)
    this.connectionItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.connectionItem.command = 'memoryBank.showConnectionStatus';
    this.connectionItem.tooltip = 'Memory Bank: Click to show connection status';
    this.disposables.push(this.connectionItem);

    // Store info item
    this.storeItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      99
    );
    this.storeItem.command = 'memoryBank.switchStore';
    this.storeItem.tooltip = 'Memory Bank Store: Click to switch';
    this.disposables.push(this.storeItem);

    // Sync status item
    this.syncItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      98
    );
    this.syncItem.command = 'memoryBank.refreshData';
    this.syncItem.tooltip = 'Memory Bank: Click to refresh';
    this.disposables.push(this.syncItem);

    // Check if status bar is enabled
    const config = vscode.workspace.getConfiguration('memoryBank');
    if (config.get<boolean>('statusBar.enabled', true)) {
      this.connectionItem.show();
      this.storeItem.show();
      this.syncItem.show();
    }

    // Listen for configuration changes
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('memoryBank.statusBar.enabled')) {
          const enabled = vscode.workspace
            .getConfiguration('memoryBank')
            .get<boolean>('statusBar.enabled', true);
          
          if (enabled) {
            this.connectionItem.show();
            this.storeItem.show();
            this.syncItem.show();
          } else {
            this.connectionItem.hide();
            this.storeItem.hide();
            this.syncItem.hide();
          }
        }
      })
    );

    // Set initial state
    this.updateConnectionStatus(false);
    this.updateStoreInfo('default');
    this.updateSyncStatus();
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  /**
   * Update the connection status indicator
   */
  updateConnectionStatus(connected: boolean, error?: string): void {
    if (connected) {
      this.connectionItem.text = '$(plug) Memory Bank';
      this.connectionItem.backgroundColor = undefined;
      this.connectionItem.tooltip = 'Memory Bank: Connected. Click to show details.';
    } else {
      this.connectionItem.text = '$(warning) Memory Bank';
      this.connectionItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.connectionItem.tooltip = `Memory Bank: Disconnected${error ? ` - ${error}` : ''}. Click to reconnect.`;
      this.connectionItem.command = 'memoryBank.reconnect';
    }
  }

  /**
   * Update the store information
   */
  updateStoreInfo(storeId: string, entityCount?: number): void {
    const countText = entityCount !== undefined ? ` (${entityCount})` : '';
    this.storeItem.text = `$(database) ${storeId}${countText}`;
    this.storeItem.tooltip = `Store: ${storeId}${countText}\nClick to switch store`;
  }

  /**
   * Update the sync status
   */
  updateSyncStatus(lastSyncTime?: Date, syncing?: boolean): void {
    if (syncing) {
      this.syncItem.text = '$(sync~spin) Syncing...';
      this.syncItem.tooltip = 'Memory Bank: Syncing data...';
    } else if (lastSyncTime) {
      const timeAgo = this.getTimeAgo(lastSyncTime);
      this.syncItem.text = `$(check) ${timeAgo}`;
      this.syncItem.tooltip = `Last synced: ${lastSyncTime.toLocaleTimeString()}\nClick to refresh`;
    } else {
      this.syncItem.text = '$(refresh) Refresh';
      this.syncItem.tooltip = 'Click to refresh Memory Bank data';
    }
  }

  /**
   * Show a warning indicator (e.g., for conflicts)
   */
  showWarning(message: string): void {
    this.connectionItem.text = '$(alert) Memory Bank';
    this.connectionItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    this.connectionItem.tooltip = message;
  }

  /**
   * Clear any warning state
   */
  clearWarning(): void {
    this.updateConnectionStatus(true);
  }

  private getTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    
    if (seconds < 60) {
      return 'just now';
    }
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}m ago`;
    }
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours}h ago`;
    }
    
    return date.toLocaleDateString();
  }
}
