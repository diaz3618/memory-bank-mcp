/**
 * GraphTools - MCP tool handlers for knowledge graph operations
 *
 * Implements the graph tools per knowledge-graph-plans.md A3:
 * - graph_upsert_entity
 * - graph_add_observation
 * - graph_link_entities
 * - graph_unlink_entities
 * - graph_search
 * - graph_open_nodes
 * - graph_rebuild
 */

import { MemoryBankManager } from '../../core/MemoryBankManager.js';
import { GraphStore } from '../../core/graph/GraphStore.js';
import { searchGraph, expandNeighborhood, findEntity, getEntityObservations } from '../../core/graph/GraphSearch.js';
import { StoreRegistry } from '../../core/StoreRegistry.js';
import type {
  EntityInput,
  ObservationInput,
  ObservationSource,
  RelationInput,
  Entity,
  EntityId,
} from '../../types/graph.js';
import { LocalFileSystem } from '../../utils/storage/LocalFileSystem.js';
import path from 'path';

// ============================================================================
// Tool Definitions
// ============================================================================

/** Shared storeId property for all graph tools (optional store targeting) */
const storeIdProperty = {
  storeId: {
    type: 'string',
    description: 'Optional store ID to target a specific registered store instead of the active one',
  },
};

/**
 * Graph tool definitions for MCP registration
 */
export const graphTools = [
  {
    name: 'graph_upsert_entity',
    description:
      'Create or update an entity in the knowledge graph. If an entity with the same name exists, it will be updated.',
    inputSchema: {
      type: 'object',
      properties: {
        ...storeIdProperty,
        name: {
          type: 'string',
          description: 'Entity name (human-readable identifier)',
        },
        entityType: {
          type: 'string',
          description: 'Type of entity (e.g., "person", "project", "concept")',
        },
        attrs: {
          type: 'object',
          description: 'Optional key-value attributes for the entity',
          additionalProperties: true,
        },
      },
      required: ['name', 'entityType'],
    },
  },
  {
    name: 'graph_add_observation',
    description:
      'Add an observation about an entity. Observations are facts, notes, or information associated with entities.',
    inputSchema: {
      type: 'object',
      properties: {
        ...storeIdProperty,
        entity: {
          type: 'string',
          description: 'Entity name or ID to attach the observation to',
        },
        text: {
          type: 'string',
          description: 'The observation text content',
        },
        source: {
          type: 'string',
          description: 'Optional source of the observation',
        },
        timestamp: {
          type: 'string',
          description: 'Optional ISO timestamp (defaults to current time)',
        },
      },
      required: ['entity', 'text'],
    },
  },
  {
    name: 'graph_link_entities',
    description: 'Create a directed relationship between two entities.',
    inputSchema: {
      type: 'object',
      properties: {
        ...storeIdProperty,
        from: {
          type: 'string',
          description: 'Source entity name or ID',
        },
        relationType: {
          type: 'string',
          description: 'Type of relationship (e.g., "works_on", "knows", "depends_on")',
        },
        to: {
          type: 'string',
          description: 'Target entity name or ID',
        },
      },
      required: ['from', 'relationType', 'to'],
    },
  },
  {
    name: 'graph_unlink_entities',
    description: 'Remove a relationship between two entities.',
    inputSchema: {
      type: 'object',
      properties: {
        ...storeIdProperty,
        from: {
          type: 'string',
          description: 'Source entity name or ID',
        },
        relationType: {
          type: 'string',
          description: 'Type of relationship to remove',
        },
        to: {
          type: 'string',
          description: 'Target entity name or ID',
        },
      },
      required: ['from', 'relationType', 'to'],
    },
  },
  {
    name: 'graph_search',
    description:
      'Search the knowledge graph for entities and observations matching a query. Supports fuzzy matching on names and observation text.',
    inputSchema: {
      type: 'object',
      properties: {
        ...storeIdProperty,
        query: {
          type: 'string',
          description: 'Search query string',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 10)',
        },
        includeNeighborhood: {
          type: 'boolean',
          description: 'Whether to include related entities (default: false)',
        },
        neighborhoodDepth: {
          type: 'number',
          description: 'Depth of neighborhood expansion (1 or 2, default: 1)',
          enum: [1, 2],
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'graph_open_nodes',
    description:
      'Open specific nodes and their neighborhood. Returns a subgraph with the requested entities and their connections.',
    inputSchema: {
      type: 'object',
      properties: {
        ...storeIdProperty,
        nodes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of entity names or IDs to open',
        },
        depth: {
          type: 'number',
          description: 'Neighborhood depth (1 or 2, default: 1)',
          enum: [1, 2],
        },
      },
      required: ['nodes'],
    },
  },
  {
    name: 'graph_rebuild',
    description:
      'Rebuild the graph snapshot from the event log. Use this to fix inconsistencies or recover from errors.',
    inputSchema: {
      type: 'object',
      properties: {
        ...storeIdProperty,
      },
      required: [],
    },
  },
  {
    name: 'graph_delete_entity',
    description:
      'Delete an entity and its associated observations and relations from the knowledge graph.',
    inputSchema: {
      type: 'object',
      properties: {
        ...storeIdProperty,
        entity: {
          type: 'string',
          description: 'Entity name or ID to delete',
        },
      },
      required: ['entity'],
    },
  },
  {
    name: 'graph_delete_observation',
    description:
      'Delete a specific observation from the knowledge graph by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        ...storeIdProperty,
        observationId: {
          type: 'string',
          description: 'The observation ID (starts with obs_)',
        },
      },
      required: ['observationId'],
    },
  },
  {
    name: 'graph_compact',
    description:
      'Compact the graph event log by replacing the full history with a minimal representation of the current state. Reduces file size without losing data.',
    inputSchema: {
      type: 'object',
      properties: {
        ...storeIdProperty,
      },
      required: [],
    },
  },
];

