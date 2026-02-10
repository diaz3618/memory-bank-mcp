/**
 * Graph Tree - Knowledge Graph entities (placeholder for Phase 2)
 * 
 * Template for future graph visualization. Currently shows placeholder items.
 * Will be populated when graph tools (graph_search, graph_open_nodes) are used.
 */

import * as vscode from 'vscode';

export class GraphTreeProvider implements vscode.TreeDataProvider<GraphItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<GraphItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: GraphItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: GraphItem): Promise<GraphItem[]> {
    if (!element) {
      // Root level
      return [
        new GraphItem('Entities', 'Knowledge graph entities', 'symbol-class',
          vscode.TreeItemCollapsibleState.Collapsed, 'graphCategory'),
        new GraphItem('Relations', 'Entity relationships', 'link',
          vscode.TreeItemCollapsibleState.Collapsed, 'graphCategory'),
        new GraphItem('Recent Observations', 'Latest observations', 'comment',
          vscode.TreeItemCollapsibleState.Collapsed, 'graphCategory'),
      ];
    }

    // Children of categories
    return [
      new GraphItem(
        'Graph features coming in Phase 2',
        'Knowledge graph tools will be available in a future release',
        'info',
        vscode.TreeItemCollapsibleState.None,
        'graphPlaceholder',
      ),
    ];
  }
}

class GraphItem extends vscode.TreeItem {
  constructor(
    label: string,
    tooltip: string,
    iconId: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    contextValue?: string,
  ) {
    super(label, collapsibleState);
    this.tooltip = tooltip;
    this.iconPath = new vscode.ThemeIcon(iconId);
    if (contextValue) {
      this.contextValue = contextValue;
    }
  }
}
