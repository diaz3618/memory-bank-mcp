/**
 * GraphSchemas - Type guards and validation for graph events and data
 *
 * Provides runtime validation for data entering the system.
 * All validators follow the pattern: (unknown) => value is Type
 */

import type {
  Entity,
  EntityId,
  GraphEvent,
  GraphSnapshot,
  GraphSnapshotMeta,
  MarkerEvent,
  Observation,
  ObservationId,
  ObservationSource,
  Relation,
  RelationId,
  EntityUpsertEvent,
  ObservationAddEvent,
  RelationAddEvent,
  RelationRemoveEvent,
  EntityDeleteEvent,
  ObservationDeleteEvent,
  SnapshotWrittenEvent,
  GraphStats,
  GraphIndex,
} from '../../types/graph.js';
import { MARKER_EVENT } from '../../types/graph.js';

// ============================================================================
// Basic Type Guards
// ============================================================================

/**
 * Checks whether `value` is a plain object — i.e. one created by `{}`, `Object.create(null)`,
 * or `new Object`. Rejects `Date`, boxed primitives, class instances, and arrays, all of which
 * would not survive a JSON round-trip as objects.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isISODateString(value: unknown): value is string {
  if (!isString(value)) return false;
  const date = new Date(value);
  return !isNaN(date.getTime());
}

// ============================================================================
// ID Validation
// ============================================================================

export function isEntityId(value: unknown): value is EntityId {
  return isString(value) && value.startsWith('ent_') && value.length >= 5;
}

export function isObservationId(value: unknown): value is ObservationId {
  return isString(value) && value.startsWith('obs_') && value.length >= 5;
}

export function isRelationId(value: unknown): value is RelationId {
  return isString(value) && value.startsWith('rel_') && value.length >= 5;
}

// ============================================================================
// Source Validation
// ============================================================================

export function isObservationSource(value: unknown): value is ObservationSource {
  if (!isObject(value)) return false;
  const kind = value['kind'];
  if (!isString(kind)) return false;
  if (!['manual', 'tool', 'import', 'agent'].includes(kind)) return false;
  if ('ref' in value && value['ref'] !== undefined && !isString(value['ref'])) return false;
  return true;
}

// ============================================================================
// Entity Validation
// ============================================================================

export function isEntity(value: unknown): value is Entity {
  if (!isObject(value)) return false;
  return (
    isEntityId(value['id']) &&
    isString(value['name']) &&
    value['name'].length > 0 &&
    isString(value['entityType']) &&
    value['entityType'].length > 0 &&
    isISODateString(value['createdAt']) &&
    isISODateString(value['updatedAt']) &&
    (value['attrs'] === undefined || isObject(value['attrs']))
  );
}

// ============================================================================
// Observation Validation
// ============================================================================

export function isObservation(value: unknown): value is Observation {
  if (!isObject(value)) return false;
  return (
    isObservationId(value['id']) &&
    isEntityId(value['entityId']) &&
    isString(value['text']) &&
    isISODateString(value['timestamp']) &&
    (value['source'] === undefined || isObservationSource(value['source']))
  );
}

// ============================================================================
// Relation Validation
// ============================================================================

export function isRelation(value: unknown): value is Relation {
  if (!isObject(value)) return false;
  return (
    isRelationId(value['id']) &&
    isEntityId(value['fromId']) &&
    isEntityId(value['toId']) &&
    isString(value['relationType']) &&
    value['relationType'].length > 0 &&
    isISODateString(value['createdAt'])
  );
}

// ============================================================================
// Event Validation
// ============================================================================

export function isMarkerEvent(value: unknown): value is MarkerEvent {
  if (!isObject(value)) return false;
  return (
    value['type'] === 'memory_bank_graph' &&
    value['source'] === 'memory-bank-mcp' &&
    value['version'] === '1'
  );
}

export function isEntityUpsertEvent(value: unknown): value is EntityUpsertEvent {
  if (!isObject(value)) return false;
  return (
    value['type'] === 'entity_upsert' &&
    isEntity(value['entity']) &&
    isISODateString(value['ts'])
  );
}

export function isObservationAddEvent(value: unknown): value is ObservationAddEvent {
  if (!isObject(value)) return false;
  return (
    value['type'] === 'observation_add' &&
    isObservation(value['observation']) &&
    isISODateString(value['ts'])
  );
}

export function isRelationAddEvent(value: unknown): value is RelationAddEvent {
  if (!isObject(value)) return false;
  return (
    value['type'] === 'relation_add' &&
    isRelation(value['relation']) &&
    isISODateString(value['ts'])
  );
}

export function isRelationRemoveEvent(value: unknown): value is RelationRemoveEvent {
  if (!isObject(value)) return false;
  return (
    value['type'] === 'relation_remove' &&
    isEntityId(value['fromId']) &&
    isEntityId(value['toId']) &&
    isString(value['relationType']) &&
    isISODateString(value['ts'])
  );
}

export function isEntityDeleteEvent(value: unknown): value is EntityDeleteEvent {
  if (!isObject(value)) return false;
  return (
    value['type'] === 'entity_delete' &&
    isEntityId(value['entityId']) &&
    isISODateString(value['ts'])
  );
}

export function isObservationDeleteEvent(value: unknown): value is ObservationDeleteEvent {
  if (!isObject(value)) return false;
  return (
    value['type'] === 'observation_delete' &&
    isEntityId(value['entityId']) &&
    isObservationId(value['observationId']) &&
    isISODateString(value['ts'])
  );
}

export function isSnapshotWrittenEvent(value: unknown): value is SnapshotWrittenEvent {
  if (!isObject(value)) return false;
  return (
    value['type'] === 'snapshot_written' &&
    isString(value['snapshotPath']) &&
    isGraphStats(value['stats']) &&
    isISODateString(value['ts'])
  );
}

export function isGraphEvent(value: unknown): value is GraphEvent {
  return (
    isMarkerEvent(value) ||
    isEntityUpsertEvent(value) ||
    isObservationAddEvent(value) ||
    isRelationAddEvent(value) ||
    isRelationRemoveEvent(value) ||
    isEntityDeleteEvent(value) ||
    isObservationDeleteEvent(value) ||
    isSnapshotWrittenEvent(value)
  );
}

// ============================================================================
// Stats Validation
// ============================================================================

export function isGraphStats(value: unknown): value is GraphStats {
  if (!isObject(value)) return false;
  return (
    isNumber(value['entityCount']) &&
    isNumber(value['observationCount']) &&
    isNumber(value['relationCount']) &&
    isArray(value['entityTypes']) &&
    (value['entityTypes'] as unknown[]).every(isString) &&
    isArray(value['relationTypes']) &&
    (value['relationTypes'] as unknown[]).every(isString)
  );
}

// ============================================================================
// Snapshot Validation
// ============================================================================

export function isGraphSnapshotMeta(value: unknown): value is GraphSnapshotMeta {
  if (!isObject(value)) return false;
  return (
    value['type'] === 'memory_bank_graph' &&
    value['version'] === '1' &&
    isString(value['storeId']) &&
    isISODateString(value['createdAt']) &&
    value['source'] === 'memory-bank-mcp'
  );
}

export function isGraphSnapshot(value: unknown): value is GraphSnapshot {
  if (!isObject(value)) return false;
  if (!isGraphSnapshotMeta(value['meta'])) return false;
  if (!isArray(value['entities'])) return false;
  if (!isArray(value['observations'])) return false;
  if (!isArray(value['relations'])) return false;
  
  const entities = value['entities'] as unknown[];
  const observations = value['observations'] as unknown[];
  const relations = value['relations'] as unknown[];
  
  return (
    entities.every(isEntity) &&
    observations.every(isObservation) &&
    relations.every(isRelation)
  );
}

// ============================================================================
// Index Validation
// ============================================================================

export function isGraphIndex(value: unknown): value is GraphIndex {
  if (!isObject(value)) return false;
  return (
    isNumber(value['lastEventLineCount']) &&
    isISODateString(value['snapshotBuiltAt']) &&
    isISODateString(value['jsonlModifiedAt']) &&
    isGraphStats(value['stats']) &&
    isObject(value['nameToEntityId'])
  );
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validates that the first event in a JSONL file is a valid marker
 */