// ============================================================================
// Store Management
// ============================================================================

/** Cache of GraphStore instances by memory bank path */
const storeCache = new Map<string, GraphStore>();

/** Singleton store registry */
let _storeRegistry: StoreRegistry | null = null;
function getStoreRegistry(): StoreRegistry {
  if (!_storeRegistry) {
    _storeRegistry = new StoreRegistry();
  }
  return _storeRegistry;
}

/**
 * Gets or creates a GraphStore for the given memory bank manager.
 *
 * If `storeId` is provided, resolves the store path from the registry
 * instead of using the active store from `memoryBankManager`.
 *
 * TODO [integration-gap]: This always creates a LocalFileSystem-backed GraphStore.
 * In HTTP+Postgres mode, it should use PostgresGraphStore instead.
 * See also: KGContextTools.ts has a duplicate getGraphStore() with the same gap.
 */
async function getGraphStore(
  memoryBankManager: MemoryBankManager,
  storeId?: string,
): Promise<GraphStore | null> {
  let memoryBankDir: string | null = null;

  if (storeId) {
    // Resolve from registry
    const registry = getStoreRegistry();
    const projectPath = await registry.resolveStorePath(storeId);
    if (projectPath) {
      const folderName = memoryBankManager.getFolderName();
      memoryBankDir = path.join(projectPath, folderName);
      // Touch the store timestamp in registry
      await registry.touchStore(storeId).catch(() => {});
    }
  }

  // Fall back to active store
  if (!memoryBankDir) {
    memoryBankDir = memoryBankManager.getMemoryBankDir();
  }

  if (!memoryBankDir) {
    return null;
  }

  // Check cache
  const cached = storeCache.get(memoryBankDir);
  if (cached) {
    return cached;
  }

  // Create new store — LocalFileSystem already has memoryBankDir as root,
  // so storeRoot must be empty to avoid double-path (memory-bank/memory-bank/graph/)
  const fs = new LocalFileSystem(memoryBankDir);
  const resolvedStoreId = storeId ?? path.basename(memoryBankDir);
  const store = new GraphStore(fs, '', resolvedStoreId);

  // Initialize
  const initResult = await store.initialize();
  if (!initResult.success) {
    console.error(`Failed to initialize GraphStore: ${initResult.error}`);
    return null;
  }

  storeCache.set(memoryBankDir, store);
  return store;
}

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * Handler for graph_upsert_entity
 */
