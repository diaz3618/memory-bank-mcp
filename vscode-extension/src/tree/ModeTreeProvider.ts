/**
 * Mode Tree - shows available modes with active highlighting
 */

import * as vscode from 'vscode';
import { ext } from '../extensionVariables';

const VALID_MODES = ['architect', 'code', 'ask', 'debug', 'test'];

const MODE_DESCRIPTIONS: Record<string, string> = {
  architect: 'High-level system design and architecture planning',
  code: 'Implementation and coding tasks',
  ask: 'Questions, research, and information gathering',
  debug: 'Debugging and troubleshooting',
  test: 'Testing and quality assurance',
};

const MODE_ICONS: Record<string, string> = {
  architect: 'symbol-structure',
  code: 'code',
  ask: 'comment-discussion',
  debug: 'debug',
  test: 'beaker',
};

export class ModeTreeProvider implements vscode.TreeDataProvider<ModeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ModeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private currentMode = 'unknown';

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ModeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<ModeItem[]> {
    if (!ext.mcpClientManager?.isConnected()) {
      return [new ModeItem('Connect to server first', '', 'plug', false)];
    }

    try {
      this.currentMode = await ext.memoryBankService.getCurrentMode();
    } catch {
      this.currentMode = 'unknown';
    }

    return VALID_MODES.map(mode => {
      const isActive = mode === this.currentMode;
      return new ModeItem(
        mode.charAt(0).toUpperCase() + mode.slice(1),
        MODE_DESCRIPTIONS[mode] || mode,
        MODE_ICONS[mode] || 'symbol-enum',
        isActive,
        {
          command: 'memoryBank.switchMode',
          title: `Switch to ${mode}`,
          arguments: [mode],
        },
      );
    });
  }
}

class ModeItem extends vscode.TreeItem {
  constructor(
    label: string,
    tooltip: string,
    iconId: string,
    isActive: boolean,
    command?: vscode.Command,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = tooltip;

    if (isActive) {
      this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
      this.description = '(active)';
    } else {
      this.iconPath = new vscode.ThemeIcon(iconId);
    }

    if (command) {
      this.command = command;
      this.contextValue = `mode-${label.toLowerCase()}`;
    }
  }
}
