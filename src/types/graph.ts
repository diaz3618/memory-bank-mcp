/**
 * Graph Types - Core data model for the knowledge graph
 *
 * Follows type-first development and discriminated unions for safe state handling.
 * All types are designed to be serializable to JSON and renderable to Markdown.
 */

// ============================================================================
// Core Domain Types
// ============================================================================

/**
 * Branded type for Entity IDs - prevents mixing with other string IDs
 */
export type EntityId = string & { readonly __brand: 'EntityId' };

/**
 * Branded type for Observation IDs
 */
export type ObservationId = string & { readonly __brand: 'ObservationId' };

/**
 * Branded type for Relation IDs
 */
export type RelationId = string & { readonly __brand: 'RelationId' };

/**
 * Source information for observations
 * Tracks where data came from for provenance
 */
export interface ObservationSource {
  readonly kind: 'manual' | 'tool' | 'import' | 'agent';
  readonly ref?: string;
}

/**
 * Entity - A node in the knowledge graph
 * Represents a distinct concept (person, project, system, policy, etc.)
 */
export interface Entity {
  readonly id: EntityId;
  readonly name: string;
  readonly entityType: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly createdAt: string; // ISO 8601
  readonly updatedAt: string; // ISO 8601
}

/**
 * Observation - A fact or note attached to an entity
 * Timestamped and sourced for provenance tracking
 */
export interface Observation {
  readonly id: ObservationId;
  readonly entityId: EntityId;
  readonly text: string;
  readonly source?: ObservationSource;
  readonly timestamp: string; // ISO 8601
}

/**
 * Relation - A directed edge between two entities
 * Examples: uses, blocked-by, depends-on, owns, created-by
 */
export interface Relation {
  readonly id: RelationId;
  readonly fromId: EntityId;
  readonly toId: EntityId;
  readonly relationType: string;
  readonly createdAt: string; // ISO 8601
}

// ============================================================================
// Graph Snapshot Types
// ============================================================================

/**
 * Metadata for a graph snapshot
 * Includes marker information for validation
 */
export interface GraphSnapshotMeta {
  readonly type: 'memory_bank_graph';
  readonly version: '1';
  readonly storeId: string;
  readonly createdAt: string; // ISO 8601
  readonly source: 'memory-bank-mcp';
}

/**
 * Complete graph state at a point in time
 * Derived from the append-only event log
 */
export interface GraphSnapshot {
  readonly meta: GraphSnapshotMeta;
  readonly entities: readonly Entity[];
  readonly observations: readonly Observation[];
  readonly relations: readonly Relation[];
}

/**
 * Index file for quick lookups and staleness detection
 */
export interface GraphIndex {
  readonly lastEventLineCount: number;
  readonly snapshotBuiltAt: string; // ISO 8601
  readonly jsonlModifiedAt: string; // ISO 8601
  readonly stats: GraphStats;
  readonly nameToEntityId: Readonly<Record<string, EntityId>>;
}

/**
 * Statistics about the graph
 */
export interface GraphStats {
  readonly entityCount: number;
  readonly observationCount: number;
  readonly relationCount: number;
  readonly entityTypes: readonly string[];
  readonly relationTypes: readonly string[];
}

// ============================================================================
// Event Types (JSONL format) - Discriminated Union
// ============================================================================

/**
 * Marker event - MUST be the first line in graph.jsonl
 */
export interface MarkerEvent {
  readonly type: 'memory_bank_graph';
  readonly source: 'memory-bank-mcp';
  readonly version: '1';
}

/**
 * Entity upsert event - create or update an entity
 */
export interface EntityUpsertEvent {
  readonly type: 'entity_upsert';
  readonly entity: Entity;
  readonly ts: string; // ISO 8601
}

/**
 * Observation add event
 */
export interface ObservationAddEvent {
  readonly type: 'observation_add';
  readonly observation: Observation;
  readonly ts: string;
}

/**
 * Relation add event
 */
export interface RelationAddEvent {
  readonly type: 'relation_add';
  readonly relation: Relation;
  readonly ts: string;
}

/**
 * Relation remove event
 */
export interface RelationRemoveEvent {
  readonly type: 'relation_remove';
  readonly fromId: EntityId;
  readonly toId: EntityId;
  readonly relationType: string;
  readonly ts: string;
}

/**
 * Entity delete event
 */
export interface EntityDeleteEvent {
  readonly type: 'entity_delete';
  readonly entityId: EntityId;
  readonly ts: string;
}

