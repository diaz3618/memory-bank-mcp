/**
 * Files Tree - shows memory bank files with click-to-open
 *
 * Adapts display based on connection mode:
 * - stdio: Shows local files (click opens in editor)
 * - http:  Shows database records (click opens read-only preview)
 */

import * as vscode from 'vscode';
import { ext } from '../extensionVariables';

const FILE_ICONS: Record<string, string> = {
  'active-context.md': 'pulse',
  'progress.md': 'graph-line',
  'decision-log.md': 'notebook',
  'product-context.md': 'package',
  'system-patterns.md': 'symbol-structure',
};

export class FilesTreeProvider implements vscode.TreeDataProvider<FileItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FileItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: FileItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<FileItem[]> {
    if (!ext.mcpClientManager?.isConnected()) {
      return [new FileItem('Connect to server first', '', new vscode.ThemeIcon('plug'))];
    }

    const connMode = ext.mcpClientManager.getConnectionStatus()?.mode ?? 'stdio';

    try {
      const files = await ext.memoryBankService.getFiles();
      if (files.length === 0) {
        const emptyMsg = connMode === 'http'
          ? 'No records found in database'
          : 'No files found';
        return [new FileItem(emptyMsg, '', new vscode.ThemeIcon('info'))];
      }

      return files.map(f => {
        const iconId = FILE_ICONS[f] || 'file';
        const description = connMode === 'http' ? '(database)' : undefined;
        return new FileItem(
          f,
          connMode === 'http' ? `${f} (stored in database)` : f,
          new vscode.ThemeIcon(iconId),
          {
            command: 'memoryBank.openFile',
            title: 'Open File',
            arguments: [f],
          },
          description,
        );
      });
    } catch (error) {
      const msg = connMode === 'http'
        ? 'Failed to load records from database'
        : 'Failed to load files';
      return [new FileItem(
        msg,
        String(error),
        new vscode.ThemeIcon('error'),
      )];
    }
  }
}

class FileItem extends vscode.TreeItem {
  constructor(
    label: string,
    tooltip: string,
    icon: vscode.ThemeIcon,
    command?: vscode.Command,
    description?: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = tooltip;
    this.iconPath = icon;
    if (description) {
      this.description = description;
    }
    if (command) {
      this.command = command;
      this.contextValue = 'memoryBankFile';
    }
  }
}
