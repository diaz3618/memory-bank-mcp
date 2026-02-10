/**
 * Sidebar Provider
 * 
 * Provides the Memory Bank sidebar webview with:
 * - Connection status
 * - File tree (memory bank files)
 * - Quick actions (refresh, set path, open files)
 * - Mode selector
 * 
 * NOTE: No graph/entity features - server v0.5.0 has no graph tools.
 */

import * as vscode from 'vscode';
import { MemoryBankService } from '../services/MemoryBankService';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'memoryBank.sidebar';
  private _view?: vscode.WebviewView;
  private _refreshPending = false;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _memoryBankService: MemoryBankService,
    private readonly _context: vscode.ExtensionContext,
    private readonly _outputChannel: vscode.OutputChannel
  ) {
    // Listen for data changes
    this._memoryBankService.onGraphChanged(() => {
      this.refresh();
    });
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this._extensionUri,
        vscode.Uri.joinPath(this._extensionUri, 'dist'),
        vscode.Uri.joinPath(this._extensionUri, 'webview-dist'),
      ],
    };

    // CRITICAL: Register message handler BEFORE setting HTML to prevent race condition.
    // The webview script sends 'ready' immediately on load. If the handler isn't registered
    // yet, the message is lost and the sidebar stays at "Connecting..." forever.
    webviewView.webview.onDidReceiveMessage(async (message) => {
      try {
        switch (message.type) {
          case 'refresh':
            await this.refreshData();
            break;
          case 'getStatus':
            await this.sendStatus();
            break;
          case 'getFiles':
            await this.sendFiles();
            break;
          case 'openFile':
            await this.openFile(message.filename);
            break;
          case 'setPath':
            vscode.commands.executeCommand('memoryBank.setPath');
            break;
          case 'showLogs':
            vscode.commands.executeCommand('memoryBank.showLogs');
            break;
          case 'switchMode':
            await this.switchMode(message.mode);
            break;
          case 'trackProgress':
            await this.promptTrackProgress();
            break;
          case 'logDecision':
            await this.promptLogDecision();
            break;
          case 'updateContext':
            await this.promptUpdateContext();
            break;
          case 'ready':
            // Webview is ready, send initial data
            await this.refreshData();
            break;
        }
      } catch (error) {
        this._outputChannel.appendLine(`Sidebar error: ${error}`);
        this.postMessage({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Set HTML AFTER registering message handler
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
  }

  public refresh(): void {
    if (this._refreshPending) {
      return;
    }
    this._refreshPending = true;
    setTimeout(async () => {
      this._refreshPending = false;
      await this.refreshData();
    }, 100);
  }

  private async refreshData(): Promise<void> {
    try {
      await Promise.all([
        this.sendStatus(),
        this.sendFiles(),
      ]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this._outputChannel.appendLine(`refreshData failed: ${msg}`);
      this.postMessage({
        type: 'error',
        message: `Failed to load data: ${msg}. Try "Memory Bank: Show Logs" for details.`,
      });
    }
  }

  private async sendStatus(): Promise<void> {
    try {
      const status = await this._memoryBankService.getStatus();
      let mode = 'unknown';
      try {
        mode = await this._memoryBankService.getCurrentMode();
      } catch {
        // Mode not available
      }
      this.postMessage({
        type: 'status',
        data: {
          isComplete: status.isComplete,
          path: status.path,
          mode,
          fileCount: status.files?.length || 0,
          language: status.language,
        },
      });
    } catch (error) {
      this._outputChannel.appendLine(`Failed to get status: ${error}`);
      this.postMessage({
        type: 'status',
        data: {
          isComplete: false,
          path: null,
          mode: 'disconnected',
          fileCount: 0,
          error: error instanceof Error ? error.message : 'Connection failed',
        },
      });
    }
  }

  private async sendFiles(): Promise<void> {
    try {
      const files = await this._memoryBankService.getMemoryBankFiles();
      this.postMessage({
        type: 'files',
        data: files,
      });
    } catch (error) {
      this._outputChannel.appendLine(`Failed to get files: ${error}`);
      this.postMessage({
        type: 'files',
        data: [],
      });
    }
  }

  private async openFile(filename: string): Promise<void> {
    vscode.commands.executeCommand('memoryBank.openFile', filename);
  }

  private async switchMode(mode: string): Promise<void> {
    try {
      await this._memoryBankService.switchMode(mode);
      await this.sendStatus();
      vscode.window.showInformationMessage(`Switched to ${mode} mode`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to switch mode: ${error}`);
    }
  }

  private async promptTrackProgress(): Promise<void> {
    const summary = await vscode.window.showInputBox({
      prompt: 'Progress summary',
      placeHolder: 'e.g. Implemented authentication module',
    });
    if (!summary) { return; }
    const details = await vscode.window.showInputBox({
      prompt: 'Details (optional)',
      placeHolder: 'Additional details about the progress',
    });
    try {
      await this._memoryBankService.trackProgress(summary, details || undefined);
      vscode.window.showInformationMessage('Progress tracked');
      await this.refreshData();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to track progress: ${error}`);
    }
  }

  private async promptLogDecision(): Promise<void> {
    const decision = await vscode.window.showInputBox({
      prompt: 'Decision',
      placeHolder: 'e.g. Switched from REST to GraphQL',
    });
    if (!decision) { return; }
    const rationale = await vscode.window.showInputBox({
      prompt: 'Rationale (optional)',
      placeHolder: 'Why this decision was made',
    });
    try {
      await this._memoryBankService.logDecision(decision, rationale || undefined);
      vscode.window.showInformationMessage('Decision logged');
      await this.refreshData();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to log decision: ${error}`);
    }
  }

  private async promptUpdateContext(): Promise<void> {
    const content = await vscode.window.showInputBox({
      prompt: 'Active context update',
      placeHolder: 'e.g. Working on authentication feature',
    });
    if (!content) { return; }
    try {
      await this._memoryBankService.updateActiveContext(content);
      vscode.window.showInformationMessage('Active context updated');
      await this.refreshData();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to update context: ${error}`);
    }
  }

  private postMessage(message: { type: string; data?: unknown; message?: string }): void {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <title>Memory Bank</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
      padding: 0;
    }
    
    .container {
      padding: 8px;
    }
    
    .section {
      margin-bottom: 16px;
    }
    
    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      cursor: pointer;
      user-select: none;
    }
    
    .section-header:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    
    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--vscode-sideBarSectionHeader-foreground);
      flex: 1;
    }
    
    .section-content {
      padding-left: 8px;
    }
    
    .section-content.collapsed {
      display: none;
    }
    
    .status-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      background-color: var(--vscode-sideBarSectionHeader-background);
      border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
      margin-bottom: 8px;
    }
    
    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--vscode-testing-iconFailed);
      flex-shrink: 0;
    }
    
    .status-indicator.connected {
      background-color: var(--vscode-testing-iconPassed);
    }
    
    .status-text {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .file-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      cursor: pointer;
      border-radius: 3px;
    }
    
    .file-item:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    
    .file-icon {
      width: 16px;
      height: 16px;
      opacity: 0.8;
    }
    
    .file-name {
      flex: 1;
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .action-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 8px;
    }
    
    .action-btn {
      flex: 1;
      min-width: 80px;
      padding: 6px 12px;
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      text-align: center;
    }
    
    .action-btn:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }
    
    .action-btn.primary {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    
    .action-btn.primary:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 8px;
    }
    
    .stat-item {
      padding: 8px;
      background-color: var(--vscode-editor-background);
      border-radius: 4px;
      text-align: center;
    }
    
    .stat-value {
      font-size: 18px;
      font-weight: bold;
      color: var(--vscode-textLink-foreground);
    }
    
    .stat-label {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
    }
    
    .empty-state {
      text-align: center;
      padding: 16px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    
    .mode-selector {
      display: flex;
      gap: 4px;
      margin-top: 8px;
    }
    
    .mode-btn {
      flex: 1;
      padding: 4px 8px;
      background-color: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
    }
    
    .mode-btn.active {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }
    
    .chevron {
      transition: transform 0.2s;
    }
    
    .chevron.collapsed {
      transform: rotate(-90deg);
    }
    
    .info-row {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      padding: 2px 8px;
    }
    
    .info-row .label {
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="status-bar">
      <div class="status-indicator" id="statusIndicator"></div>
      <span class="status-text" id="statusText">Connecting...</span>
      <button class="action-btn" id="statusRefreshBtn" title="Refresh" style="min-width:auto;flex:0;">&#x27F3;</button>
    </div>
    
    <!-- Quick Actions -->
    <div class="section">
      <div class="section-header" id="actionsHeader">
        <span class="chevron" id="actionsChevron">&#x25BC;</span>
        <span class="section-title">Quick Actions</span>
      </div>
      <div class="section-content" id="actionsContent">
        <div class="action-buttons">
          <button class="action-btn primary" id="refreshBtn">&#x27F3; Refresh</button>
          <button class="action-btn" id="setPathBtn">&#x1F4C1; Set Path</button>
          <button class="action-btn" id="showLogsBtn">&#x1F4CB; Logs</button>
        </div>
      </div>
    </div>
    
    <!-- Memory Bank Actions -->
    <div class="section">
      <div class="section-header" id="mbActionsHeader">
        <span class="chevron" id="mbActionsChevron">&#x25BC;</span>
        <span class="section-title">Memory Bank</span>
      </div>
      <div class="section-content" id="mbActionsContent">
        <div class="action-buttons">
          <button class="action-btn" id="trackProgressBtn">&#x1F4C8; Track Progress</button>
          <button class="action-btn" id="logDecisionBtn">&#x1F4DD; Log Decision</button>
          <button class="action-btn" id="updateContextBtn">&#x1F504; Update Context</button>
        </div>
      </div>
    </div>
    
    <!-- Status Info -->
    <div class="section">
      <div class="section-header" id="infoHeader">
        <span class="chevron" id="infoChevron">&#x25BC;</span>
        <span class="section-title">Status</span>
      </div>
      <div class="section-content" id="infoContent">
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value" id="fileCount">0</div>
            <div class="stat-label">Files</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="statusComplete">--</div>
            <div class="stat-label">Status</div>
          </div>
        </div>
        <div class="info-row" id="pathInfo" style="margin-top:8px;word-break:break-all;"></div>
      </div>
    </div>
    
    <!-- Files -->
    <div class="section">
      <div class="section-header" id="filesHeader">
        <span class="chevron" id="filesChevron">&#x25BC;</span>
        <span class="section-title">Files</span>
      </div>
      <div class="section-content" id="filesContent">
        <div id="fileList" class="file-list">
          <div class="empty-state">Loading files...</div>
          <button class="mode-btn" data-mode="debug" id="modeDebug">Debug</button>
          <button class="mode-btn" data-mode="test" id="modeTest">Test</button>
        </div>
      </div>
    </div>
    
    <!-- Mode -->
    <div class="section">
      <div class="section-header" id="modeHeader">
        <span class="chevron" id="modeChevron">&#x25BC;</span>
        <span class="section-title">Mode</span>
      </div>
      <div class="section-content" id="modeContent">
        <div class="mode-selector" id="modeSelector">
          <button class="mode-btn" data-mode="architect" id="modeArchitect">Architect</button>
          <button class="mode-btn" data-mode="code" id="modeCode">Code</button>
          <button class="mode-btn" data-mode="ask" id="modeAsk">Ask</button>
        </div>
      </div>
    </div>
  </div>
  
  <script nonce="${nonce}">
    (function() {
      var vscode = acquireVsCodeApi();
      
      var currentStatus = { isComplete: false, mode: 'unknown' };
      
      // File icons
      var fileIcons = {
        'active-context.md': '\\u{1F4CD}',
        'progress.md': '\\u{1F4C8}',
        'decision-log.md': '\\u{1F4CB}',
        'product-context.md': '\\u{1F4E6}',
        'system-patterns.md': '\\u{1F527}',
        'default': '\\u{1F4C4}',
      };
      
      // ---- Helper: toggle section collapse ----
      function toggleSection(sectionId) {
        var content = document.getElementById(sectionId + 'Content');
        var chevron = document.getElementById(sectionId + 'Chevron');
        if (content) content.classList.toggle('collapsed');
        if (chevron) chevron.classList.toggle('collapsed');
      }
      
      // ---- Actions ----
      function refresh() {
        vscode.postMessage({ type: 'refresh' });
      }
      
      function setPath() {
        vscode.postMessage({ type: 'setPath' });
      }
      
      function showLogs() {
        vscode.postMessage({ type: 'showLogs' });
      }
      
      function openFile(filename) {
        vscode.postMessage({ type: 'openFile', filename: filename });
      }
      
      function switchMode(mode) {
        vscode.postMessage({ type: 'switchMode', mode: mode });
      }
      
      function trackProgress() {
        vscode.postMessage({ type: 'trackProgress' });
      }
      
      function logDecision() {
        vscode.postMessage({ type: 'logDecision' });
      }
      
      function updateContext() {
        vscode.postMessage({ type: 'updateContext' });
      }
      
      // ---- Register all event listeners (CSP-safe, no onclick attributes) ----
      document.getElementById('statusRefreshBtn').addEventListener('click', refresh);
      document.getElementById('refreshBtn').addEventListener('click', refresh);
      document.getElementById('setPathBtn').addEventListener('click', setPath);
      document.getElementById('showLogsBtn').addEventListener('click', showLogs);
      document.getElementById('trackProgressBtn').addEventListener('click', trackProgress);
      document.getElementById('logDecisionBtn').addEventListener('click', logDecision);
      document.getElementById('updateContextBtn').addEventListener('click', updateContext);
      
      // Section collapse toggles
      document.getElementById('actionsHeader').addEventListener('click', function() { toggleSection('actions'); });
      document.getElementById('mbActionsHeader').addEventListener('click', function() { toggleSection('mbActions'); });
      document.getElementById('infoHeader').addEventListener('click', function() { toggleSection('info'); });
      document.getElementById('filesHeader').addEventListener('click', function() { toggleSection('files'); });
      document.getElementById('modeHeader').addEventListener('click', function() { toggleSection('mode'); });
      
      // Mode buttons
      document.getElementById('modeArchitect').addEventListener('click', function() { switchMode('architect'); });
      document.getElementById('modeCode').addEventListener('click', function() { switchMode('code'); });
      document.getElementById('modeAsk').addEventListener('click', function() { switchMode('ask'); });
      document.getElementById('modeDebug').addEventListener('click', function() { switchMode('debug'); });
      document.getElementById('modeTest').addEventListener('click', function() { switchMode('test'); });
      
      // ---- Render functions ----
      function renderStatus(status) {
        currentStatus = status;
        var indicator = document.getElementById('statusIndicator');
        var text = document.getElementById('statusText');
        var fileCountEl = document.getElementById('fileCount');
        var statusCompleteEl = document.getElementById('statusComplete');
        var pathInfoEl = document.getElementById('pathInfo');
        
        if (status.error) {
          indicator.classList.remove('connected');
          text.textContent = 'Error: ' + status.error;
          text.title = status.error;
          statusCompleteEl.textContent = 'ERR';
        } else if (status.isComplete) {
          indicator.classList.add('connected');
          text.textContent = 'Connected';
          statusCompleteEl.textContent = '\\u2713';
        } else {
          indicator.classList.remove('connected');
          text.textContent = 'Incomplete - Set Path';
          statusCompleteEl.textContent = '\\u2717';
        }
        
        fileCountEl.textContent = status.fileCount || 0;
        
        if (status.path) {
          pathInfoEl.innerHTML = '<span class="label">Path:</span> ' + status.path;
        }
        
        // Update mode buttons
        document.querySelectorAll('.mode-btn').forEach(function(btn) {
          btn.classList.toggle('active', btn.dataset.mode === status.mode);
        });
      }
      
      function showError(message) {
        var container = document.getElementById('fileList');
        container.innerHTML = '<div class="empty-state" style="color: var(--vscode-errorForeground);">' + message + '</div>';
      }
      
      function renderFiles(files) {
        var container = document.getElementById('fileList');
        
        if (!files || files.length === 0) {
          container.innerHTML = '<div class="empty-state">No files found</div>';
          return;
        }
        
        // Build file items
        container.innerHTML = '';
        files.forEach(function(file) {
          var icon = fileIcons[file] || fileIcons['default'];
          var item = document.createElement('div');
          item.className = 'file-item';
          item.innerHTML = '<span class="file-icon">' + icon + '</span><span class="file-name">' + file + '</span>';
          // Use addEventListener instead of onclick (CSP-safe)
          item.addEventListener('click', function() { openFile(file); });
          container.appendChild(item);
        });
      }
      
      // ---- Handle messages from extension ----
      window.addEventListener('message', function(event) {
        var message = event.data;
        
        switch (message.type) {
          case 'status':
            renderStatus(message.data);
            break;
          case 'files':
            renderFiles(message.data);
            break;
          case 'error':
            console.error('Error:', message.message);
            showError(message.message);
            break;
        }
      });
      
      // ---- Signal ready to extension host ----
      vscode.postMessage({ type: 'ready' });
    })();
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
