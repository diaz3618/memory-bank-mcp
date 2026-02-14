/**
 * StoreTools - MCP tool handlers for multi-store management
 *
 * Implements Phase 2 from knowledge-graph-plans.md A5:
 * - list_stores: list all registered + active stores with status
 * - select_store: switch the active store (by path or storeId)
 * - register_store: add a store to the persistent registry
 * - unregister_store: remove a store from the persistent registry
 *
 * A "store" is a Memory Bank instance at a given path. The default store
 * is the current workspace's memory-bank folder. Additional stores are
 * persisted in stores.json via StoreRegistry.
 */

import { MemoryBankManager } from '../../core/MemoryBankManager.js';
import { StoreRegistry } from '../../core/StoreRegistry.js';
import { FileUtils } from '../../utils/FileUtils.js';
import path from 'path';

// ============================================================================
// Tool Definitions
// ============================================================================

export const storeToolDefinitions = [
  {
    name: 'list_stores',
    description:
      'List all registered Memory Bank stores. Returns the currently active store and any additional configured stores from the persistent registry.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'select_store',
    description:
      'Switch the active Memory Bank store by path or storeId. The path should be the project root containing a memory-bank/ folder.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to the project root of the store to select',
        },
        storeId: {
          type: 'string',
          description: 'Store ID from the registry (alternative to path)',
        },
      },
      required: [] as string[],
    },
  },
  {
    name: 'register_store',
    description:
      'Register a Memory Bank store in the persistent registry. The store will appear in list_stores across sessions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        storeId: {
          type: 'string',
          description: 'Unique identifier for this store (e.g., "my-project")',
        },
        path: {
          type: 'string',
          description: 'Absolute path to the project root containing a memory-bank/ folder',
        },
        kind: {
          type: 'string',
          enum: ['local', 'remote'],
          description: 'Kind of store (default: "local")',
        },
      },
      required: ['storeId', 'path'],
    },
  },
  {
    name: 'unregister_store',
    description: 'Remove a store from the persistent registry by its storeId.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        storeId: {
          type: 'string',
          description: 'Store ID to remove from the registry',
        },
      },
      required: ['storeId'],
    },
  },
];

// ============================================================================
// Store Info (returned to callers)
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

// ============================================================================
// Singleton registry instance (shared across tool calls)
// ============================================================================

let _registry: StoreRegistry | null = null;

function getRegistry(): StoreRegistry {
  if (!_registry) {
    _registry = new StoreRegistry();
  }
  return _registry;
}

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * Handler for list_stores
 *
 * Merges the currently active store with all registry entries.
 */
export async function handleListStores(
  memoryBankManager: MemoryBankManager
) {
  const memoryBankDir = memoryBankManager.getMemoryBankDir();
  const projectPath = memoryBankManager.getProjectPath();
  const registry = getRegistry();
  const registryData = await registry.load();

  const stores: StoreInfo[] = [];
  const seenPaths = new Set<string>();

  // 1. Active store (always first)
  if (memoryBankDir) {
    const activePath = projectPath || path.dirname(memoryBankDir);
    let fileCount = 0;
    let hasGraph = false;
    try {
      const files = await FileUtils.listFiles(memoryBankDir);
      fileCount = files.length;
      hasGraph = await FileUtils.fileExists(path.join(memoryBankDir, 'graph', 'graph.jsonl'));
    } catch {
      // Ignore — store might not be fully initialized
    }

    const activeId = path.basename(activePath);
    stores.push({
      id: activeId,
      path: activePath,
      kind: 'local',
      isActive: true,
      hasGraph,
      fileCount,
      lastUsedAt: new Date().toISOString(),
    });
    seenPaths.add(activePath);
  }

  // 2. Registry entries (skip duplicates of active store)
  for (const entry of registryData.stores) {
    if (seenPaths.has(entry.projectPath)) {
      continue;
    }
    seenPaths.add(entry.projectPath);

    let hasGraph = false;
    let fileCount = 0;
    try {
      const mbDir = path.join(entry.projectPath, 'memory-bank');
      const files = await FileUtils.listFiles(mbDir);
      fileCount = files.length;
      hasGraph = await FileUtils.fileExists(path.join(mbDir, 'graph', 'graph.jsonl'));
    } catch {
      // Store may not exist anymore — still show it
    }

    stores.push({
      id: entry.storeId,
      path: entry.projectPath,
      kind: entry.kind,
      isActive: false,
      hasGraph,
      fileCount,
      lastUsedAt: entry.lastUsedAt,
    });
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            stores,
            selectedStoreId: registryData.selectedStoreId ?? stores.find(s => s.isActive)?.id ?? null,
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
 *
 * Accepts either `path` or `storeId`. If storeId is given, resolves it
 * from the registry. Switches the active MemoryBankManager store.
 */
export async function handleSelectStore(
  memoryBankManager: MemoryBankManager,
  storePath?: string,
  storeId?: string,
) {
  const registry = getRegistry();

  // Resolve path from storeId if needed
  let resolvedPath = storePath;
  if (!resolvedPath && storeId) {
    resolvedPath = (await registry.resolveStorePath(storeId)) ?? undefined;
    if (!resolvedPath) {
      return {
        content: [{ type: 'text', text: `Store "${storeId}" not found in registry` }],
        isError: true,
      };
    }
  }

  if (!resolvedPath) {
    return {
      content: [{ type: 'text', text: 'Either path or storeId is required' }],
      isError: true,
    };
  }

  const absolutePath = path.isAbsolute(resolvedPath)
    ? resolvedPath
    : path.resolve(process.cwd(), resolvedPath);

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
    const resolvedId = storeId ?? path.basename(absolutePath);

    // Update registry selection and touch timestamp
    await registry.selectStore(resolvedId).catch(() => {
      // Store may not be in registry — that's OK, selection is best-effort
    });
    await registry.touchStore(resolvedId).catch(() => {});

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              selected: true,
              id: resolvedId,
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

/**
 * Handler for register_store
 */
export async function handleRegisterStore(
  storeId: string,
  storePath: string,
  kind: 'local' | 'remote' = 'local',
) {
  if (!storeId || !storePath) {
    return {
      content: [{ type: 'text', text: 'storeId and path are required' }],
      isError: true,
    };
  }

  const absolutePath = path.isAbsolute(storePath)
    ? storePath
    : path.resolve(process.cwd(), storePath);

  const exists = await FileUtils.fileExists(absolutePath);
  if (!exists) {
    return {
      content: [{ type: 'text', text: `Path does not exist: ${absolutePath}` }],
      isError: true,
    };
  }

  const registry = getRegistry();
  const entry = await registry.registerStore({
    storeId,
    projectPath: absolutePath,
    kind,
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ registered: true, store: entry }, null, 2),
      },
    ],
  };
}

/**
 * Handler for unregister_store
 */
export async function handleUnregisterStore(storeId: string) {
  if (!storeId) {
    return {
      content: [{ type: 'text', text: 'storeId is required' }],
      isError: true,
    };
  }

  const registry = getRegistry();
  const removed = await registry.unregisterStore(storeId);

  return {
    content: [
      {
        type: 'text',
        text: removed
          ? `Store "${storeId}" removed from registry`
          : `Store "${storeId}" not found in registry`,
      },
    ],
  };
}
