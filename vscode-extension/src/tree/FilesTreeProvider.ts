/**
 * Files Tree - shows memory bank files with click-to-open
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

    try {
      const files = await ext.memoryBankService.getFiles();
      if (files.length === 0) {
        return [new FileItem('No files found', '', new vscode.ThemeIcon('info'))];
      }

      return files.map(f => {
        const iconId = FILE_ICONS[f] || 'file';
        return new FileItem(
          f,
          f,
          new vscode.ThemeIcon(iconId),
          {
            command: 'memoryBank.openFile',
            title: 'Open File',
            arguments: [f],
          },
        );
      });
    } catch (error) {
      return [new FileItem(
        'Failed to load files',
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
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = tooltip;
    this.iconPath = icon;
    if (command) {
      this.command = command;
      this.contextValue = 'memoryBankFile';
    }
  }
}
