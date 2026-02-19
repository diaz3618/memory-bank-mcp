/**
 * Actions Tree - quick action buttons for Memory Bank management
 *
 * Adapts available actions based on connection mode:
 * - stdio: Full local actions (Set Path, Initialize, Install Server, etc.)
 * - http:  Database-oriented actions (Initialize grayed if DB already initialized,
 *          Set Path disabled, Install Server offers HTTP option)
 *
 * Only extension-level operations belong here.
 * MCP server operations (track progress, log decision, update context) are
 * handled by the AI agent through MCP tools — not the extension UI.
 */

import * as vscode from 'vscode';
import { ext } from '../extensionVariables';

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
    const connMode = ext.mcpClientManager?.getConnectionStatus()?.mode ?? null;
    const isHttp = connMode === 'http';
    const connected = ext.mcpClientManager?.isConnected() ?? false;

    const items: ActionItem[] = [];

    // Set Path — only useful for stdio (local file mode)
    if (isHttp) {
      items.push(ActionItem.disabled(
        'Set Path',
        'Not available in HTTP mode (data stored in database)',
        'folder-opened',
      ));
    } else {
      items.push(new ActionItem('Set Path', 'Change Memory Bank path', 'folder-opened',
        { command: 'memoryBank.setPath', title: 'Set Path' }));
    }

    // Initialize — check if DB is already initialized for HTTP mode
    if (isHttp && connected) {
      try {
        const status = await ext.memoryBankService.getStatus();
        if (status.isComplete) {
          items.push(ActionItem.disabled(
            '$(pass-filled) Initialized',
            'Database has been initialized. All core records are present.',
            'database',
          ));
        } else {
          items.push(new ActionItem('Initialize', 'Initialize Memory Bank in database', 'add',
            { command: 'memoryBank.initialize', title: 'Initialize' }));
        }
      } catch {
        items.push(new ActionItem('Initialize', 'Initialize Memory Bank in database', 'add',
          { command: 'memoryBank.initialize', title: 'Initialize' }));
      }
    } else {
      items.push(new ActionItem('Initialize', 'Initialize Memory Bank in workspace', 'add',
        { command: 'memoryBank.initialize', title: 'Initialize' }));
    }

    items.push(new ActionItem('Install Server', 'Install or configure MCP server', 'desktop-download',
      { command: 'memoryBank.installServer', title: 'Install Server' }));
    items.push(new ActionItem('Configure Server', 'Edit MCP server configuration', 'settings-gear',
      { command: 'memoryBank.configureServer', title: 'Configure Server' }));
    items.push(new ActionItem('Copilot Agent (stdio)', 'Generate .github/copilot-instructions.md for local npx setup', 'hubot',
      { command: 'memoryBank.createCopilotAgent.stdio', title: 'Create Copilot Agent (stdio)' }));
    items.push(new ActionItem('Copilot Agent (HTTP)', 'Generate .github/copilot-instructions.md for HTTP/Docker/Postgres setup', 'hubot',
      { command: 'memoryBank.createCopilotAgent.http', title: 'Create Copilot Agent (HTTP)' }));

    return items;
  }
}

class ActionItem extends vscode.TreeItem {
  constructor(
    label: string,
    tooltip: string,
    iconId: string,
    command?: vscode.Command,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = tooltip;
    this.iconPath = new vscode.ThemeIcon(iconId);
    if (command) {
      this.command = command;
    }
    this.contextValue = 'actionItem';
  }

  /** Create a disabled (grayed-out) action item with no command. */
  static disabled(label: string, tooltip: string, iconId: string): ActionItem {
    const item = new ActionItem(label, tooltip, iconId);
    // No command = not clickable (grayed out appearance via description)
    item.description = '(unavailable)';
    item.contextValue = 'actionItem-disabled';
    return item;
  }
}
