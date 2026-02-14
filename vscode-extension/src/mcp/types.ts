/**
 * MCP Client Types for Memory Bank
 * 
 * Server: @diazstg/memory-bank-mcp v0.5.0
 * Available tools: initialize_memory_bank, set_memory_bank_path, debug_mcp_config,
 *   read_memory_bank_file, write_memory_bank_file, list_memory_bank_files,
 *   get_memory_bank_status, migrate_file_naming, track_progress,
 *   update_active_context, log_decision, switch_mode, get_current_mode,
 *   process_umb_command, complete_umb
 * 
 * Graph tools (v0.5.0+): graph_upsert_entity, graph_add_observation,
 *   graph_link_entities, graph_unlink_entities, graph_search,
 *   graph_open_nodes, graph_rebuild
 */

// Core MCP Types

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpToolResult {
  content: McpContent[];
  isError?: boolean;
}

export interface McpContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

// Connection Types

export type ConnectionMode = 'stdio' | 'http';

export interface StdioConnectionConfig {
  mode: 'stdio';
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface HttpConnectionConfig {
  mode: 'http';
  baseUrl: string;
  authToken?: string;
  timeout?: number;
}

export type ConnectionConfig = StdioConnectionConfig | HttpConnectionConfig;

export interface ConnectionStatus {
  connected: boolean;
  mode: ConnectionMode | null;
  serverVersion?: string;
  lastConnected?: Date;
  error?: string;
}

// Memory Bank Domain Types

export interface MemoryBankStatus {
  isComplete: boolean;
  path: string;
  files: string[];
  coreFilesPresent: string[];
  missingCoreFiles: string[];
  language: string;
  lastUpdated: string;
}

// Tool Parameter Types

export interface SwitchModeParams {
  mode: string;
}

export interface TrackProgressParams {
  action: string;
  description: string;
}

export interface LogDecisionParams {
  title: string;
  context: string;
  decision: string;
  alternatives?: string[];
  consequences?: string[];
}

export interface UpdateActiveContextParams {
  tasks?: string[];
  issues?: string[];
  nextSteps?: string[];
}

// Graph tool types
export interface GraphSearchParams {
  query: string;
  limit?: number;
}

export interface GraphSearchResult {
  entities: Array<{
    id: string;
    name: string;
    entityType: string;
    attrs?: Record<string, unknown>;
    observations?: Array<{ text: string; timestamp: string }>;
  }>;
  relations: Array<{
    from: string;
    to: string;
    relationType: string;
  }>;
}

export interface GraphUpsertEntityParams {
  name: string;
  entityType: string;
  attrs?: Record<string, unknown>;
}

export interface GraphAddObservationParams {
  entity: string;
  text: string;
  source?: string;
}

export interface GraphLinkEntitiesParams {
  from: string;
  to: string;
  relationType: string;
}

export interface GraphDeleteEntityParams {
  entity: string;
}

export interface GraphDeleteObservationParams {
  observationId: string;
}

export interface ContextDigestResult {
  digest: {
    projectState?: string;
    currentContext: { tasks: string[]; issues: string[]; nextSteps: string[] };
    recentProgress: string[];
    recentDecisions: Array<{ title: string; date?: string; summary: string }>;
    systemPatterns?: string;
    graphSummary?: string;
  };
  metadata: {
    timestamp: string;
    memoryBankDir: string;
  };
}

// Store types
export interface StoreInfo {
  id: string;
  path: string;
  kind: 'local' | 'remote';
  isActive: boolean;
  hasGraph: boolean;
  fileCount: number;
  lastUsedAt: string;
}

export interface ListStoresResult {
  stores: StoreInfo[];
  selectedStoreId: string | null;
}

// MCP Client Interface

export interface IMcpClient {
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): ConnectionStatus;
  onStatusChange(callback: (status: ConnectionStatus) => void): void;

  listTools(): Promise<McpTool[]>;
  listResources(): Promise<McpResource[]>;
  readResource(uri: string): Promise<McpResourceContent>;
  callTool<T = unknown>(name: string, args: object): Promise<T>;

  // Memory Bank operations
  getMemoryBankStatus(): Promise<MemoryBankStatus>;
  initializeMemoryBank(path: string): Promise<string>;
  getCurrentMode(): Promise<string>;
  switchMode(params: SwitchModeParams): Promise<void>;
  trackProgress(params: TrackProgressParams): Promise<void>;
  logDecision(params: LogDecisionParams): Promise<void>;
  updateActiveContext(params: UpdateActiveContextParams): Promise<void>;
  readMemoryBankFile(filename: string): Promise<string>;
  writeMemoryBankFile(filename: string, content: string): Promise<void>;
  listMemoryBankFiles(): Promise<string[]>;

  // Knowledge Graph operations
  graphSearch(params: GraphSearchParams): Promise<GraphSearchResult>;
  graphOpenNodes(names: string[]): Promise<GraphSearchResult>;
  graphUpsertEntity(params: GraphUpsertEntityParams): Promise<unknown>;
  graphAddObservation(params: GraphAddObservationParams): Promise<unknown>;
  graphLinkEntities(params: GraphLinkEntitiesParams): Promise<unknown>;
  graphDeleteEntity(params: GraphDeleteEntityParams): Promise<unknown>;
  graphDeleteObservation(params: GraphDeleteObservationParams): Promise<unknown>;
  graphCompact(): Promise<unknown>;

  // Digest
  getContextDigest(): Promise<ContextDigestResult>;

  // Store operations
  listStores(): Promise<ListStoresResult>;
  selectStore(path: string): Promise<unknown>;
}
