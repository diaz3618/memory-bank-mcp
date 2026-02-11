/**
 * Status Tree - shows connection & memory bank status
 */

import * as vscode from 'vscode';
import { ext } from '../extensionVariables';

export class StatusTreeProvider implements vscode.TreeDataProvider<StatusItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<StatusItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: StatusItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<StatusItem[]> {
    const items: StatusItem[] = [];

    // Connection status
    const connected = ext.mcpClientManager?.isConnected() ?? false;
    items.push(new StatusItem(
      connected ? 'Connected' : 'Disconnected',
      connected ? 'MCP server is running' : 'MCP server not connected',
      connected ? new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed')) 
                : new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed')),
    ));

    if (!connected) {
      items.push(new StatusItem(
        'Install / Configure Server',
        'Set up MCP server connection',
        new vscode.ThemeIcon('desktop-download'),
        { command: 'memoryBank.installServer', title: 'Install Server' },
      ));
      items.push(new StatusItem(
        'Reconnect',
        'Reconnect to MCP server',
        new vscode.ThemeIcon('debug-restart'),
        { command: 'memoryBank.reconnect', title: 'Reconnect' },
      ));
      return items;
    }

    // Memory bank status
    try {
      const status = await ext.memoryBankService.getStatus();
      
      items.push(new StatusItem(
        status.isComplete ? 'Memory Bank: Ready' : 'Memory Bank: Incomplete',
        status.isComplete ? 'All core files present' : `Missing: ${status.missingCoreFiles?.join(', ') || 'unknown'}`,
        status.isComplete 
          ? new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'))
          : new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground')),
      ));

      if (status.path) {
        items.push(new StatusItem(
          `Path: ${status.path}`,
          status.path,
          new vscode.ThemeIcon('folder'),
        ));
      }

      items.push(new StatusItem(
        `Files: ${status.files?.length || 0}`,
        `${status.files?.length || 0} files in memory bank`,
        new vscode.ThemeIcon('files'),
      ));

      // Current mode
      try {
        const mode = await ext.memoryBankService.getCurrentMode();
        items.push(new StatusItem(
          `Mode: ${mode}`,
          `Current mode is ${mode}`,
          new vscode.ThemeIcon('symbol-enum'),
        ));
      } catch {
        // Mode not available
      }

      if (status.language) {
        items.push(new StatusItem(
          `Language: ${status.language}`,
          status.language,
          new vscode.ThemeIcon('globe'),
        ));
      }
    } catch (error) {
      items.push(new StatusItem(
        'Not initialized',
        'Use Initialize to set up Memory Bank',
        new vscode.ThemeIcon('info'),
        { command: 'memoryBank.initialize', title: 'Initialize' },
      ));
    }

    return items;
  }
}

class StatusItem extends vscode.TreeItem {
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
    }
    this.contextValue = 'statusItem';
  }
}