/**
 * Observation delete event - remove a specific observation from an entity
 */
export interface ObservationDeleteEvent {
  readonly type: 'observation_delete';
  readonly entityId: EntityId;
  readonly observationId: ObservationId;
  readonly ts: string;
}

/**
 * Snapshot written event (used during compaction)
 */
export interface SnapshotWrittenEvent {
  readonly type: 'snapshot_written';
  readonly snapshotPath: string;
  readonly stats: GraphStats;
  readonly ts: string;
}

/**
 * Discriminated union of all graph events
 */
export type GraphEvent =
  | MarkerEvent
  | EntityUpsertEvent
  | ObservationAddEvent
  | RelationAddEvent
  | RelationRemoveEvent
  | EntityDeleteEvent
  | ObservationDeleteEvent
  | SnapshotWrittenEvent;

/**
 * Data event types (excluding marker and snapshot)
 */
export type DataEvent =
  | EntityUpsertEvent
  | ObservationAddEvent
  | RelationAddEvent
  | RelationRemoveEvent
  | EntityDeleteEvent
  | ObservationDeleteEvent;

// ============================================================================
// Input Types (for creating new data)
// ============================================================================

/**
 * Input for creating/updating an entity
 */
export interface EntityInput {
  readonly name: string;
  readonly entityType: string;
  readonly attrs?: Record<string, unknown>;
}

/**
 * Input for adding an observation
 */
export interface ObservationInput {
  readonly entityRef: string; // name or id
  readonly text: string;
  readonly source?: ObservationSource;
  readonly timestamp?: string;
}

/**
 * Input for creating a relation
 */
export interface RelationInput {
  readonly from: string; // name or id
  readonly relationType: string;
  readonly to: string; // name or id
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Search query options
 */
export interface GraphSearchOptions {
  readonly query: string;
  readonly limit?: number;
  readonly includeNeighborhood?: boolean;
  readonly neighborhoodDepth?: 1 | 2;
  readonly entityTypes?: readonly string[];
  readonly relationTypes?: readonly string[];
}

/**
 * Search result
 */
export interface GraphSearchResult {
  readonly entities: readonly Entity[];
  readonly observations: readonly Observation[];
  readonly relations: readonly Relation[];
  readonly query: string;
  readonly totalMatches: number;
}

/**
 * Neighborhood expansion result
 */
export interface NeighborhoodResult {
  readonly centerEntity: Entity;
  readonly entities: readonly Entity[];
  readonly observations: readonly Observation[];
  readonly relations: readonly Relation[];
  readonly depth: number;
}

// ============================================================================
// Operation Result Types
// ============================================================================

/**
 * Result of a graph operation - discriminated union for success/failure
 */
export type GraphOperationResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string; readonly code: GraphErrorCode };

/**
 * Error codes for graph operations
 */
export type GraphErrorCode =
  | 'NOT_INITIALIZED'
  | 'MARKER_MISMATCH'
  | 'ENTITY_NOT_FOUND'
  | 'RELATION_NOT_FOUND'
  | 'DUPLICATE_RELATION'
  | 'INVALID_INPUT'
  | 'IO_ERROR'
  | 'ETAG_CONFLICT'
  | 'VALIDATION_ERROR';

// ============================================================================
// Constants
// ============================================================================

/**
 * Graph storage paths relative to store root
 */
export const GRAPH_PATHS = {
  DIR: 'graph',
  JSONL: 'graph/graph.jsonl',
  SNAPSHOT: 'graph/graph.snapshot.json',
  MARKDOWN: 'graph/graph.md',
  INDEX: 'graph/graph.index.json',
} as const;

/**
 * Default marker event
 */
export const MARKER_EVENT: MarkerEvent = {
  type: 'memory_bank_graph',
  source: 'memory-bank-mcp',
  version: '1',
} as const;

/**
 * Common relation types for easy reference
 */
export const COMMON_RELATION_TYPES = [
  'uses',
  'depends-on',
  'blocked-by',
  'owns',
  'created-by',
  'related-to',
  'implements',
  'extends',
  'part-of',
  'references',
] as const;

export type CommonRelationType = (typeof COMMON_RELATION_TYPES)[number];

/**
 * Common entity types
 */
export const COMMON_ENTITY_TYPES = [
  'person',
  'project',
  'system',
  'policy',
  'document',
  'feature',
  'bug',
  'task',
  'concept',
  'tool',
] as const;

export type CommonEntityType = (typeof COMMON_ENTITY_TYPES)[number];
