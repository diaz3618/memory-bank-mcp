/**
 * Memory Bank Service
 * 
 * Provides high-level operations for interacting with the Memory Bank
 * through the MCP client. This service caches data and provides
 * typed methods for common operations.
 * 
 * Matched to memory-bank-mcp server v0.5.0:
 * - Must call initializeMemoryBank(projectRoot) FIRST before any other tool
 * - No graph tools available (readGraph, searchNodes, etc. don't exist)
 * - get_memory_bank_status returns {isComplete, path, files[], ...}
 * - list_memory_bank_files returns plain text parsed to string[]
 */

import * as vscode from 'vscode';
import { mcpClientManager, MemoryBankStatus } from '../mcp';

export class MemoryBankService implements vscode.Disposable {
  private outputChannel: vscode.OutputChannel;
  private cachedStatus: MemoryBankStatus | null = null;
  private cachedFiles: string[] = [];
  private refreshEmitter = new vscode.EventEmitter<void>();
  private workspacePath: string | undefined;
  
  public readonly onRefreshed = this.refreshEmitter.event;
  // Keep backward compat alias
  public readonly onGraphChanged = this.refreshEmitter.event;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
    
    // Determine workspace path
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      this.workspacePath = workspaceFolders[0].uri.fsPath;
    }
  }

  dispose(): void {
    this.refreshEmitter.dispose();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the memory bank.
   * MUST call initializeMemoryBank(path) FIRST - the server needs to know
   * the project root before any other tool will work.
   * Pass the PROJECT ROOT (not memory-bank subfolder) - server auto-detects.
   */
  async initialize(): Promise<void> {
    try {
      const client = await mcpClientManager.getClient();
      
      // Determine the path to initialize with
      const config = vscode.workspace.getConfiguration('memoryBank');
      const configuredPath = config.get<string>('path');
      let initPath = configuredPath || this.workspacePath;
      
      if (!initPath) {
        throw new Error('No workspace path available. Open a folder first or set memoryBank.path.');
      }
      
      // FIX: Strip trailing "memory-bank" from path if present.
      // The server's initialize_memory_bank tool auto-detects/creates the memory-bank
      // subfolder. If the user pointed to the memory-bank subfolder directly, passing
      // it to the server creates a nested memory-bank/memory-bank directory.
      if (initPath.endsWith('/memory-bank') || initPath.endsWith('\\memory-bank')) {
        initPath = initPath.replace(/[/\\]memory-bank$/, '');
        this.outputChannel.appendLine(`Stripped trailing memory-bank from path. Using project root: ${initPath}`);
      }
      
      this.outputChannel.appendLine(`Initializing memory bank with path: ${initPath}`);
      
      // Step 1: Initialize the memory bank (MUST be first)
      const initResult = await client.initializeMemoryBank(initPath);
      this.outputChannel.appendLine(`Init result: ${initResult}`);
      
      // Step 2: Now get status
      this.cachedStatus = await client.getMemoryBankStatus();
      this.outputChannel.appendLine(`Memory bank status: isComplete=${this.cachedStatus.isComplete}, path=${this.cachedStatus.path}, files=${this.cachedStatus.files.length}`);
      
      // Step 3: Get file list
      try {
        this.cachedFiles = await client.listMemoryBankFiles();
        this.outputChannel.appendLine(`Files loaded: ${this.cachedFiles.join(', ')}`);
      } catch (e) {
        this.outputChannel.appendLine(`Failed to list files (non-fatal): ${e}`);
        // Fall back to status.files
        this.cachedFiles = this.cachedStatus.files || [];
      }
      
      this.refreshEmitter.fire();
    } catch (error) {
      this.outputChannel.appendLine(`Failed to initialize memory bank: ${error}`);
      throw error;
    }
  }

  // ============================================================================
  // Status
  // ============================================================================

  async getStatus(): Promise<MemoryBankStatus> {
    if (!this.cachedStatus) {
      const client = await mcpClientManager.getClient();
      this.cachedStatus = await client.getMemoryBankStatus();
    }
    return this.cachedStatus;
  }

  /**
   * Returns the memory bank path from cached status.
   * This is the actual path on disk where files live.
   */
  async getMemoryBankPath(): Promise<string | null> {
    try {
      const status = await this.getStatus();
      return status.path || null;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Refresh
  // ============================================================================

  async refresh(): Promise<void> {
    try {
      const client = await mcpClientManager.getClient();
      this.cachedStatus = await client.getMemoryBankStatus();
      
      try {
        this.cachedFiles = await client.listMemoryBankFiles();
      } catch {
        this.cachedFiles = this.cachedStatus.files || [];
      }
      
      this.refreshEmitter.fire();
      this.outputChannel.appendLine(`Refreshed: ${this.cachedFiles.length} files, isComplete=${this.cachedStatus.isComplete}`);
    } catch (error) {
      this.outputChannel.appendLine(`Failed to refresh: ${error}`);
      throw error;
    }
  }

  // ============================================================================
  // File Operations
  // ============================================================================

  async getMemoryBankFiles(): Promise<string[]> {
    if (this.cachedFiles.length > 0) {
      return this.cachedFiles;
    }
    
    try {
      const client = await mcpClientManager.getClient();
      this.cachedFiles = await client.listMemoryBankFiles();
      return this.cachedFiles;
    } catch {
      // Fallback to status.files
      const status = await this.getStatus();
      return status.files || [];
    }
  }

  async readFile(filename: string): Promise<string> {
    const client = await mcpClientManager.getClient();
    return await client.readMemoryBankFile(filename);
  }

  async writeFile(filename: string, content: string): Promise<void> {
    const client = await mcpClientManager.getClient();
    await client.writeMemoryBankFile(filename, content);
  }

  // ============================================================================
  // Mode Management
  // ============================================================================

  /**
   * Returns the clean mode name (e.g. "code", "architect", "ask").
   * Server returns multi-line text: "Current mode: code\nMemory Bank status: active\n..."
   * We parse the first line to extract just the mode name.
   */
  async getCurrentMode(): Promise<string> {
    const client = await mcpClientManager.getClient();
    const raw = await client.getCurrentMode();
    // Parse "Current mode: code" from the first line
    const match = raw.match(/^Current mode:\s*(\w+)/i);
    if (match) {
      return match[1].toLowerCase();
    }
    // Fallback: if it's already a clean mode name
    const trimmed = raw.trim().toLowerCase();
    if (['architect', 'ask', 'code', 'debug', 'test'].includes(trimmed)) {
      return trimmed;
    }
    return 'unknown';
  }

  async switchMode(mode: string): Promise<void> {
    const client = await mcpClientManager.getClient();
    await client.switchMode({ mode });
  }

  // ============================================================================
  // Context Management
  // ============================================================================

  async trackProgress(summary: string, details?: string): Promise<void> {
    const client = await mcpClientManager.getClient();
    await client.trackProgress({ type: 'other', summary, details });
  }

  async logDecision(decision: string, rationale?: string, alternatives?: string[]): Promise<void> {
    const client = await mcpClientManager.getClient();
    await client.logDecision({ decision, rationale, alternatives });
  }

  async updateActiveContext(content: string): Promise<void> {
    const client = await mcpClientManager.getClient();
    await client.updateActiveContext({ content });
  }
}
