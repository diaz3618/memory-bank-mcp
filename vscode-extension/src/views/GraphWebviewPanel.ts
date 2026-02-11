/**
 * Graph Webview Panel
 *
 * Manages a WebviewPanel (editor tab) that renders the knowledge graph
 * using Cytoscape.js. Communicates with the MCP server via the extension's
 * MCP client for search, expand, and mutation operations.
 *
 * Lifecycle: singleton panel — reopened if closed, revealed if already open.
 */

import * as vscode from 'vscode';
import { ext } from '../extensionVariables';

// ── Message types (extension ↔ webview) ──────────────────────────

/** Messages sent FROM the webview TO the extension. */
type WebviewMessage =
  | { type: 'ready' }
  | { type: 'search'; query: string }
  | { type: 'openNodes'; nodes: string[]; depth: 1 | 2 }
  | { type: 'addObservation'; entity: string; text: string }
  | { type: 'linkEntities'; from: string; to: string; relationType: string }
  | { type: 'deleteEntity'; entity: string }
  | { type: 'rebuild' };

/** Messages sent FROM the extension TO the webview. */
interface GraphPayload {
  entities: Array<{
    name: string;
    entityType: string;
    attrs?: Record<string, unknown>;
    observations?: Array<{ text: string; source?: string; timestamp?: string }>;
  }>;
  relations: Array<{
    from: string;
    to: string;
    relationType: string;
  }>;
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
    const resourceRoot = vscode.Uri.joinPath(this.extensionUri, 'resources', 'webview');

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
        case 'ready':
          await this.loadInitialData();
          break;
        case 'search':
          await this.handleSearch(msg.query);
          break;
        case 'openNodes':
          await this.handleOpenNodes(msg.nodes, msg.depth);
          break;
        case 'addObservation':
          await this.handleAddObservation(msg.entity, msg.text);
          break;
        case 'linkEntities':
          await this.handleLinkEntities(msg.from, msg.to, msg.relationType);
          break;
        case 'deleteEntity':
          await this.handleDeleteEntity(msg.entity);
          break;
        case 'rebuild':
          await this.handleRebuild();
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ext.outputChannel.appendLine(`Graph webview error: ${message}`);
      this.postMessage({ type: 'error', message });
    }
  }

  private async loadInitialData(): Promise<void> {
    this.postMessage({ type: 'loading', active: true });

    // Load all entities via empty-string search (returns everything)
    const client = await ext.mcpClientManager.getClient();

    const result = await client.graphSearch({ query: '', limit: 500 });
    this.postMessage({
      type: 'graphData',
      ...this.normalizeResult(result),
      focusNode: this.focusEntity,
    });
    this.postMessage({ type: 'loading', active: false });
  }

  private async handleSearch(query: string): Promise<void> {
    this.postMessage({ type: 'loading', active: true });
    const client = await ext.mcpClientManager.getClient();

    const result = await client.graphSearch({ query, limit: 200 });
    this.postMessage({
      type: 'searchResults',
      ...this.normalizeResult(result),
    });
    this.postMessage({ type: 'loading', active: false });
  }

  private async handleOpenNodes(nodes: string[], depth: 1 | 2): Promise<void> {
    this.postMessage({ type: 'loading', active: true });
    const client = await ext.mcpClientManager.getClient();

    const result = await client.graphOpenNodes(nodes);
    this.postMessage({
      type: 'graphData',
      ...this.normalizeResult(result),
    });
    this.postMessage({ type: 'loading', active: false });
  }

  private async handleAddObservation(entity: string, text: string): Promise<void> {
    const client = await ext.mcpClientManager.getClient();

    await client.graphAddObservation({ entity, text, source: 'graph-webview' });
    // Refresh that node
    await this.handleOpenNodes([entity], 1);
    vscode.window.showInformationMessage(`Observation added to "${entity}".`);
  }

  private async handleLinkEntities(from: string, to: string, relationType: string): Promise<void> {
    const client = await ext.mcpClientManager.getClient();

    await client.graphLinkEntities({ from, to, relationType });
    await this.handleOpenNodes([from, to], 1);
    vscode.window.showInformationMessage(`Linked "${from}" → "${to}" (${relationType}).`);
  }

  private async handleDeleteEntity(entity: string): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      `Delete entity "${entity}" and all its observations/relations?`,
      { modal: true },
      'Delete',
    );
    if (confirm !== 'Delete') return;

    const client = await ext.mcpClientManager.getClient();

    await client.graphDeleteEntity({ entity });
    this.postMessage({ type: 'removeNode', name: entity });
    vscode.window.showInformationMessage(`Entity "${entity}" deleted.`);
  }

  private async handleRebuild(): Promise<void> {
    this.postMessage({ type: 'loading', active: true });
    const client = await ext.mcpClientManager.getClient();

    await client.callTool('graph_rebuild', {});
    await this.loadInitialData();
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private normalizeResult(result: unknown): GraphPayload {
    const r = result as Partial<GraphPayload> | null;
    return {
      entities: r?.entities ?? [],
      relations: r?.relations ?? [],
    };
  }

  private postMessage(msg: Record<string, unknown>): void {
    this.panel?.webview.postMessage(msg);
  }

  // ── HTML generation ──────────────────────────────────────────────

  private getHtml(webview: vscode.Webview, resourceRoot: vscode.Uri): string {
    const nonce = getNonce();
    const cytoscapeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(resourceRoot, 'cytoscape.min.js'),
    );
    const fcoseUri = webview.asWebviewUri(
      vscode.Uri.joinPath(resourceRoot, 'cytoscape-fcose.js'),
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(resourceRoot, 'graph.css'),
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(resourceRoot, 'graph.js'),
    );

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';
             img-src ${webview.cspSource} data:;">
  <link rel="stylesheet" href="${cssUri}">
  <title>Knowledge Graph</title>
</head>
<body>
  <div id="toolbar">
    <input id="search-input" type="text" placeholder="Search entities…" />
    <button id="btn-search" title="Search">🔍</button>
    <button id="btn-fit" title="Fit to screen">⊞</button>
    <button id="btn-rebuild" title="Rebuild graph">↻</button>
    <div id="loading-indicator" class="hidden">Loading…</div>
  </div>
  <div id="main">
    <div id="cy-container"></div>
    <div id="inspector" class="hidden">
      <h3 id="insp-name"></h3>
      <p id="insp-type" class="muted"></p>
      <div id="insp-attrs"></div>
      <h4>Observations</h4>
      <ul id="insp-observations"></ul>
      <h4>Relations</h4>
      <ul id="insp-relations"></ul>
      <div id="insp-actions">
        <button id="btn-add-obs" title="Add observation">+ Observation</button>
        <button id="btn-link" title="Link to another entity">+ Link</button>
        <button id="btn-expand" title="Expand neighbors">Expand</button>
        <button id="btn-delete" class="danger" title="Delete entity">Delete</button>
      </div>
    </div>
  </div>
  <script nonce="${nonce}" src="${cytoscapeUri}"></script>
  <script nonce="${nonce}" src="${fcoseUri}"></script>
  <script nonce="${nonce}" src="${jsUri}"></script>
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
