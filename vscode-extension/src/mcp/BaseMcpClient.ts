/**
 * Abstract Base MCP Client
 *
 * Matched to memory-bank-mcp server v0.5.0+:
 * - get_memory_bank_status returns flat JSON
 * - list_memory_bank_files returns plain text
 * - get_current_mode returns multi-line text "Current mode: <mode>\n..."
 * - initialize_memory_bank requires {path}
 * - update_active_context accepts {tasks?, issues?, nextSteps?}
 * - Graph tools available: graph_search, graph_open_nodes, graph_upsert_entity,
 *   graph_add_observation, graph_link_entities
 */

import {
  ConnectionConfig,
  ConnectionStatus,
  GraphAddObservationParams,
  GraphLinkEntitiesParams,
  GraphSearchParams,
  GraphSearchResult,
  GraphUpsertEntityParams,
  IMcpClient,
  ListStoresResult,
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
  protected status: ConnectionStatus = { connected: false, mode: null };
  protected statusListeners: Array<(status: ConnectionStatus) => void> = [];

  abstract connect(config: ConnectionConfig): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract listTools(): Promise<McpTool[]>;
  abstract listResources(): Promise<McpResource[]>;
  abstract readResource(uri: string): Promise<McpResourceContent>;
  abstract callTool<T = unknown>(name: string, args: object): Promise<T>;

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

  async getMemoryBankStatus(): Promise<MemoryBankStatus> {
    return await this.callTool<MemoryBankStatus>('get_memory_bank_status', {});
  }

  async initializeMemoryBank(path: string): Promise<string> {
    const result = await this.callTool<string>('initialize_memory_bank', { path });
    return typeof result === 'string' ? result : String(result);
  }

  /**
   * Server returns: "Current mode: code\nMemory Bank status: active\nUMB mode active: No"
   * We parse to extract just the mode name.
   */
  async getCurrentMode(): Promise<string> {
    try {
      const result = await this.callTool<string>('get_current_mode', {});
      const text = typeof result === 'string' ? result : String(result);
      const match = text.match(/^Current mode:\s*(\w+)/i);
      if (match) {
        return match[1].toLowerCase();
      }
      const trimmed = text.trim().toLowerCase();
      if (['architect', 'ask', 'code', 'debug', 'test'].includes(trimmed)) {
        return trimmed;
      }
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  async switchMode(params: SwitchModeParams): Promise<void> {
    await this.callTool('switch_mode', { mode: params.mode });
  }

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
      tasks: params.tasks,
      issues: params.issues,
      nextSteps: params.nextSteps,
    });
  }

  async readMemoryBankFile(filename: string): Promise<string> {
    const result = await this.callTool<string>('read_memory_bank_file', { filename });
    return typeof result === 'string' ? result : String(result);
  }

  async writeMemoryBankFile(filename: string, content: string): Promise<void> {
    await this.callTool('write_memory_bank_file', { filename, content });
  }

  /**
   * Server returns: "Files in Memory Bank:\nfile1\nfile2\n..."
   * Parse into array, filtering out directories (entries with no extension).
   */
  async listMemoryBankFiles(): Promise<string[]> {
    const result = await this.callTool<string>('list_memory_bank_files', {});
    const text = typeof result === 'string' ? result : String(result);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const headerIndex = lines.findIndex(l => l.toLowerCase().includes('files in memory bank'));
    const fileLines = headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;
    // Filter out directories (no extension = likely a folder like "docs")
    return fileLines.filter(f => f.includes('.'));
  }

  // ---------- Knowledge Graph Operations ----------

  async graphSearch(params: GraphSearchParams): Promise<GraphSearchResult> {
    const result = await this.callTool<GraphSearchResult>('graph_search', {
      query: params.query,
      limit: params.limit,
    });
    return result ?? { entities: [], relations: [] };
  }

  async graphOpenNodes(names: string[]): Promise<GraphSearchResult> {
    const result = await this.callTool<GraphSearchResult>('graph_open_nodes', {
      nodes: names,
    });
    return result ?? { entities: [], relations: [] };
  }

  async graphUpsertEntity(params: GraphUpsertEntityParams): Promise<unknown> {
    return await this.callTool('graph_upsert_entity', {
      name: params.name,
      entityType: params.entityType,
      attrs: params.attrs,
    });
  }

  async graphAddObservation(params: GraphAddObservationParams): Promise<unknown> {
    return await this.callTool('graph_add_observation', {
      entity: params.entity,
      text: params.text,
      source: params.source,
    });
  }

  async graphLinkEntities(params: GraphLinkEntitiesParams): Promise<unknown> {
    return await this.callTool('graph_link_entities', {
      from: params.from,
      to: params.to,
      relationType: params.relationType,
    });
  }

  // ---------- Store Operations ----------

  async listStores(): Promise<ListStoresResult> {
    const result = await this.callTool<ListStoresResult>('list_stores', {});
    return result ?? { stores: [], selectedStoreId: null };
  }

  async selectStore(path: string): Promise<unknown> {
    return await this.callTool('select_store', { path });
  }
}
