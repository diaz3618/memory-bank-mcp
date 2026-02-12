/**
 * Graph Webview Panel
 *
 * Manages a WebviewPanel (editor tab) that renders the knowledge graph
 * using React Flow. Communicates with the MCP server via the extension's
 * MCP client for search, expand, and mutation operations.
 *
 * Lifecycle: singleton panel — reopened if closed, revealed if already open.
 */

import * as vscode from 'vscode';
import { ext } from '../extensionVariables';

// ── Message types (extension ↔ webview) ──────────────────────────

/** Messages sent FROM the webview TO the extension. */
type WebviewMessage =
  | { type: 'loadGraph' }
  | { type: 'search'; query: string }
  | { type: 'nodeSelected'; nodeId: string | null }
  | { type: 'expandNode'; nodeId: string }
  | { type: 'deleteNode'; nodeId: string }
  | { type: 'addRelation'; fromId: string; toId?: string }
  | { type: 'rebuild' }
  | { type: 'upsertEntity'; name: string; entityType: string }
  | { type: 'addObservation'; entity: string; text: string }
  | { type: 'linkEntities'; from: string; to: string; relationType: string }
  | { type: 'duplicateEntity'; entityId: string; newName: string };

/** Entity node data for React Flow */
interface EntityNodeData {
  label: string;
  entityType: string;
  color: string;
  observationCount?: number;
  relationCount?: number;
  attrs?: Record<string, unknown>;
}

/** Entity node for React Flow */
interface EntityNode {
  id: string;
  type: 'entity';
  position: { x: number; y: number };
  data: EntityNodeData;
}

/** Relation edge for React Flow */
interface RelationEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  data?: {
    relationType: string;
    label?: string;
  };
}

/** Graph data payload sent to webview */
interface GraphDataPayload {
  type: 'graphData';
  nodes: EntityNode[];
  edges: RelationEdge[];
}

export class GraphWebviewPanel implements vscode.Disposable {
  private static instance: GraphWebviewPanel | undefined;
  private panel: vscode.WebviewPanel | undefined;
  private disposables: vscode.Disposable[] = [];
  private focusEntity: string | undefined;

  private constructor(private readonly extensionUri: vscode.Uri) {}

  static create(extensionUri: vscode.Uri, focusEntity?: string): GraphWebviewPanel {
    if (GraphWebviewPanel.instance?.panel) {
      GraphWebviewPanel.instance.focusEntity = focusEntity;
      GraphWebviewPanel.instance.panel.reveal(vscode.ViewColumn.One);
      if (focusEntity) {
        GraphWebviewPanel.instance.postMessage({
          type: 'focusNode',
          name: focusEntity,
        });
      }
      return GraphWebviewPanel.instance;
    }

    const inst = new GraphWebviewPanel(extensionUri);
    inst.focusEntity = focusEntity;
    inst.initPanel();
    GraphWebviewPanel.instance = inst;
    return inst;
  }

  dispose(): void {
    GraphWebviewPanel.instance = undefined;
    this.panel?.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }

  // ── Panel setup ──────────────────────────────────────────────────

  private initPanel(): void {
    const resourceRoot = vscode.Uri.joinPath(this.extensionUri, 'dist');

    this.panel = vscode.window.createWebviewPanel(
      'memoryBank.graphWebview',
      'Knowledge Graph',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [resourceRoot],
        retainContextWhenHidden: false,
      },
    );

