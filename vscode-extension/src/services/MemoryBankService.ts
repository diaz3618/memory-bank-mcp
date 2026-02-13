/**
 * Memory Bank Service
 * 
 * High-level operations for Memory Bank via MCP client.
 * Caches status and files, emits refresh events.
 */

import * as vscode from 'vscode';
import { ext } from '../extensionVariables';
import { MemoryBankStatus, TrackProgressParams, LogDecisionParams } from '../mcp/types';

export class MemoryBankService implements vscode.Disposable {
  private cachedStatus: MemoryBankStatus | null = null;
  private cachedFiles: string[] = [];
  private _onDidRefresh = new vscode.EventEmitter<void>();
  public readonly onDidRefresh = this._onDidRefresh.event;

  dispose(): void {
    this._onDidRefresh.dispose();
  }

  // ---------- Initialization ----------

  /**
   * Initialize the memory bank at the given path.
   * MUST be called before any other tool will work.
   * Pass the PROJECT ROOT — server auto-detects memory-bank subfolder.
   */
  async initialize(projectRoot: string): Promise<string> {
    // Strip trailing memory-bank from path if present
    let initPath = projectRoot;
    if (initPath.endsWith('/memory-bank') || initPath.endsWith('\\memory-bank')) {
      initPath = initPath.replace(/[/\\]memory-bank$/, '');
      ext.outputChannel.appendLine(`Stripped trailing memory-bank. Using: ${initPath}`);
    }

    ext.outputChannel.appendLine(`Initializing memory bank at: ${initPath}`);
    const client = await ext.mcpClientManager.getClient();
    const result = await client.initializeMemoryBank(initPath);
    ext.outputChannel.appendLine(`Init result: ${result}`);

    // After init, refresh caches
    await this.refresh();
    return result;
  }

  // ---------- Status ----------

  async getStatus(): Promise<MemoryBankStatus> {
    if (!this.cachedStatus) {
      const client = await ext.mcpClientManager.getClient();
      this.cachedStatus = await client.getMemoryBankStatus();
    }
    return this.cachedStatus;
  }

  async getMemoryBankPath(): Promise<string | null> {
    try {
      const status = await this.getStatus();
      return status.path || null;
    } catch {
      return null;
    }
  }

  isInitialized(): boolean {
    return this.cachedStatus !== null && this.cachedStatus.isComplete;
  }

  // ---------- Files ----------

  async getFiles(): Promise<string[]> {
    if (this.cachedFiles.length > 0) {
      return this.cachedFiles;
    }
    try {
      const client = await ext.mcpClientManager.getClient();
      this.cachedFiles = await client.listMemoryBankFiles();
      return this.cachedFiles;
    } catch {
      const status = await this.getStatus();
      return status.files?.filter(f => f.includes('.')) || [];
    }
  }

  async readFile(filename: string): Promise<string> {
    const client = await ext.mcpClientManager.getClient();
    return await client.readMemoryBankFile(filename);
  }

  // ---------- Mode ----------

  async getCurrentMode(): Promise<string> {
    const client = await ext.mcpClientManager.getClient();
    return await client.getCurrentMode();
  }

  async switchMode(mode: string): Promise<void> {
    const client = await ext.mcpClientManager.getClient();
    await client.switchMode({ mode });
    this._onDidRefresh.fire();
  }

  // ---------- Actions ----------

  async trackProgress(action: string, description: string): Promise<void> {
    const client = await ext.mcpClientManager.getClient();
    await client.trackProgress({ action, description });
    this._onDidRefresh.fire();
  }

  async logDecision(title: string, context: string, decision: string): Promise<void> {
    const client = await ext.mcpClientManager.getClient();
    await client.logDecision({ title, context, decision });
    this._onDidRefresh.fire();
  }

  async updateActiveContext(params: { tasks?: string[]; issues?: string[]; nextSteps?: string[] }): Promise<void> {
    const client = await ext.mcpClientManager.getClient();
    await client.updateActiveContext(params);
    this._onDidRefresh.fire();
  }

  // ---------- Refresh ----------

  async refresh(): Promise<void> {
    try {
      const client = await ext.mcpClientManager.getClient();
      this.cachedStatus = await client.getMemoryBankStatus();

      try {
        this.cachedFiles = await client.listMemoryBankFiles();
      } catch {
        this.cachedFiles = this.cachedStatus.files?.filter(f => f.includes('.')) || [];
      }

      ext.outputChannel.appendLine(
        `Refreshed: ${this.cachedFiles.length} files, isComplete=${this.cachedStatus.isComplete}`
      );
      this._onDidRefresh.fire();
    } catch (error) {
      ext.outputChannel.appendLine(`Refresh failed: ${error}`);
      throw error;
    }
  }

  clearCache(): void {
    this.cachedStatus = null;
    this.cachedFiles = [];
  }
}
