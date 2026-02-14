/**
 * GraphReducer - Transforms event log into graph snapshot
 *
 * Implements a fold operation over the append-only event log
 * to produce the current state of the graph.
 *
 * All operations are pure and idempotent.
 */

import type {
  Entity,
  EntityId,
  GraphEvent,
  GraphSnapshot,
  GraphStats,
  Observation,
  Relation,
  RelationId,
  DataEvent,
} from '../../types/graph.js';
import { createRelationId } from './GraphIds.js';
import { isMarkerEvent, isGraphEvent } from './GraphSchemas.js';
import { LogManager } from '../../utils/LogManager.js';

const logger = LogManager.getInstance();

// ============================================================================
// Mutable State for Building
// ============================================================================

interface MutableGraphState {
  entities: Map<EntityId, Entity>;
  observations: Map<string, Observation>;
  relations: Map<RelationId, Relation>;
}

/**
 * Creates an empty mutable state for reduction
 */
function createEmptyState(): MutableGraphState {
  return {
    entities: new Map(),
    observations: new Map(),
    relations: new Map(),
  };
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Applies a single event to the state
 * Returns new state (may mutate input for performance when building)
 */
function applyEvent(state: MutableGraphState, event: DataEvent): MutableGraphState {
  switch (event.type) {
    case 'entity_upsert': {
      state.entities.set(event.entity.id, event.entity);
      return state;
    }

    case 'observation_add': {
      state.observations.set(event.observation.id, event.observation);
      return state;
    }

    case 'relation_add': {
      state.relations.set(event.relation.id, event.relation);
      return state;
    }

    case 'relation_remove': {
      const relationId = createRelationId(event.fromId, event.toId, event.relationType);
      state.relations.delete(relationId);
      return state;
    }

    case 'entity_delete': {
      const entityId = event.entityId;
      state.entities.delete(entityId);
      // Also remove all observations for this entity
      for (const [obsId, obs] of state.observations) {
        if (obs.entityId === entityId) {
          state.observations.delete(obsId);
        }
      }
      // Remove all relations involving this entity
      for (const [relId, rel] of state.relations) {
        if (rel.fromId === entityId || rel.toId === entityId) {
          state.relations.delete(relId);
        }
      }
      return state;
    }

    case 'observation_delete': {
      state.observations.delete(event.observationId);
      return state;
    }

    default: {
      // Unknown event type — skip silently for forward compatibility
      // This handles cases where parsed JSON has an unrecognized type
      return state;
    }
  }
}

// ============================================================================
// Main Reducer Functions
// ============================================================================

/**
 * Reduces an array of events into a snapshot
 *
 * @param events Array of graph events (must start with marker)
 * @param storeId Store identifier for snapshot metadata
 * @returns Result with snapshot or error
 */
export function reduceEventsToSnapshot(
  events: readonly GraphEvent[],
  storeId: string
): { success: true; snapshot: GraphSnapshot } | { success: false; error: string } {
  if (events.length === 0) {
    return { success: false, error: 'Event log is empty' };
  }

  // Validate marker
  const firstEvent = events[0];
  if (!isMarkerEvent(firstEvent)) {
    return { success: false, error: 'First event must be a valid marker' };
  }

  // Build state by folding over events
  const state = createEmptyState();

  for (let i = 1; i < events.length; i++) {
    const event = events[i];
    // Skip marker events and snapshot_written events
    if (event.type === 'memory_bank_graph' || event.type === 'snapshot_written') {
      continue;
    }
    try {
      applyEvent(state, event as DataEvent);
    } catch (err) {
      // Defensive: if a structurally-valid event still blows up at runtime,
      // skip it rather than crashing the whole reduction.
      logger.warn(
        'GraphReducer',
        `Event ${i} (${event.type}) skipped due to error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Convert to immutable snapshot
  const now = new Date().toISOString();
  const snapshot: GraphSnapshot = {
    meta: {
      type: 'memory_bank_graph',
      version: '1',
      storeId,
      createdAt: now,
      source: 'memory-bank-mcp',
    },
    entities: Array.from(state.entities.values()),
    observations: Array.from(state.observations.values()),
    relations: Array.from(state.relations.values()),
  };

  return { success: true, snapshot };
}

/**
 * Parses JSONL content and reduces to snapshot
 *
 * @param jsonlContent Raw JSONL file content
 * @param storeId Store identifier
 * @returns Result with snapshot or error
 */
export function reduceJsonlToSnapshot(
  jsonlContent: string,
  storeId: string
): { success: true; snapshot: GraphSnapshot } | { success: false; error: string } {
  const lines = jsonlContent.split('\n').filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { success: false, error: 'JSONL file is empty' };
  }

  const events: GraphEvent[] = [];
  const parseErrors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const parsed: unknown = JSON.parse(lines[i]);

      // Use full structural validation — not just `typeof type === 'string'`
      if (!isGraphEvent(parsed)) {
        const snippet = lines[i].length > 80 ? lines[i].slice(0, 80) + '…' : lines[i];
        const msg = `Line ${i + 1}: Invalid event structure — skipping (${snippet})`;
        parseErrors.push(msg);
        logger.warn('GraphReducer', msg);
        continue;
      }

      events.push(parsed);
    } catch (err) {
      const msg = `Line ${i + 1}: ${err instanceof Error ? err.message : String(err)}`;
      parseErrors.push(msg);
      logger.warn('GraphReducer', msg);
    }
  }

  // Log warnings but do NOT abort — skip malformed lines and continue with
  // valid events so one corrupted line doesn't take down the whole graph.
  if (parseErrors.length > 0) {
    logger.warn(
      'GraphReducer',
      `Skipped ${parseErrors.length} malformed line(s) while reducing JSONL`
    );
  }

  return reduceEventsToSnapshot(events, storeId);
}

/**
 * Calculates statistics from a snapshot
 */
export function calculateStats(snapshot: GraphSnapshot): GraphStats {
  const entityTypes = new Set<string>();
  const relationTypes = new Set<string>();

  for (const entity of snapshot.entities) {
    entityTypes.add(entity.entityType);
  }

  for (const relation of snapshot.relations) {
    relationTypes.add(relation.relationType);
  }

  return {
    entityCount: snapshot.entities.length,
    observationCount: snapshot.observations.length,
    relationCount: snapshot.relations.length,
    entityTypes: Array.from(entityTypes).sort(),
    relationTypes: Array.from(relationTypes).sort(),
  };
}

/**
 * Merges a new snapshot into an existing one
 * Useful for incremental updates without full rebuild
 */
export function mergeSnapshots(
  existing: GraphSnapshot,
  updates: GraphSnapshot
): GraphSnapshot {
  const entities = new Map<EntityId, Entity>();
  const observations = new Map<string, Observation>();
  const relations = new Map<RelationId, Relation>();

  // Add existing data
  for (const entity of existing.entities) {
    entities.set(entity.id, entity);
  }
  for (const obs of existing.observations) {
    observations.set(obs.id, obs);
  }
  for (const rel of existing.relations) {
    relations.set(rel.id, rel);
  }

  // Apply updates (newer data wins)
  for (const entity of updates.entities) {
    entities.set(entity.id, entity);
  }
  for (const obs of updates.observations) {
    observations.set(obs.id, obs);
  }
  for (const rel of updates.relations) {
    relations.set(rel.id, rel);
  }

  return {
    meta: {
      ...updates.meta,
      createdAt: new Date().toISOString(),
    },
    entities: Array.from(entities.values()),
    observations: Array.from(observations.values()),
    relations: Array.from(relations.values()),
  };
}

/**
 * Creates empty snapshot with just metadata
 */
export function createEmptySnapshot(storeId: string): GraphSnapshot {
  return {
    meta: {
      type: 'memory_bank_graph',
      version: '1',
      storeId,
      createdAt: new Date().toISOString(),
      source: 'memory-bank-mcp',
    },
    entities: [],
    observations: [],
    relations: [],
  };
}

/**
 * Filters snapshot by entity types
 */
export function filterByEntityTypes(
  snapshot: GraphSnapshot,
  entityTypes: readonly string[]
): GraphSnapshot {
  const typeSet = new Set(entityTypes.map((t: string) => t.toLowerCase()));
  const filteredEntities = snapshot.entities.filter((e: Entity) =>
    typeSet.has(e.entityType.toLowerCase())
  );
  const entityIds = new Set(filteredEntities.map((e: Entity) => e.id));

  return {
    meta: snapshot.meta,
    entities: filteredEntities,
    observations: snapshot.observations.filter((o: Observation) => entityIds.has(o.entityId)),
    relations: snapshot.relations.filter(
      (r: Relation) => entityIds.has(r.fromId) && entityIds.has(r.toId)
    ),
  };
}

/**
 * Gets the line count from JSONL content
 */
export function getEventLineCount(jsonlContent: string): number {
  return jsonlContent.split('\n').filter((line) => line.trim().length > 0).length;
}
