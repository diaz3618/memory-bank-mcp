/**
 * Actions Tree - quick action buttons for Memory Bank management
 *
 * Only extension-level operations belong here.
 * MCP server operations (track progress, log decision, update context) are
 * handled by the AI agent through MCP tools — not the extension UI.
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
      new ActionItem('Set Path', 'Change Memory Bank path', 'folder-opened',
        { command: 'memoryBank.setPath', title: 'Set Path' }),
      new ActionItem('Initialize', 'Initialize Memory Bank in workspace', 'add',
        { command: 'memoryBank.initialize', title: 'Initialize' }),
      new ActionItem('Install Server', 'Install or configure MCP server', 'desktop-download',
        { command: 'memoryBank.installServer', title: 'Install Server' }),
      new ActionItem('Configure Server', 'Edit MCP server configuration', 'settings-gear',
        { command: 'memoryBank.configureServer', title: 'Configure Server' }),
      new ActionItem('Create Copilot Agent', 'Generate .github/copilot-instructions.md', 'hubot',
        { command: 'memoryBank.createCopilotAgent', title: 'Create Copilot Agent' }),
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
