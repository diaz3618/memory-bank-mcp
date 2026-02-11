/**
 * Remote Servers Tree - Management of remote MCP server connections
 *
 * Shows configured remote servers (HTTP mode) and provides
 * actions to add, connect, disconnect, and remove them.
 */

import * as vscode from 'vscode';
import { ext } from '../extensionVariables';

type RemoteNode = RemoteServerItem | RemoteInfoItem;

interface RemoteServerConfig {
  name: string;
  baseUrl: string;
  authToken?: string;
  lastConnected?: string;
}

export class RemoteServersTreeProvider implements vscode.TreeDataProvider<RemoteNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<RemoteNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: RemoteNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: RemoteNode): Promise<RemoteNode[]> {
    if (element) {
      if (element instanceof RemoteServerItem) {
        return this.getServerDetails(element.serverConfig);
      }
      return [];
    }

    // Root level
    const servers = this.getConfiguredServers();
    const items: RemoteNode[] = [];

    if (servers.length === 0) {
      items.push(new RemoteInfoItem(
        'No remote servers configured',
        'info',
        'Add a remote MCP server via HTTP connection',
      ));
    } else {
      for (const server of servers) {
        items.push(new RemoteServerItem(server));
      }
    }

    // Always show "Add Server" action
    items.push(new RemoteInfoItem(
      'Add Remote Server...',
      'add',
      'Configure a new remote MCP server connection',
      { command: 'memoryBank.addRemoteServer', title: 'Add Remote Server' },
    ));

    return items;
  }

  private getServerDetails(server: RemoteServerConfig): RemoteInfoItem[] {
    const items: RemoteInfoItem[] = [];
    items.push(new RemoteInfoItem(`URL: ${server.baseUrl}`, 'link'));
    items.push(new RemoteInfoItem(
      `Auth: ${server.authToken ? 'Configured' : 'None'}`,
      server.authToken ? 'shield' : 'unlock',
    ));
    if (server.lastConnected) {
      items.push(new RemoteInfoItem(`Last connected: ${server.lastConnected}`, 'clock'));
    }
    return items;
  }

  private getConfiguredServers(): RemoteServerConfig[] {
    const servers: RemoteServerConfig[] = [];

    // Check if HTTP mode is configured
    const config = vscode.workspace.getConfiguration('memoryBank');
    const mode = config.get<string>('connectionMode', 'stdio');
    const baseUrl = config.get<string>('http.baseUrl', '');

    if (mode === 'http' && baseUrl) {
      servers.push({
        name: 'Default Remote',
        baseUrl,
        authToken: config.get<string>('http.authToken'),
        lastConnected: ext.mcpClientManager?.isConnected() ? new Date().toISOString() : undefined,
      });
    }

    // Load additional servers from workspace state
    const remoteServers = ext.context?.workspaceState.get<RemoteServerConfig[]>('memoryBank.remoteServers') ?? [];
    servers.push(...remoteServers);

    return servers;
  }
}

class RemoteServerItem extends vscode.TreeItem {
  constructor(public readonly serverConfig: RemoteServerConfig) {
    super(serverConfig.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = serverConfig.baseUrl;
    this.tooltip = `${serverConfig.name}\n${serverConfig.baseUrl}`;
    this.iconPath = new vscode.ThemeIcon('remote-explorer');
    this.contextValue = 'remoteServer';
  }
}

class RemoteInfoItem extends vscode.TreeItem {
  constructor(
    label: string,
    iconId: string,
    tooltip?: string,
    command?: vscode.Command,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(iconId);
    if (tooltip) { this.tooltip = tooltip; }
    if (command) { this.command = command; }
    this.contextValue = 'remoteInfo';
  }
}