export async function handleGraphUpsertEntity(
  memoryBankManager: MemoryBankManager,
  name: string,
  entityType: string,
  attrs?: Record<string, unknown>,
  storeId?: string,
) {
  const store = await getGraphStore(memoryBankManager, storeId);
  if (!store) {
    return {
      content: [
        {
          type: 'text',
          text: 'Memory Bank not initialized. Use initialize_memory_bank first.',
        },
      ],
      isError: true,
    };
  }

  const input: EntityInput = {
    name,
    entityType,
    attrs: attrs as Record<string, string | number | boolean | null>,
  };

  const result = await store.upsertEntity(input);

  if (!result.success) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to upsert entity: ${result.error}`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            entity: result.data,
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Handler for graph_add_observation
 */
export async function handleGraphAddObservation(
  memoryBankManager: MemoryBankManager,
  entity: string,
  text: string,
  source?: string,
  timestamp?: string,
  storeId?: string,
) {
  const store = await getGraphStore(memoryBankManager, storeId);
  if (!store) {
    return {
      content: [
        {
          type: 'text',
          text: 'Memory Bank not initialized. Use initialize_memory_bank first.',
        },
      ],
      isError: true,
    };
  }

  // Resolve entity: could be name or ID
  // Try as ID first (if it looks like an ID), otherwise treat as name
  let entityId: EntityId;
  if (entity.startsWith('ent_')) {
    entityId = entity as EntityId;
  } else {
    // Look up by name
    const snapshot = await store.getSnapshot();
    if (!snapshot.success) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get snapshot: ${snapshot.error}`,
          },
        ],
        isError: true,
      };
    }
    const found = findEntity(snapshot.data, entity);
    if (!found) {
      return {
        content: [
          {
            type: 'text',
            text: `Entity not found: "${entity}". Create it first with graph_upsert_entity.`,
          },
        ],
        isError: true,
      };
    }
    entityId = found.id;
  }

  // Convert string source to ObservationSource object
  // MCP tool sends source as a plain string (e.g., "manual", "tool", "agent")
  // but ObservationInput expects { kind: string, ref?: string }
  const observationSource = source
    ? { kind: source as 'manual' | 'tool' | 'import' | 'agent', ref: undefined }
    : undefined;

  const input: ObservationInput = {
    entityRef: entityId,
    text,
    source: observationSource,
    timestamp,
  };

  const result = await store.addObservation(input);

  if (!result.success) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to add observation: ${result.error}`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            observation: result.data,
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Handler for graph_link_entities
 */
export async function handleGraphLinkEntities(
  memoryBankManager: MemoryBankManager,
  from: string,
  relationType: string,
  to: string,
  storeId?: string,
) {
  const store = await getGraphStore(memoryBankManager, storeId);
  if (!store) {
    return {
      content: [
        {
          type: 'text',
          text: 'Memory Bank not initialized. Use initialize_memory_bank first.',
        },
      ],
      isError: true,
    };
  }

  // Resolve both entities
  const snapshot = await store.getSnapshot();
  if (!snapshot.success) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to get snapshot: ${snapshot.error}`,
        },
      ],
      isError: true,
    };
  }

  const resolveEntityId = (nameOrId: string): EntityId | null => {
    if (nameOrId.startsWith('ent_')) {
      return nameOrId as EntityId;
    }
    const found = findEntity(snapshot.data, nameOrId);
    return found ? found.id : null;
  };

  const fromId = resolveEntityId(from);
  const toId = resolveEntityId(to);

  if (!fromId) {
    return {
      content: [
        {
          type: 'text',
          text: `Source entity not found: "${from}"`,
        },
      ],
      isError: true,
    };
  }

  if (!toId) {
    return {
      content: [
        {
          type: 'text',
          text: `Target entity not found: "${to}"`,
        },
      ],
      isError: true,
    };
  }

  const input: RelationInput = {
    from: fromId,
    to: toId,
    relationType,
  };

  const result = await store.linkEntities(input);

  if (!result.success) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to link entities: ${result.error}`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text',
          text: JSON.stringify(
          {
            success: true,
            relation: result.data,
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Handler for graph_unlink_entities
 */
export async function handleGraphUnlinkEntities(
  memoryBankManager: MemoryBankManager,
  from: string,
  relationType: string,
  to: string,
  storeId?: string,
) {
  const store = await getGraphStore(memoryBankManager, storeId);
  if (!store) {
    return {
      content: [
        {
          type: 'text',
          text: 'Memory Bank not initialized. Use initialize_memory_bank first.',
        },
      ],
      isError: true,
    };
  }

  // Resolve both entities
  const snapshot = await store.getSnapshot();
  if (!snapshot.success) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to get snapshot: ${snapshot.error}`,
        },
      ],
      isError: true,
    };
  }

  const resolveEntityId = (nameOrId: string): EntityId | null => {
    if (nameOrId.startsWith('ent_')) {
      return nameOrId as EntityId;
    }
    const found = findEntity(snapshot.data, nameOrId);
    return found ? found.id : null;
  };

  const fromId = resolveEntityId(from);
  const toId = resolveEntityId(to);

  if (!fromId) {
    return {
      content: [
        {
          type: 'text',
          text: `Source entity not found: "${from}"`,
        },
      ],
      isError: true,
    };
  }

  if (!toId) {
    return {
      content: [
        {
          type: 'text',
          text: `Target entity not found: "${to}"`,
        },
      ],
      isError: true,
    };
  }

  const result = await store.unlinkEntities(fromId, relationType, toId);

  if (!result.success) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to unlink entities: ${result.error}`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            message: `Unlinked ${from} --${relationType}--> ${to}`,
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Handler for graph_search
 */
export async function handleGraphSearch(
  memoryBankManager: MemoryBankManager,
  query: string,
  limit?: number,
  includeNeighborhood?: boolean,
  neighborhoodDepth?: 1 | 2,
  storeId?: string,
) {
  const store = await getGraphStore(memoryBankManager, storeId);
  if (!store) {
    return {
      content: [
        {
          type: 'text',
          text: 'Memory Bank not initialized. Use initialize_memory_bank first.',
        },
      ],
      isError: true,
    };
  }

  const snapshot = await store.getSnapshot();
  if (!snapshot.success) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to get snapshot: ${snapshot.error}`,
        },
      ],
      isError: true,
    };
  }

  // Perform search using the options-object signature
  const searchResults = searchGraph(snapshot.data, {
    query,
    limit: limit ?? 10,
    includeNeighborhood: includeNeighborhood ?? false,
    neighborhoodDepth: neighborhoodDepth ?? 1,
  });

  // Build entity ID → name map for relation display
  const entityNameMap = new Map<string, string>();
  for (const e of snapshot.data.entities) {
    entityNameMap.set(e.id, e.name);
  }

  // Map observations to their entities
  const entityObsMap = new Map<string, Array<{ text: string; timestamp: string }>>();
  for (const obs of searchResults.observations) {
    const existing = entityObsMap.get(obs.entityId) ?? [];
    existing.push({ text: obs.text, timestamp: obs.timestamp });
    entityObsMap.set(obs.entityId, existing);
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            query,
            entities: searchResults.entities.map(e => ({
              id: e.id,
              name: e.name,
              entityType: e.entityType,
              attrs: e.attrs,
              observations: entityObsMap.get(e.id) ?? getEntityObservations(snapshot.data, e.id)
                .slice(0, 5)
                .map(o => ({ text: o.text, timestamp: o.timestamp })),
            })),
            observations: searchResults.observations.map(o => ({
              text: o.text,
              entityId: o.entityId,
              entityName: entityNameMap.get(o.entityId) ?? o.entityId,
              timestamp: o.timestamp,
            })),
            relations: searchResults.relations.map(r => ({
              from: entityNameMap.get(r.fromId) ?? r.fromId,
              to: entityNameMap.get(r.toId) ?? r.toId,
              relationType: r.relationType,
            })),
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Handler for graph_open_nodes
 */
export async function handleGraphOpenNodes(
  memoryBankManager: MemoryBankManager,
  nodes: string[],
  depth?: 1 | 2,
  storeId?: string,
) {
  const store = await getGraphStore(memoryBankManager, storeId);
  if (!store) {
    return {
      content: [
        {
          type: 'text',
          text: 'Memory Bank not initialized. Use initialize_memory_bank first.',
        },
      ],
      isError: true,
    };
  }

  const snapshot = await store.getSnapshot();
  if (!snapshot.success) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to get snapshot: ${snapshot.error}`,
        },
      ],
      isError: true,
    };
  }

  // Resolve all nodes to entity IDs
  const entityIds: EntityId[] = [];
  const notFound: string[] = [];

  for (const node of nodes) {
    if (node.startsWith('ent_')) {
      entityIds.push(node as EntityId);
    } else {
      const found = findEntity(snapshot.data, node);
      if (found) {
        entityIds.push(found.id);
      } else {
        notFound.push(node);
      }
    }
  }

  if (notFound.length > 0) {
    return {
      content: [
        {
          type: 'text',
          text: `Some entities not found: ${notFound.join(', ')}`,
        },
      ],
      isError: true,
    };
  }

  // Get neighborhood
  const neighborhood = expandNeighborhood(snapshot.data, entityIds, depth ?? 1);

  // Get observations for all entities in neighborhood
  const observations = neighborhood.entities.flatMap((e: Entity) =>
    getEntityObservations(snapshot.data, e.id)
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            entities: neighborhood.entities,
            observations,
            relations: neighborhood.relations,
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Handler for graph_rebuild
 */
export async function handleGraphRebuild(memoryBankManager: MemoryBankManager, storeId?: string) {
  const store = await getGraphStore(memoryBankManager, storeId);
  if (!store) {
    return {
      content: [
        {
          type: 'text',
          text: 'Memory Bank not initialized. Use initialize_memory_bank first.',
        },
      ],
      isError: true,
    };
  }

  const result = await store.rebuildSnapshot();

  if (!result.success) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to rebuild snapshot: ${result.error}`,
        },
      ],
      isError: true,
    };
  }

  const snapshot = result.data;
  const stats = {
    entityCount: snapshot.entities.length,
    observationCount: snapshot.observations.length,
    relationCount: snapshot.relations.length,
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            message: 'Graph snapshot rebuilt successfully',
            stats,
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Handler for graph_delete_entity
 */
export async function handleGraphDeleteEntity(
  memoryBankManager: MemoryBankManager,
  entity: string,
  storeId?: string,
) {
  const store = await getGraphStore(memoryBankManager, storeId);
  if (!store) {
    return {
      content: [{ type: 'text', text: 'Memory Bank not initialized. Use initialize_memory_bank first.' }],
      isError: true,
    };
  }

  const result = await store.deleteEntity(entity);
  if (!result.success) {
    return {
      content: [{ type: 'text', text: `Failed to delete entity: ${result.error}` }],
      isError: true,
    };
  }

  // Rebuild to update snapshot + markdown
  await store.rebuildSnapshot();

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: true, message: `Entity "${entity}" deleted.` }, null, 2),
      },
    ],
  };
}

