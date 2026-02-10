/**
 * Abstract Base MCP Client
 * 
 * Provides common functionality for both stdio and HTTP MCP clients.
 * 
 * Matched to memory-bank-mcp server v0.5.0:
 * - get_memory_bank_status returns flat JSON (not wrapped in {status:...})
 * - list_memory_bank_files returns plain text "Files in Memory Bank:\nfile1\nfile2\n..."
 * - get_current_mode returns plain text or error string
 * - initialize_memory_bank requires {path} argument
 * - No graph tools exist
 * - Some tools need random_string dummy param
 */

import {
  ConnectionConfig,
  ConnectionStatus,
  IMcpClient,
  LogDecisionParams,
  McpResource,
  McpResourceContent,
  McpTool,
  MemoryBankStatus,
  SwitchModeParams,
  TrackProgressParams,
  UpdateActiveContextParams,
} from './types';

export abstract class BaseMcpClient implements IMcpClient {
  protected status: ConnectionStatus = {
    connected: false,
    mode: null,
  };
  
  protected statusListeners: Array<(status: ConnectionStatus) => void> = [];

  // ============================================================================
  // Abstract methods - must be implemented by subclasses
  // ============================================================================

  abstract connect(config: ConnectionConfig): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract listTools(): Promise<McpTool[]>;
  abstract listResources(): Promise<McpResource[]>;
  abstract readResource(uri: string): Promise<McpResourceContent>;
  abstract callTool<T = unknown>(name: string, args: object): Promise<T>;

  // ============================================================================
  // Connection management
  // ============================================================================

  getStatus(): ConnectionStatus {
    return { ...this.status };
  }

  onStatusChange(callback: (status: ConnectionStatus) => void): void {
    this.statusListeners.push(callback);
  }

  protected updateStatus(updates: Partial<ConnectionStatus>): void {
    this.status = { ...this.status, ...updates };
    this.statusListeners.forEach(cb => cb(this.getStatus()));
  }

  // ============================================================================
  // Memory Bank Status
  // ============================================================================

  /**
   * get_memory_bank_status returns flat JSON directly:
   * { path, files[], coreFilesPresent[], missingCoreFiles[], isComplete, language, lastUpdated }
   */
  async getMemoryBankStatus(): Promise<MemoryBankStatus> {
    const result = await this.callTool<MemoryBankStatus>('get_memory_bank_status', {
      random_string: 'status',
    });
    return result;
  }

  /**
   * initialize_memory_bank requires {path} pointing to the PROJECT ROOT.
   * Server auto-detects the memory-bank subfolder.
   * Returns a confirmation string like "Memory Bank initialized at /path/..."
   */
  async initializeMemoryBank(path: string): Promise<string> {
    const result = await this.callTool<string>('initialize_memory_bank', { path });
    return typeof result === 'string' ? result : String(result);
  }

  // ============================================================================
  // Mode Management
  // ============================================================================

  /**
   * get_current_mode returns plain text (not {mode: "..."}).
   * May return error "Mode manager not initialized." with isError=true.
   */
  async getCurrentMode(): Promise<string> {
    try {
      const result = await this.callTool<string>('get_current_mode', {
        random_string: 'mode',
      });
      return typeof result === 'string' ? result : String(result);
    } catch {
      return 'unknown';
    }
  }

  async switchMode(params: SwitchModeParams): Promise<void> {
    await this.callTool('switch_mode', { mode: params.mode });
  }

  // ============================================================================
  // Context Management
  // ============================================================================

  async trackProgress(params: TrackProgressParams): Promise<void> {
    await this.callTool('track_progress', {
      type: params.type,
      summary: params.summary,
      details: params.details,
      tags: params.tags,
      files: params.files,
    });
  }

  async logDecision(params: LogDecisionParams): Promise<void> {
    await this.callTool('log_decision', {
      decision: params.decision,
      rationale: params.rationale,
      alternatives: params.alternatives,
    });
  }

  async updateActiveContext(params: UpdateActiveContextParams): Promise<void> {
    await this.callTool('update_active_context', {
      content: params.content,
    });
  }

  // ============================================================================
  // File Operations
  // ============================================================================

  /**
   * read_memory_bank_file returns the file content as a string.
   * The server wraps it in content[0].text which StdioMcpClient extracts.
   */
  async readMemoryBankFile(filename: string): Promise<string> {
    const result = await this.callTool<string>('read_memory_bank_file', { filename });
    return typeof result === 'string' ? result : String(result);
  }

  async writeMemoryBankFile(filename: string, content: string): Promise<void> {
    await this.callTool('write_memory_bank_file', { filename, content });
  }

  /**
   * list_memory_bank_files returns plain text:
   * "Files in Memory Bank:\nactive-context.md\ndecision-log.md\n..."
   * We parse it into an array of filenames.
   */
  async listMemoryBankFiles(): Promise<string[]> {
    const result = await this.callTool<string>('list_memory_bank_files', {
      random_string: 'list',
    });
    
    const text = typeof result === 'string' ? result : String(result);
    
    // Parse "Files in Memory Bank:\nfile1\nfile2\n..." into array
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    // Skip the header line "Files in Memory Bank:"
    const headerIndex = lines.findIndex(l => l.toLowerCase().includes('files in memory bank'));
    if (headerIndex >= 0) {
      return lines.slice(headerIndex + 1);
    }
    // If no header found, return all non-empty lines
    return lines;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  protected parseToolResult<T>(result: unknown): T {
    if (typeof result === 'string') {
      try {
        return JSON.parse(result) as T;
      } catch {
        return result as T;
      }
    }
    return result as T;
  }
}
