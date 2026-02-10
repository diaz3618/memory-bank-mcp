/**
 * Actions Tree - quick action buttons for Memory Bank operations
 */

import * as vscode from 'vscode';

export class ActionsTreeProvider implements vscode.TreeDataProvider<ActionItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ActionItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ActionItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<ActionItem[]> {
    return [
      new ActionItem('Track Progress', 'Log progress on current task', 'graph-line',
        { command: 'memoryBank.trackProgress', title: 'Track Progress' }),
      new ActionItem('Log Decision', 'Record an architectural decision', 'notebook',
        { command: 'memoryBank.logDecision', title: 'Log Decision' }),
      new ActionItem('Update Context', 'Update active context', 'edit',
        { command: 'memoryBank.updateContext', title: 'Update Context' }),
      new ActionItem('Set Path', 'Change Memory Bank path', 'folder-opened',
        { command: 'memoryBank.setPath', title: 'Set Path' }),
      new ActionItem('Install Server', 'Install or configure MCP server', 'desktop-download',
        { command: 'memoryBank.installServer', title: 'Install Server' }),
      new ActionItem('Configure Server', 'Edit MCP server configuration', 'settings-gear',
        { command: 'memoryBank.configureServer', title: 'Configure Server' }),
    ];
  }
}

class ActionItem extends vscode.TreeItem {
  constructor(
    label: string,
    tooltip: string,
    iconId: string,
    command: vscode.Command,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = tooltip;
    this.iconPath = new vscode.ThemeIcon(iconId);
    this.command = command;
    this.contextValue = 'actionItem';
  }
}
