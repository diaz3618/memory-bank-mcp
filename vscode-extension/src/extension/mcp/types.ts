/**
 * MCP Client Types for Memory Bank
 * 
 * These types define the interface for communicating with the memory-bank-mcp server
 * via the Model Context Protocol (MCP).
 * 
 * Server: @diaz3618/memory-bank-mcp v0.5.0
 * Available tools: initialize_memory_bank, set_memory_bank_path, debug_mcp_config,
 *   read_memory_bank_file, write_memory_bank_file, list_memory_bank_files,
 *   get_memory_bank_status, migrate_file_naming, track_progress,
 *   update_active_context, log_decision, switch_mode, get_current_mode,
 *   process_umb_command, complete_umb
 * 
 * NOTE: No graph tools exist in server v0.5.0. Graph features are stubbed.
 */

// ============================================================================
// Core MCP Types
// ============================================================================

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

// ============================================================================
// Connection Types
// ============================================================================

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

// ============================================================================
// Memory Bank Domain Types
// ============================================================================

/**
 * Actual response from get_memory_bank_status tool.
 * Server returns flat JSON: { path, files[], coreFilesPresent[], missingCoreFiles[], isComplete, language, lastUpdated }
 */
export interface MemoryBankStatus {
  isComplete: boolean;
  path: string;
  files: string[];
  coreFilesPresent: string[];
  missingCoreFiles: string[];
  language: string;
  lastUpdated: string;
}

export interface StoreInfo {
  id: string;
  name: string;
  path: string;
  description?: string;
  current: boolean;
}

// ============================================================================
// Tool Parameter Types
// ============================================================================

export interface SwitchModeParams {
  mode: string;
}

export interface SelectStoreParams {
  storeId: string;
}

export interface TrackProgressParams {
  type: string;
  summary: string;
  details?: string;
  tags?: string[];
  files?: string[];
}

export interface LogDecisionParams {
  decision: string;
  rationale?: string;
  alternatives?: string[];
}

export interface UpdateActiveContextParams {
  content: string;
}

// ============================================================================
// MCP Client Interface
// ============================================================================

export interface IMcpClient {
  // Connection management
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): ConnectionStatus;
  onStatusChange(callback: (status: ConnectionStatus) => void): void;

  // Tool discovery
  listTools(): Promise<McpTool[]>;
  
  // Resource discovery
  listResources(): Promise<McpResource[]>;
  readResource(uri: string): Promise<McpResourceContent>;

  // Generic tool call
  callTool<T = unknown>(name: string, args: object): Promise<T>;

  // Memory Bank specific operations
  getMemoryBankStatus(): Promise<MemoryBankStatus>;
  initializeMemoryBank(path: string): Promise<string>;
  
  // Mode management
  getCurrentMode(): Promise<string>;
  switchMode(params: SwitchModeParams): Promise<void>;

  // Context management
  trackProgress(params: TrackProgressParams): Promise<void>;
  logDecision(params: LogDecisionParams): Promise<void>;
  updateActiveContext(params: UpdateActiveContextParams): Promise<void>;

  // File operations
  readMemoryBankFile(filename: string): Promise<string>;
  writeMemoryBankFile(filename: string, content: string): Promise<void>;
  listMemoryBankFiles(): Promise<string[]>;
}

// ============================================================================
// Event Types
// ============================================================================

export type McpEventType = 
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'tool-called'
  | 'mode-changed';

export interface McpEvent {
  type: McpEventType;
  timestamp: Date;
  data?: unknown;
}
