/**
 * StoreTools - MCP tool handlers for multi-store management
 *
 * Tools:
 * - list_stores: list all registered + active stores (action:"register"/"unregister" to manage)
 * - select_store: switch the active store (by path or storeId)
 *
 * A "store" is a Memory Bank instance at a given path. The default store
 * is the current workspace's memory-bank folder. Additional stores are
 * persisted in stores.json via StoreRegistry.
 */

import { MemoryBankManager } from '../../core/MemoryBankManager.js';
import { StoreRegistry } from '../../core/StoreRegistry.js';
import { FileUtils } from '../../utils/FileUtils.js';
import { LogManager } from '../../utils/LogManager.js';
import path from 'path';

const logger = LogManager.getInstance();

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
      'Manage Memory Bank stores. Actions: select (switch active store), register (add to registry), unregister (remove from registry). Default action is "select" for backward compatibility.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['select', 'register', 'unregister'],
          description: 'Action to perform: "select" (default), "register", or "unregister"',
        },
        path: {
          type: 'string',
          description: 'Absolute path to the project root (required for select/register)',
        },
        storeId: {
          type: 'string',
          description: 'Store ID (required for register/unregister, optional for select)',
        },
        kind: {
          type: 'string',
          enum: ['local', 'remote'],
          description: 'Kind of store (for register action, default: "local")',
        },
      },
      required: [] as string[],
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

    // Use registry storeId when the active path matches a registered store,
    // otherwise fall back to path.basename(). This keeps list_stores IDs
    // consistent with select_store.
    const registryEntry = registryData.stores.find(s => s.projectPath === activePath);
    const activeId = registryEntry?.storeId ?? path.basename(activePath);
    const activeKind = registryEntry?.kind ?? 'local';
    stores.push({
      id: activeId,
      path: activePath,
      kind: activeKind,
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
 * Handles multiple actions:
 * - select (default): Switch the active Memory Bank store
 * - register: Add a store to the persistent registry
 * - unregister: Remove a store from the registry
 */
export async function handleSelectStore(
  memoryBankManager: MemoryBankManager,
  storePath?: string,
  storeId?: string,
  action: 'select' | 'register' | 'unregister' = 'select',
  kind: 'local' | 'remote' = 'local',
) {
  const registry = getRegistry();

  // Handle unregister action
  if (action === 'unregister') {
    if (!storeId) {
      return {
        content: [{ type: 'text', text: 'storeId is required for unregister action' }],
        isError: true,
      };
    }
    const removed = await registry.unregisterStore(storeId);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: removed,
            action: 'unregister',
            storeId,
            message: removed ? `Store "${storeId}" removed from registry` : `Store "${storeId}" not found in registry`,
          }, null, 2),
        },
      ],
    };
  }

  // Handle register action
  if (action === 'register') {
    if (!storeId || !storePath) {
      return {
        content: [{ type: 'text', text: 'storeId and path are required for register action' }],
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

    const entry = await registry.registerStore({
      storeId,
      projectPath: absolutePath,
      kind,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, action: 'register', store: entry }, null, 2),
        },
      ],
    };
  }

  // Default: select action
  // Resolve path from storeId if needed
  let resolvedPath = storePath;
  if (!resolvedPath && storeId) {
    resolvedPath = (await registry.resolveStorePath(storeId)) ?? undefined;
    
    // If not in registry, check if storeId matches the currently active store
    if (!resolvedPath) {
      const currentDir = memoryBankManager.getMemoryBankDir();
      const currentProjectPath = memoryBankManager.getProjectPath();
      if (currentDir) {
        const activePath = currentProjectPath || path.dirname(currentDir);
        const activeId = path.basename(activePath);
        if (activeId === storeId) {
          // Already the active store — just confirm selection
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    selected: true,
                    id: storeId,
                    path: activePath,
                    memoryBankDir: currentDir,
                    note: 'Store is already active',
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
      }
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


