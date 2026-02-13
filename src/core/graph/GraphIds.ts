/**
 * GraphIds - ID generation and normalization utilities
 *
 * Generates stable, URL-safe IDs for graph entities.
 * Uses deterministic hashing for idempotent upserts.
 */

import type { EntityId, ObservationId, RelationId } from '../../types/graph.js';
import { createHash } from 'crypto';

/**
 * Generates a short, URL-safe hash from input string
 */
function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('base64url').slice(0, 12);
}

/**
 * Normalizes a name for consistent lookup
 * - Trims whitespace
 * - Converts to lowercase
 * - Replaces multiple spaces with single space
 */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Creates a stable entity ID from name and type
 * Same name+type always produces the same ID (idempotent)
 */
export function createEntityId(name: string, entityType: string): EntityId {
  const normalized = `${normalizeName(name)}:${entityType.toLowerCase()}`;
  return `ent_${shortHash(normalized)}` as EntityId;
}

/**
 * Creates a unique observation ID
 * Includes entity, full text, and timestamp for uniqueness.
 * Uses the complete text in the hash — truncation previously
 * caused collisions for long observations that shared a prefix.
 */
export function createObservationId(
  entityId: EntityId,
  text: string,
  timestamp: string
): ObservationId {
  const input = `${entityId}:${text}:${timestamp}`;
  return `obs_${shortHash(input)}` as ObservationId;
}

/**
 * Creates a stable relation ID from its components
 * Same from+to+type always produces same ID (idempotent)
 */
export function createRelationId(
  fromId: EntityId,
  toId: EntityId,
  relationType: string
): RelationId {
  const normalized = `${fromId}:${relationType.toLowerCase()}:${toId}`;
  return `rel_${shortHash(normalized)}` as RelationId;
}

/**
 * Validates an entity ID format
 */
export function isValidEntityId(id: string): id is EntityId {
  return typeof id === 'string' && id.startsWith('ent_') && id.length >= 5;
}

/**
 * Validates an observation ID format
 */
export function isValidObservationId(id: string): id is ObservationId {
  return typeof id === 'string' && id.startsWith('obs_') && id.length >= 5;
}

/**
 * Validates a relation ID format
 */
export function isValidRelationId(id: string): id is RelationId {
  return typeof id === 'string' && id.startsWith('rel_') && id.length >= 5;
}

/**
 * Creates branded ID from raw string (for deserialization)
 * Use with caution - only when loading from trusted source
 */
export function toEntityId(raw: string): EntityId {
  return raw as EntityId;
}

export function toObservationId(raw: string): ObservationId {
  return raw as ObservationId;
}

export function toRelationId(raw: string): RelationId {
  return raw as RelationId;
}
