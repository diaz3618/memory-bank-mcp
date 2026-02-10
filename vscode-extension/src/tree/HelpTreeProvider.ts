/**
 * Help Tree - Documentation links and getting started
 */

import * as vscode from 'vscode';

export class HelpTreeProvider implements vscode.TreeDataProvider<HelpItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<HelpItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: HelpItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<HelpItem[]> {
    return [
      new HelpItem('Getting Started', 'How to set up Memory Bank MCP', 'book',
        vscode.Uri.parse('https://github.com/diaz3618/memory-bank-mcp#readme')),
      new HelpItem('MCP Protocol Docs', 'Model Context Protocol specification', 'link-external',
        vscode.Uri.parse('https://modelcontextprotocol.io')),
      new HelpItem('Report Issue', 'Report a bug or request a feature', 'bug',
        vscode.Uri.parse('https://github.com/diaz3618/memory-bank-mcp/issues')),
      new HelpItem('Show Logs', 'View Memory Bank output logs', 'output',
        undefined, { command: 'memoryBank.showLogs', title: 'Show Logs' }),
    ];
  }
}

class HelpItem extends vscode.TreeItem {
  constructor(
    label: string,
    tooltip: string,
    iconId: string,
    uri?: vscode.Uri,
    command?: vscode.Command,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = tooltip;
    this.iconPath = new vscode.ThemeIcon(iconId);

    if (uri) {
      this.command = { command: 'vscode.open', title: 'Open', arguments: [uri] };
    } else if (command) {
      this.command = command;
    }

    this.contextValue = 'helpItem';
  }
}