    this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'resources', 'memoryBank.svg');

    this.panel.webview.html = this.getHtml(this.panel.webview, resourceRoot);

    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this.handleMessage(msg),
      undefined,
      this.disposables,
    );

    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
  }

  // ── Message handling ─────────────────────────────────────────────

  private async handleMessage(msg: WebviewMessage): Promise<void> {
    try {
      switch (msg.type) {
        case 'loadGraph':
          await this.loadInitialData();
          break;
        case 'search':
          await this.handleSearch(msg.query);
          break;
        case 'nodeSelected':
          // Could be used for Inspector panel or other actions
          ext.outputChannel.appendLine(`Node selected: ${msg.nodeId}`);
          break;
        case 'expandNode':
          await this.handleExpandNode(msg.nodeId);
          break;
        case 'deleteNode':
          await this.handleDeleteNode(msg.nodeId);
          break;
        case 'addRelation':
          await this.handleAddRelation(msg.fromId, msg.toId);
          break;
        case 'rebuild':
          await this.handleRebuild();
          break;
        case 'upsertEntity':
          await this.handleUpsertEntity(msg.name, msg.entityType);
          break;
        case 'addObservation':
          await this.handleAddObservation(msg.entity, msg.text);
          break;
        case 'linkEntities':
          await this.handleLinkEntitiesFromWebview(msg.from, msg.to, msg.relationType);
          break;
        case 'duplicateEntity':
          await this.handleDuplicateEntity(msg.entityId, msg.newName);
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ext.outputChannel.appendLine(`Graph webview error: ${message}`);
      vscode.window.showErrorMessage(`Graph error: ${message}`);
      // Reload graph to recover from error state
      await this.loadInitialData();
    }
  }

  private async loadInitialData(): Promise<void> {
    const client = await ext.mcpClientManager.getClient();
    const result = await client.graphSearch({ query: '*', limit: 500 });
    
    const payload = this.transformToGraphData(result);
    this.postMessage(payload);
  }

  private async handleSearch(query: string): Promise<void> {
    const client = await ext.mcpClientManager.getClient();
    const result = await client.graphSearch({ query, limit: 200 });
    
    const payload = this.transformToGraphData(result);
    this.postMessage(payload);
  }

  private async handleExpandNode(nodeId: string): Promise<void> {
    const client = await ext.mcpClientManager.getClient();
    const result = await client.graphOpenNodes([nodeId]);
    
    const payload = this.transformToGraphData(result);
    this.postMessage(payload);
  }

  private async handleDeleteNode(nodeId: string): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      `Delete entity "${nodeId}" and all its observations/relations?`,
      { modal: true },
      'Delete',
    );
    if (confirm !== 'Delete') return;

    const client = await ext.mcpClientManager.getClient();
    await client.graphDeleteEntity({ entity: nodeId });
    
    // Reload graph
    await this.loadInitialData();
    vscode.window.showInformationMessage(`Entity "${nodeId}" deleted.`);
  }

  private async handleAddRelation(fromId: string, toId?: string): Promise<void> {
    // Show quick pick for target entity if not provided
    const targetEntity = toId ?? await vscode.window.showInputBox({
      prompt: `Link "${fromId}" to which entity?`,
      placeHolder: 'Target entity name',
    });
    
    if (!targetEntity) return;
    
    const relationType = await vscode.window.showInputBox({
      prompt: 'Relation type',
      placeHolder: 'e.g., depends_on, uses, implements',
      value: 'related_to',
    });
    
    if (!relationType) return;

    const client = await ext.mcpClientManager.getClient();
    await client.graphLinkEntities({ from: fromId, to: targetEntity, relationType });
    
    // Refresh graph
    await this.loadInitialData();
    vscode.window.showInformationMessage(`Linked "${fromId}" → "${targetEntity}" (${relationType})`);
  }

  private async handleRebuild(): Promise<void> {
    const client = await ext.mcpClientManager.getClient();
    await client.callTool('graph_rebuild', {});
    // Reload graph after rebuild
    await this.loadInitialData();
    vscode.window.showInformationMessage('Graph rebuilt successfully');
  }

  private async handleUpsertEntity(name: string, entityType: string): Promise<void> {
    const client = await ext.mcpClientManager.getClient();
    await client.graphUpsertEntity({ name, entityType });
    await this.loadInitialData();
    vscode.window.showInformationMessage(`Entity "${name}" created/updated.`);
  }

  private async handleAddObservation(entity: string, text: string): Promise<void> {
    const client = await ext.mcpClientManager.getClient();
    await client.graphAddObservation({ entity, text });
    vscode.window.showInformationMessage(`Observation added to "${entity}".`);
  }

  private async handleLinkEntitiesFromWebview(from: string, to: string, relationType: string): Promise<void> {
    const client = await ext.mcpClientManager.getClient();
    await client.graphLinkEntities({ from, to, relationType });
    await this.loadInitialData();
    vscode.window.showInformationMessage(`Linked "${from}" → "${to}" (${relationType})`);
  }

  private async handleDuplicateEntity(entityId: string, newName: string): Promise<void> {
    const client = await ext.mcpClientManager.getClient();
    
    // Get the original entity data
    const searchResult = await client.graphSearch({ query: entityId, limit: 1 });
    const originalEntity = searchResult.entities?.find(e => e.name === entityId);
    
    if (!originalEntity) {
      throw new Error(`Entity "${entityId}" not found`);
    }

    // Create new entity with same type
    await client.graphUpsertEntity({
      name: newName,
      entityType: originalEntity.entityType,
    });

    // Copy observations if any
    if (originalEntity.observations && originalEntity.observations.length > 0) {
      for (const obs of originalEntity.observations) {
        await client.graphAddObservation({
          entity: newName,
          text: obs.text,
        });
      }
    }

    await this.loadInitialData();
    vscode.window.showInformationMessage(`Entity "${newName}" created as copy of "${entityId}".`);
  }

  // ── Data transformation ──────────────────────────────────────────

  private transformToGraphData(result: unknown): GraphDataPayload {
    const data = result as {
      entities?: Array<{
        name: string;
        entityType: string;
        observationCount?: number;
        relationCount?: number;
        [key: string]: unknown;
      }>;
      relations?: Array<{
        from: string;
        to: string;
        relationType: string;
      }>;
    };

    const entities = data.entities ?? [];
    const relations = data.relations ?? [];

    // Convert entities to React Flow nodes
    const nodes: EntityNode[] = entities.map((entity, index) => ({
      id: entity.name,
      type: 'entity' as const,
      position: { x: 0, y: 0 }, // Layout will be computed by dagre
      data: {
        label: entity.name,
        entityType: entity.entityType,
        color: this.getEntityColor(entity.entityType),
        observationCount: entity.observationCount,
        relationCount: entity.relationCount,
        attrs: Object.fromEntries(
          Object.entries(entity).filter(
            ([k]) => !['name', 'entityType', 'observationCount', 'relationCount'].includes(k)
          )
        ),
      },
    }));

    // Convert relations to React Flow edges
    const edges: RelationEdge[] = relations.map((rel, index) => ({
      id: `${rel.from}-${rel.to}-${index}`,
      source: rel.from,
      target: rel.to,
      type: 'default',
      data: {
        relationType: rel.relationType,
        label: rel.relationType,
      },
    }));

    return {
      type: 'graphData',
      nodes,
      edges,
    };
  }

  private getEntityColor(entityType: string): string {
    const colors: Record<string, string> = {
      person: '#3b82f6',     // blue
      project: '#10b981',    // green
      feature: '#f59e0b',    // amber
      bug: '#ef4444',        // red
      task: '#8b5cf6',       // purple
      document: '#06b6d4',   // cyan
      code: '#ec4899',       // pink
      api: '#14b8a6',        // teal
      database: '#f97316',   // orange
      service: '#84cc16',    // lime
    };
    return colors[entityType.toLowerCase()] ?? '#6b7280'; // default gray
  }

  private postMessage(msg: GraphDataPayload | Record<string, unknown>): void {
    this.panel?.webview.postMessage(msg);
  }

  // ── HTML generation ──────────────────────────────────────────────

  private getHtml(webview: vscode.Webview, resourceRoot: vscode.Uri): string {
    const nonce = getNonce();
    
    // React Flow bundle script and styles
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(resourceRoot, 'webview', 'graph.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(resourceRoot, 'webview', 'graph.css'),
    );

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" 
    content="default-src 'none'; 
             style-src ${webview.cspSource} 'unsafe-inline'; 
             script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval'; 
             img-src ${webview.cspSource} data:; 
             font-src ${webview.cspSource};">
  <title>Knowledge Graph</title>
  <link rel="stylesheet" href="${styleUri}">
  <style>
    body, html {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    #root {
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
