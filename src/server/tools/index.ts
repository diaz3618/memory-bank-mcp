import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** Low-level MCP Server type (avoids deprecated Server import) */
type LowLevelServer = McpServer['server'];

import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { MemoryBankManager } from '../../core/MemoryBankManager.js';
import { ProgressTracker } from '../../core/ProgressTracker.js';

// Import tools and handlers
import { coreTools, handleGetInstructions, handleSetMemoryBankPath, handleInitializeMemoryBank, handleReadMemoryBankFile, handleWriteMemoryBankFile, handleListMemoryBankFiles, handleGetMemoryBankStatus, handleMigrateFileNaming, handleDebugMcpConfig, handleGetContextBundle, handleGetContextDigest, handleSearchMemoryBank, handleCreateBackup, handleRestoreBackup, handleAddProgressEntry, handleAddSessionNote, handleUpdateTasks, handleBatchReadFiles, handleBatchWriteFiles } from './CoreTools.js';
import { progressTools, handleTrackProgress } from './ProgressTools.js';
import { contextTools, handleUpdateActiveContext } from './ContextTools.js';
import { decisionTools, handleLogDecision } from './DecisionTools.js';
import { modeTools, handleSwitchMode } from './ModeTools.js';
import { graphTools, handleGraphUpsertEntity, handleGraphAddObservation, handleGraphLinkEntities, handleGraphSearch, handleGraphOpenNodes, handleGraphDeleteEntity, handleGraphMaintain } from './GraphTools.js';
import { storeToolDefinitions, handleListStores, handleSelectStore } from './StoreTools.js';
import { thinkingTools, handleSequentialThinking, handleFinalizeThinkingSession } from './ThinkingTools.js';
import { kgContextTools, handleGetTargetedContext, handleGraphAddDocPointer } from './KGContextTools.js';

/**
 * Single source of truth for all MCP tool definitions.
 * Used by both the `initialize` handshake (capabilities) and the `tools/list` handler.
 */
export const allTools = [
  ...coreTools,
  ...progressTools,
  ...contextTools,
  ...decisionTools,
  ...modeTools,
  ...graphTools,
  ...storeToolDefinitions,
  ...thinkingTools,
  ...kgContextTools,
];

/**
 * Sets up all tool handlers for the MCP server
 * @param server MCP Server
 * @param memoryBankManager Memory Bank Manager
 * @param getProgressTracker Function to get the ProgressTracker
 */