/**
 * Handler for graph_delete_observation
 */
export async function handleGraphDeleteObservation(
  memoryBankManager: MemoryBankManager,
  observationId: string,
  storeId?: string,
) {
  const store = await getGraphStore(memoryBankManager, storeId);
  if (!store) {
    return {
      content: [{ type: 'text', text: 'Memory Bank not initialized. Use initialize_memory_bank first.' }],
      isError: true,
    };
  }

  const result = await store.deleteObservation(observationId);
  if (!result.success) {
    return {
      content: [{ type: 'text', text: `Failed to delete observation: ${result.error}` }],
      isError: true,
    };
  }

  // Rebuild to update snapshot + markdown
  await store.rebuildSnapshot();

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: true, message: `Observation "${observationId}" deleted.` }, null, 2),
      },
    ],
  };
}

/**
 * Handler for graph_compact
 */
export async function handleGraphCompact(memoryBankManager: MemoryBankManager, storeId?: string) {
  const store = await getGraphStore(memoryBankManager, storeId);
  if (!store) {
    return {
      content: [{ type: 'text', text: 'Memory Bank not initialized. Use initialize_memory_bank first.' }],
      isError: true,
    };
  }

  const result = await store.compact();
  if (!result.success) {
    return {
      content: [{ type: 'text', text: `Compaction failed: ${result.error}` }],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            message: 'Graph event log compacted.',
            before: result.data.before,
            after: result.data.after,
          },
          null,
          2,
        ),
      },
    ],
  };
}
