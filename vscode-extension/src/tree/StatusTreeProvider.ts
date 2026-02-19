/**
 * Status Tree - shows connection & memory bank status
 *
 * Adapts display based on connection mode:
 * - stdio: Shows local file-based status (path, file count)
 * - http:  Shows database-backed status (ready state, record count, mode, language)
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
    const connMode = ext.mcpClientManager?.getConnectionStatus()?.mode ?? null;

    items.push(new StatusItem(
      connected ? 'Connected' : 'Disconnected',
      connected
        ? `MCP server is running (${connMode ?? 'unknown'} mode)`
        : 'MCP server not connected',
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

    // Connection mode indicator
    if (connMode === 'http') {
      const config = vscode.workspace.getConfiguration('memoryBank');
      const baseUrl = config.get<string>('http.baseUrl', '');
      items.push(new StatusItem(
        'Transport: HTTP',
        `Connected to ${baseUrl}`,
        new vscode.ThemeIcon('cloud'),
      ));
    } else {
      items.push(new StatusItem(
        'Transport: stdio',
        'Local process via stdio',
        new vscode.ThemeIcon('terminal'),
      ));
    }

    // Memory bank status — works for both modes via MCP tools
    try {
      const status = await ext.memoryBankService.getStatus();
      
      items.push(new StatusItem(
        status.isComplete ? 'Memory Bank: Ready' : 'Memory Bank: Incomplete',
        status.isComplete ? 'All core files present' : `Missing: ${status.missingCoreFiles?.join(', ') || 'unknown'}`,
        status.isComplete 
          ? new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'))
          : new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground')),
      ));

      // Path — only meaningful for stdio (local files)
      if (connMode !== 'http' && status.path) {
        items.push(new StatusItem(
          `Path: ${status.path}`,
          status.path,
          new vscode.ThemeIcon('folder'),
        ));
      }

      // Files / Records count
      const fileCount = status.files?.length || 0;
      if (connMode === 'http') {
        items.push(new StatusItem(
          `Records: ${fileCount}`,
          `${fileCount} records in database`,
          new vscode.ThemeIcon('database'),
        ));
      } else {
        items.push(new StatusItem(
          `Files: ${fileCount}`,
          `${fileCount} files in memory bank`,
          new vscode.ThemeIcon('files'),
        ));
      }

      // Current mode — works for both
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

      // Language — show if available
      if (status.language) {
        items.push(new StatusItem(
          `Language: ${status.language}`,
          `Content language: ${status.language}`,
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