export function setupToolHandlers(
  server: LowLevelServer,
  memoryBankManager: MemoryBankManager,
  getProgressTracker: () => ProgressTracker | null
) {
  // Register tools for listing (uses the single source of truth)
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools,
  }));

  // Register handler for tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      // Find Memory Bank directory if not found yet
      if (!memoryBankManager.getMemoryBankDir()) {
        const CWD = process.cwd();
        const memoryBankDir = await memoryBankManager.findMemoryBankDir(CWD);
        if (memoryBankDir) {
          memoryBankManager.setMemoryBankDir(memoryBankDir);
        }
      }

      // Check if arguments are valid
      if (
        request.params.name !== 'get_instructions' &&
        request.params.name !== 'get_memory_bank_status' &&
        request.params.name !== 'list_memory_bank_files' &&
        request.params.name !== 'get_context_bundle' &&
        request.params.name !== 'get_context_digest' &&
        request.params.name !== 'migrate_file_naming' &&
        request.params.name !== 'create_backup' &&
        request.params.name !== 'update_tasks' &&
        request.params.name !== 'list_stores' &&
        (!request.params.arguments || typeof request.params.arguments !== 'object')
      ) {
        throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments');
      }

      // Process tools
      switch (request.params.name) {
        // Instructions (no Memory Bank required)
        case 'get_instructions': {
          return handleGetInstructions();
        }

        // Main tools
        case 'set_memory_bank_path': {
          const { path: customPath } = request.params.arguments as { path?: string };
          return handleSetMemoryBankPath(memoryBankManager, customPath);
        }

        case 'initialize_memory_bank': {
          const { path: dirPath } = request.params.arguments as { path: string };
          if (!dirPath) {
            throw new McpError(ErrorCode.InvalidParams, 'Path not specified');
          }
          console.error('Initializing Memory Bank at path:', dirPath);
          return handleInitializeMemoryBank(memoryBankManager, dirPath);
        }

        case 'debug_mcp_config': {
          const { verbose } = request.params.arguments as { verbose?: boolean };
          return handleDebugMcpConfig(memoryBankManager, verbose || false);
        }

        case 'read_memory_bank_file': {
          if (!memoryBankManager.getMemoryBankDir()) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Memory Bank not found. Use initialize_memory_bank to create one.',
                },
              ],
              isError: true,
            };
          }

          const { filename } = request.params.arguments as { filename: string };
          if (!filename) {
            throw new McpError(ErrorCode.InvalidParams, 'Filename not specified');
          }
          return handleReadMemoryBankFile(memoryBankManager, filename);
        }

        case 'write_memory_bank_file': {
          if (!memoryBankManager.getMemoryBankDir()) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Memory Bank not found. Use initialize_memory_bank to create one.',
                },
              ],
              isError: true,
            };
          }

          const { filename, content, ifMatchEtag } = request.params.arguments as {
            filename: string;
            content: string;
            ifMatchEtag?: string;
          };
          if (!filename) {
            throw new McpError(ErrorCode.InvalidParams, 'Filename not specified');
          }
          if (content === undefined) {
            throw new McpError(ErrorCode.InvalidParams, 'Content not specified');
          }
          return handleWriteMemoryBankFile(memoryBankManager, filename, content, ifMatchEtag);
        }

        case 'list_memory_bank_files': {
          if (!memoryBankManager.getMemoryBankDir()) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Memory Bank not found. Use initialize_memory_bank to create one.',
                },
              ],
              isError: true,
            };
          }
          return handleListMemoryBankFiles(memoryBankManager);
        }

        case 'get_memory_bank_status': {
          if (!memoryBankManager.getMemoryBankDir()) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Memory Bank not found. Use initialize_memory_bank to create one.',
                },
              ],
              isError: true,
            };
          }
          return handleGetMemoryBankStatus(memoryBankManager);
        }

        case 'migrate_file_naming': {
          return handleMigrateFileNaming(memoryBankManager);
        }

        // Progress tools
        case 'track_progress': {
          const progressTracker = getProgressTracker();
          if (!progressTracker) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Memory Bank not found. Use initialize_memory_bank to create one.',
                },
              ],
              isError: true,
            };
          }

          const { action, description } = request.params.arguments as {
            action: string;
            description: string;
          };
          if (!action) {
            throw new McpError(ErrorCode.InvalidParams, 'Action not specified');
          }
          if (!description) {
            throw new McpError(ErrorCode.InvalidParams, 'Description not specified');
          }
          return handleTrackProgress(progressTracker, action, description);
        }

        // Context tools
        case 'update_active_context': {
          const progressTracker = getProgressTracker();
          if (!progressTracker) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Memory Bank not found. Use initialize_memory_bank to create one.',
                },
              ],
              isError: true,
            };
          }

          const { tasks, issues, nextSteps } = request.params.arguments as {
            tasks?: string[];
            issues?: string[];
            nextSteps?: string[];
          };
          return handleUpdateActiveContext(progressTracker, { tasks, issues, nextSteps });
        }

        // Decision tools
        case 'log_decision': {
          const progressTracker = getProgressTracker();
          if (!progressTracker) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Memory Bank not found. Use initialize_memory_bank to create one.',
                },
              ],
              isError: true,
            };
          }

          const { title, context, decision, alternatives, consequences } = request.params.arguments as {
            title: string;
            context: string;
            decision: string;
            alternatives?: string[] | string;
            consequences?: string[] | string;
          };
          if (!title || !context || !decision) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Title, context, and decision are required'
            );
          }
          return handleLogDecision(progressTracker, {
            title,
            context,
            decision,
            alternatives,
            consequences,
          });
        }

        // Mode tools
        case 'switch_mode': {
          const { mode, umb, umbCommand } = request.params.arguments as { 
            mode?: string; 
            umb?: boolean;
            umbCommand?: string;
          };
          return await handleSwitchMode(memoryBankManager, mode, umb, umbCommand);
        }

        // Context bundle and digest tools (P2 improvements)
        case 'get_context_bundle': {
          const args = request.params.arguments as { includeEtags?: boolean } | undefined;
          return handleGetContextBundle(memoryBankManager, args?.includeEtags ?? true);
        }

        case 'get_context_digest': {
          const args = request.params.arguments as {
            maxProgressEntries?: number;
            maxDecisions?: number;
            includeSystemPatterns?: boolean;
          } | undefined;
          return handleGetContextDigest(
            memoryBankManager,
            args?.maxProgressEntries ?? 10,
            args?.maxDecisions ?? 5,
            args?.includeSystemPatterns ?? false
          );
        }

        case 'search_memory_bank': {
          const { query, files, maxResults, caseSensitive } = request.params.arguments as {
            query: string;
            files?: string[];
            maxResults?: number;
            caseSensitive?: boolean;
          };
          if (!query) {
            throw new McpError(ErrorCode.InvalidParams, 'Search query not specified');
          }
          return handleSearchMemoryBank(
            memoryBankManager,
            query,
            files,
            maxResults ?? 20,
            caseSensitive ?? false
          );
        }

        // Backup and restore tools (P1 improvements)
        case 'create_backup': {
          const args = request.params.arguments as { backupDir?: string; listOnly?: boolean } | undefined;
          return handleCreateBackup(memoryBankManager, args?.backupDir, args?.listOnly);
        }

        case 'restore_backup': {
          const { backupId, createPreRestoreBackup } = request.params.arguments as {
            backupId: string;
            createPreRestoreBackup?: boolean;
          };
          if (!backupId) {
            throw new McpError(ErrorCode.InvalidParams, 'Backup ID not specified');
          }
          return handleRestoreBackup(
            memoryBankManager,
            backupId,
            createPreRestoreBackup ?? true
          );
        }

        // P2 Structured tools
        case 'add_progress_entry': {
          const { type, summary, details, files, tags } = request.params.arguments as {
            type: 'feature' | 'fix' | 'refactor' | 'docs' | 'test' | 'chore' | 'other';
            summary: string;
            details?: string;
            files?: string[];
            tags?: string[];
          };
          if (!type || !summary) {
            throw new McpError(ErrorCode.InvalidParams, 'Type and summary are required');
          }
          return handleAddProgressEntry(
            memoryBankManager,
            type,
            summary,
            details,
            files,
            tags
          );
        }

        case 'add_session_note': {
          const { note, category } = request.params.arguments as {
            note: string;
            category?: 'observation' | 'blocker' | 'question' | 'decision' | 'todo' | 'other';
          };
          if (!note) {
            throw new McpError(ErrorCode.InvalidParams, 'Note text is required');
          }
          return handleAddSessionNote(memoryBankManager, note, category);
        }

        case 'update_tasks': {
          const { add, remove, replace } = request.params.arguments as {
            add?: string[];
            remove?: string[];
            replace?: string[];
          };
          return handleUpdateTasks(memoryBankManager, add, remove, replace);
        }

        // P3 Batch operations
        case 'batch_read_files': {
          const { files, includeEtags } = request.params.arguments as {
            files: string[];
            includeEtags?: boolean;
          };
          if (!files || files.length === 0) {
            throw new McpError(ErrorCode.InvalidParams, 'Files array is required');
          }
          return handleBatchReadFiles(memoryBankManager, files, includeEtags ?? true);
        }

        case 'batch_write_files': {
          const { files, stopOnError } = request.params.arguments as {
            files: Array<{ filename: string; content: string; ifMatchEtag?: string }>;
            stopOnError?: boolean;
          };
          if (!files || files.length === 0) {
            throw new McpError(ErrorCode.InvalidParams, 'Files array is required');
          }
          return handleBatchWriteFiles(memoryBankManager, files, stopOnError ?? false);
        }

        // Graph tools
        case 'graph_upsert_entity': {
          const { name, entityType, attrs, storeId } = request.params.arguments as {
            name: string;
            entityType: string;
            attrs?: Record<string, unknown>;
            storeId?: string;
          };
          if (!name || !entityType) {
            throw new McpError(ErrorCode.InvalidParams, 'name and entityType are required');
          }
          return handleGraphUpsertEntity(memoryBankManager, name, entityType, attrs, storeId);
        }

        case 'graph_add_observation': {
          const { entity, text, source, timestamp, storeId } = request.params.arguments as {
            entity: string;
            text: string;
            source?: string;
            timestamp?: string;
            storeId?: string;
          };
          if (!entity || !text) {
            throw new McpError(ErrorCode.InvalidParams, 'entity and text are required');
          }
          return handleGraphAddObservation(memoryBankManager, entity, text, source, timestamp, storeId);
        }

        case 'graph_link_entities': {
          const { from, relationType, to, action, storeId } = request.params.arguments as {
            from: string;
            relationType: string;
            to: string;
            action?: 'link' | 'unlink';
            storeId?: string;
          };
          if (!from || !relationType || !to) {
            throw new McpError(ErrorCode.InvalidParams, 'from, relationType, and to are required');
          }
          return handleGraphLinkEntities(memoryBankManager, from, relationType, to, storeId, action);
        }

        case 'graph_search': {
          const { query, limit, includeNeighborhood, neighborhoodDepth, storeId } = request.params.arguments as {
            query: string;
            limit?: number;
            includeNeighborhood?: boolean;
            neighborhoodDepth?: 1 | 2;
            storeId?: string;
          };
          if (!query) {
            throw new McpError(ErrorCode.InvalidParams, 'query is required');
          }
          return handleGraphSearch(memoryBankManager, query, limit, includeNeighborhood, neighborhoodDepth, storeId);
        }

        case 'graph_open_nodes': {
          const { nodes, depth, storeId } = request.params.arguments as {
            nodes: string[];
            depth?: 1 | 2;
            storeId?: string;
          };
          if (!nodes || nodes.length === 0) {
            throw new McpError(ErrorCode.InvalidParams, 'nodes array is required');
          }
          return handleGraphOpenNodes(memoryBankManager, nodes, depth, storeId);
        }

        case 'graph_delete_entity': {
          const { entity, observationId, storeId } = request.params.arguments as {
            entity?: string;
            observationId?: string;
            storeId?: string;
          };
          if (!entity && !observationId) {
            throw new McpError(ErrorCode.InvalidParams, 'Either entity or observationId is required');
          }
          return handleGraphDeleteEntity(memoryBankManager, entity, observationId, storeId);
        }

        case 'graph_maintain': {
          const { operation, storeId } = request.params.arguments as {
            operation: 'rebuild' | 'compact' | 'stats';
            storeId?: string;
          };
          if (!operation) {
            throw new McpError(ErrorCode.InvalidParams, 'operation is required');
          }
          return handleGraphMaintain(memoryBankManager, operation, storeId);
        }

        // Thinking tools
        case 'sequential_thinking': {
          const thinkingInput = request.params.arguments as {
            thought?: string;
            nextThoughtNeeded?: boolean;
            thoughtNumber?: number;
            totalThoughts?: number;
            isRevision?: boolean;
            revisesThought?: number;
            branchFromThought?: number;
            branchId?: string;
            needsMoreThoughts?: boolean;
            sessionId?: string;
            reset?: boolean;
          };
          // If reset is true, don't require other fields
          if (!thinkingInput.reset && (!thinkingInput.thought || thinkingInput.thoughtNumber === undefined || thinkingInput.totalThoughts === undefined || thinkingInput.nextThoughtNeeded === undefined)) {
            throw new McpError(ErrorCode.InvalidParams, 'thought, thoughtNumber, totalThoughts, and nextThoughtNeeded are required (unless reset:true)');
          }
          return handleSequentialThinking(thinkingInput);
        }

        case 'finalize_thinking_session': {
          const finalizeInput = request.params.arguments as {
            summary: string;
            decision?: {
              title: string;
              context: string;
              decision: string;
              alternatives?: string[];
              consequences?: string[];
            };
            tasks?: { add?: string[]; remove?: string[]; replace?: string[] };
            nextSteps?: string[];
            progressEntry?: {
              type: 'feature' | 'fix' | 'refactor' | 'docs' | 'test' | 'chore' | 'other';
              summary: string;
              details?: string;
              files?: string[];
              tags?: string[];
            };
            sessionId?: string;
          };
          if (!finalizeInput.summary) {
            throw new McpError(ErrorCode.InvalidParams, 'summary is required');
          }
          return handleFinalizeThinkingSession(memoryBankManager, finalizeInput);
        }

        // KG Context tools
        case 'get_targeted_context': {
          const tcInput = request.params.arguments as {
            query: string;
            maxChars?: number;
            maxFiles?: number;
            graphLimit?: number;
            graphDepth?: 1 | 2;
            preferActiveContext?: boolean;
          };
          if (!tcInput.query) {
            throw new McpError(ErrorCode.InvalidParams, 'query is required');
          }
          return handleGetTargetedContext(memoryBankManager, tcInput);
        }

        case 'graph_add_doc_pointer': {
          const dpInput = request.params.arguments as {
            entityNameOrId: string;
            docPath: string;
            heading?: string;
            note?: string;
          };
          if (!dpInput.entityNameOrId || !dpInput.docPath) {
            throw new McpError(ErrorCode.InvalidParams, 'entityNameOrId and docPath are required');
          }
          return handleGraphAddDocPointer(memoryBankManager, dpInput);
        }

        // Store tools
        case 'list_stores': {
          return handleListStores(memoryBankManager);
        }

        case 'select_store': {
          const { path: storePath, storeId, action, kind } = request.params.arguments as {
            path?: string;
            storeId?: string;
            action?: 'select' | 'register' | 'unregister';
            kind?: 'local' | 'remote';
          };
          // Validation depends on action
          const normalizedAction = action || 'select';
          if (normalizedAction === 'select' && !storePath && !storeId) {
            throw new McpError(ErrorCode.InvalidParams, 'Either path or storeId is required for select action');
          }
          if (normalizedAction === 'register' && (!storePath || !storeId)) {
            throw new McpError(ErrorCode.InvalidParams, 'Both path and storeId are required for register action');
          }
          if (normalizedAction === 'unregister' && !storeId) {
            throw new McpError(ErrorCode.InvalidParams, 'storeId is required for unregister action');
          }
          return handleSelectStore(memoryBankManager, storePath, storeId, normalizedAction, kind);
        }

        // Unknown tool
        default:
          return {
            content: [
              {
                type: 'text',
                text: `Unknown tool: ${request.params.name}`,
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      console.error('Error handling tool call:', error);
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(ErrorCode.InternalError, 'Internal server error');
    }
  });
}