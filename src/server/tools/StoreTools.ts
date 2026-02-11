/**
 * StoreTools - MCP tool handlers for multi-store management
 *
 * Implements Phase 2 from knowledge-graph-plans.md A5:
 * - list_stores: list available stores with their status
 * - select_store: switch the active store
 *
 * A "store" is a Memory Bank instance at a given path. The default store
 * is the current workspace's memory-bank folder. Additional stores can be
 * registered for multi-project or remote contexts.
 */

import { MemoryBankManager } from '../../core/MemoryBankManager.js';
import { FileUtils } from '../../utils/FileUtils.js';
import path from 'path';

// ============================================================================
// Tool Definitions
// ============================================================================

export const storeToolDefinitions = [
  {
    name: 'list_stores',
    description:
      'List all registered Memory Bank stores. Returns the currently active store and any additional configured stores.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'select_store',
    description:
      'Switch the active Memory Bank store by path. The path should be the project root containing a memory-bank/ folder.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to the project root of the store to select',
        },
      },
      required: ['path'],
    },
  },
];

// ============================================================================
// Store Registry
// ============================================================================

export interface StoreInfo {
  id: string;
  path: string;
  kind: 'local' | 'remote';
  isActive: boolean;
  hasGraph: boolean;
  fileCount: number;
  lastUsedAt: string;
}

/**
 * Handler for list_stores
 */
export async function handleListStores(
  memoryBankManager: MemoryBankManager
) {
  const memoryBankDir = memoryBankManager.getMemoryBankDir();
  const projectPath = memoryBankManager.getProjectPath();

  const stores: StoreInfo[] = [];

  if (memoryBankDir) {
    // Get file count
    let fileCount = 0;
    let hasGraph = false;
    try {
      const files = await FileUtils.listFiles(memoryBankDir);
      fileCount = files.length;
      hasGraph = await FileUtils.fileExists(path.join(memoryBankDir, 'graph', 'graph.jsonl'));
    } catch {
      // Ignore — store might not be fully initialized
    }

    stores.push({
      id: path.basename(projectPath || memoryBankDir),
      path: projectPath || memoryBankDir,
      kind: 'local',
      isActive: true,
      hasGraph,
      fileCount,
      lastUsedAt: new Date().toISOString(),
    });
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            stores,
            selectedStoreId: stores.find(s => s.isActive)?.id ?? null,
          },
          null,
          2,
        ),
      },
    ],
  };
}

/**
 * Handler for select_store
 */
export async function handleSelectStore(
  memoryBankManager: MemoryBankManager,
  storePath: string
) {
  if (!storePath) {
    return {
      content: [{ type: 'text', text: 'Path is required' }],
      isError: true,
    };
  }

  const absolutePath = path.isAbsolute(storePath)
    ? storePath
    : path.resolve(process.cwd(), storePath);

  // Check that the path exists
  const exists = await FileUtils.fileExists(absolutePath);
  if (!exists) {
    return {
      content: [{ type: 'text', text: `Path does not exist: ${absolutePath}` }],
      isError: true,
    };
  }

  try {
    await memoryBankManager.setCustomPath(absolutePath);
    await memoryBankManager.initialize(true);

    const memoryBankDir = memoryBankManager.getMemoryBankDir();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              selected: true,
              id: path.basename(absolutePath),
              path: absolutePath,
              memoryBankDir,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to select store: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