export function validateMarker(firstLine: string): { valid: true } | { valid: false; error: string } {
  try {
    const parsed = JSON.parse(firstLine);
    if (!isMarkerEvent(parsed)) {
      return {
        valid: false,
        error: `Invalid marker: expected ${JSON.stringify(MARKER_EVENT)}, got ${JSON.stringify(parsed)}`,
      };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: `Failed to parse marker line: ${firstLine}` };
  }
}

/**
 * Parses a JSONL line into a GraphEvent
 */
export function parseEventLine(
  line: string,
  lineNumber: number
): { success: true; event: GraphEvent } | { success: false; error: string } {
  try {
    const parsed = JSON.parse(line);
    if (!isGraphEvent(parsed)) {
      return { success: false, error: `Line ${lineNumber}: Invalid event structure` };
    }
    return { success: true, event: parsed };
  } catch (err) {
    return {
      success: false,
      error: `Line ${lineNumber}: JSON parse error - ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Validates entity input for upsert operations
 */
export function validateEntityInput(
  input: unknown
): { valid: true; name: string; entityType: string; attrs?: Record<string, unknown> } | { valid: false; error: string } {
  if (!isObject(input)) {
    return { valid: false, error: 'Input must be an object' };
  }
  
  const name = input['name'];
  const entityType = input['entityType'];
  const attrs = input['attrs'];
  
  if (!isString(name) || name.trim().length === 0) {
    return { valid: false, error: 'name is required and must be a non-empty string' };
  }
  
  if (!isString(entityType) || entityType.trim().length === 0) {
    return { valid: false, error: 'entityType is required and must be a non-empty string' };
  }
  
  if (attrs !== undefined && !isObject(attrs)) {
    return { valid: false, error: 'attrs must be an object if provided' };
  }
  
  return {
    valid: true,
    name: name.trim(),
    entityType: entityType.trim(),
    attrs: attrs as Record<string, unknown> | undefined,
  };
}

/**
 * Validates observation input
 */
export function validateObservationInput(
  input: unknown
): { valid: true; entityRef: string; text: string; source?: ObservationSource; timestamp?: string } | { valid: false; error: string } {
  if (!isObject(input)) {
    return { valid: false, error: 'Input must be an object' };
  }
  
  const entityRef = input['entityRef'] ?? input['entity'];
  const text = input['text'];
  const source = input['source'];
  const timestamp = input['timestamp'];
  
  if (!isString(entityRef) || entityRef.trim().length === 0) {
    return { valid: false, error: 'entityRef (or entity) is required and must be a non-empty string' };
  }
  
  if (!isString(text) || text.trim().length === 0) {
    return { valid: false, error: 'text is required and must be a non-empty string' };
  }
  
  if (source !== undefined && !isObservationSource(source)) {
    return { valid: false, error: 'source must be a valid ObservationSource if provided' };
  }
  
  if (timestamp !== undefined && !isISODateString(timestamp)) {
    return { valid: false, error: 'timestamp must be a valid ISO date string if provided' };
  }
  
  return {
    valid: true,
    entityRef: entityRef.trim(),
    text: text.trim(),
    source: source as ObservationSource | undefined,
    timestamp: timestamp as string | undefined,
  };
}

/**
 * Validates relation input
 */
export function validateRelationInput(
  input: unknown
): { valid: true; from: string; relationType: string; to: string } | { valid: false; error: string } {
  if (!isObject(input)) {
    return { valid: false, error: 'Input must be an object' };
  }
  
  const from = input['from'];
  const relationType = input['relationType'];
  const to = input['to'];
  
  if (!isString(from) || from.trim().length === 0) {
    return { valid: false, error: 'from is required and must be a non-empty string' };
  }
  
  if (!isString(relationType) || relationType.trim().length === 0) {
    return { valid: false, error: 'relationType is required and must be a non-empty string' };
  }
  
  if (!isString(to) || to.trim().length === 0) {
    return { valid: false, error: 'to is required and must be a non-empty string' };
  }
  
  return {
    valid: true,
    from: from.trim(),
    relationType: relationType.trim(),
    to: to.trim(),
  };
}
