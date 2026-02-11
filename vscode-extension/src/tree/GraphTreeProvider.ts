/**
 * Graph Tree - Knowledge Graph visualization
 *
 * Displays entities, relations, and observations from the knowledge graph
 * by calling graph_search via MCP.
 */

import * as vscode from 'vscode';
import { ext } from '../extensionVariables';

type GraphNode = CategoryItem | EntityItem | RelationItem | InfoItem;

export class GraphTreeProvider implements vscode.TreeDataProvider<GraphNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<GraphNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: GraphNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: GraphNode): Promise<GraphNode[]> {
    if (!ext.mcpClientManager?.isConnected()) {
      return [new InfoItem('Connect to server first', 'plug')];
    }

    if (!element) {
      // Root level: categories
      return [
        new CategoryItem('Entities', 'Knowledge graph entities', 'symbol-class', 'entities'),
        new CategoryItem('Relations', 'Entity relationships', 'link', 'relations'),
      ];
    }

    if (element instanceof CategoryItem) {
      return this.getCategoryChildren(element.categoryId);
    }

    if (element instanceof EntityItem && element.observations.length > 0) {
      return element.observations.map(obs =>
        new InfoItem(`${obs.text}`, 'comment', obs.timestamp),
      );
    }

    return [];
  }

  private async getCategoryChildren(categoryId: string): Promise<GraphNode[]> {
    try {
      const client = await ext.mcpClientManager.getClient();
      // Search with wildcard to get everything (server now supports '*' as all-match)
      const result = await client.graphSearch({ query: '*', limit: 50 });

      if (categoryId === 'entities') {
        const entities = result?.entities;
        if (!entities || entities.length === 0) {
          return [new InfoItem('No entities yet — use graph_upsert_entity to create', 'info')];
        }
        return entities.map(e => new EntityItem(
          e.name ?? 'unnamed',
          e.entityType ?? 'unknown',
          e.id ?? '',
          Array.isArray(e.observations) ? e.observations : [],
        ));
      }

      if (categoryId === 'relations') {
        const relations = result?.relations;
        if (!relations || relations.length === 0) {
          return [new InfoItem('No relations yet — use graph_link_entities to create', 'info')];
        }
        return relations.map(r => new RelationItem(
          r.from ?? '?',
          r.to ?? '?',
          r.relationType ?? 'related',
        ));
      }

      return [];
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('not initialized') || msg.includes('Unknown tool')) {
        return [new InfoItem('Graph not available — initialize Memory Bank first', 'info')];
      }
      ext.outputChannel.appendLine(`Graph tree error: ${msg}`);
      return [new InfoItem(`Error loading graph`, 'error')];
    }
  }
}

class CategoryItem extends vscode.TreeItem {
  constructor(
    label: string,
    tooltip: string,
    iconId: string,
    public readonly categoryId: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.tooltip = tooltip;
    this.iconPath = new vscode.ThemeIcon(iconId);
    this.contextValue = 'graphCategory';
  }
}

class EntityItem extends vscode.TreeItem {
  constructor(
    public readonly name: string,
    public readonly entityType: string,
    public readonly entityId: string,
    public readonly observations: Array<{ text: string; timestamp: string }>,
  ) {
    super(
      name,
      observations.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    this.description = entityType;
    this.tooltip = `${name} [${entityType}] — ${observations.length} observations`;
    this.iconPath = new vscode.ThemeIcon('symbol-class');
    this.contextValue = 'graphEntity';
  }
}

class RelationItem extends vscode.TreeItem {
  constructor(from: string, to: string, relationType: string) {
    super(`${from} → ${to}`, vscode.TreeItemCollapsibleState.None);
    this.description = relationType;
    this.tooltip = `${from} --${relationType}--> ${to}`;
    this.iconPath = new vscode.ThemeIcon('arrow-right');
    this.contextValue = 'graphRelation';
  }
}

class InfoItem extends vscode.TreeItem {
  constructor(label: string, iconId: string, description?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(iconId);
    if (description) {
      this.description = description;
    }
    this.contextValue = 'graphInfo';
  }
}
