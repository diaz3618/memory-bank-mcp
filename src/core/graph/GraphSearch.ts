/**
 * GraphSearch - Search and neighborhood expansion for the knowledge graph
 *
 * Provides in-memory search across entities, observations, and relations.
 * Supports substring matching with future extensibility for full-text/embeddings.
 */

import type {
  Entity,
  EntityId,
  GraphSearchOptions,
  GraphSearchResult,
  GraphSnapshot,
  NeighborhoodResult,
  Observation,
  Relation,
} from '../../types/graph.js';
import { normalizeName } from './GraphIds.js';

// ============================================================================
// Search Types
// ============================================================================

export interface EntityMatch {
  entity: Entity;
  score: number;
  matchedIn: ('name' | 'type' | 'attrs')[];
}

export interface ObservationMatch {
  observation: Observation;
  score: number;
}

// ============================================================================
// Search Implementation
// ============================================================================

/**
 * Normalizes search query for matching
 */
function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Calculates a simple relevance score for a match
 * Higher scores = better matches
 */
function calculateMatchScore(text: string, query: string): number {
  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase();

  // Exact match
  if (normalizedText === normalizedQuery) {
    return 100;
  }

  // Starts with query
  if (normalizedText.startsWith(normalizedQuery)) {
    return 80;
  }

  // Contains query as whole word
  const wordBoundary = new RegExp(`\\b${escapeRegex(normalizedQuery)}\\b`, 'i');
  if (wordBoundary.test(text)) {
    return 60;
  }

  // Contains query as substring
  if (normalizedText.includes(normalizedQuery)) {
    return 40;
  }

  return 0;
}

/**
 * Escapes special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Searches entities for matches
 */
function searchEntities(
  entities: readonly Entity[],
  query: string,
  limit: number
): EntityMatch[] {
  const normalizedQuery = normalizeQuery(query);
  const matches: EntityMatch[] = [];

  for (const entity of entities) {
    const matchedIn: ('name' | 'type' | 'attrs')[] = [];
    let bestScore = 0;

    // Check name
    const nameScore = calculateMatchScore(entity.name, normalizedQuery);
    if (nameScore > 0) {
      matchedIn.push('name');
      bestScore = Math.max(bestScore, nameScore);
    }

    // Check entity type
    const typeScore = calculateMatchScore(entity.entityType, normalizedQuery);
    if (typeScore > 0) {
      matchedIn.push('type');
      bestScore = Math.max(bestScore, typeScore * 0.8); // Type matches weighted lower
    }

    // Check attrs if present
    if (entity.attrs) {
      const attrsStr = JSON.stringify(entity.attrs);
      const attrsScore = calculateMatchScore(attrsStr, normalizedQuery);
      if (attrsScore > 0) {
        matchedIn.push('attrs');
        bestScore = Math.max(bestScore, attrsScore * 0.6); // Attrs matches weighted lower
      }
    }

    if (bestScore > 0) {
      matches.push({ entity, score: bestScore, matchedIn });
    }
  }

  // Sort by score descending and limit
  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Searches observations for matches
 */
function searchObservations(
  observations: readonly Observation[],
  query: string,
  limit: number
): ObservationMatch[] {
  const normalizedQuery = normalizeQuery(query);
  const matches: ObservationMatch[] = [];

  for (const observation of observations) {
    const score = calculateMatchScore(observation.text, normalizedQuery);
    if (score > 0) {
      matches.push({ observation, score });
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ============================================================================
// Main Search Function
// ============================================================================

/**
 * Performs a search across the graph
 *
 * @param snapshot Graph snapshot to search
 * @param options Search options
 * @returns Search results
 */
export function searchGraph(
  snapshot: GraphSnapshot,
  options: GraphSearchOptions
): GraphSearchResult {
  const limit = options.limit ?? 20;
  const { query, entityTypes, relationTypes, includeNeighborhood, neighborhoodDepth } = options;

  // Handle wildcard / empty query — return everything (up to limit)
  const isWildcard = !query || query === '*' || query.trim() === '';

  // Filter entities by type if specified
  let entities: readonly Entity[] = snapshot.entities;
  if (entityTypes && entityTypes.length > 0) {
    const typeSet = new Set(entityTypes.map((t: string) => t.toLowerCase()));
    entities = entities.filter((e: Entity) => typeSet.has(e.entityType.toLowerCase()));
  }

  // Search or return all entities
  let entityMatches: EntityMatch[];
  if (isWildcard) {
    entityMatches = entities.slice(0, limit).map(entity => ({
      entity,
      score: 100,
      matchedIn: ['name' as const],
    }));
  } else {
    entityMatches = searchEntities(entities, query, limit);
  }
  const matchedEntityIds = new Set(entityMatches.map((m: EntityMatch) => m.entity.id));

  // Search or return all observations
  let observationMatches: ObservationMatch[];
  if (isWildcard) {
    observationMatches = snapshot.observations.slice(0, limit).map(obs => ({
      observation: obs,
      score: 100,
    }));
  } else {
    observationMatches = searchObservations(snapshot.observations, query, limit);
  }

  // Find relations involving matched entities
  let matchedRelations: Relation[] = (snapshot.relations as Relation[]).filter(
    (r: Relation) => matchedEntityIds.has(r.fromId) || matchedEntityIds.has(r.toId)
  );

  // Filter by relation type if specified
  if (relationTypes && relationTypes.length > 0) {
    const relTypeSet = new Set(relationTypes.map((t: string) => t.toLowerCase()));
    matchedRelations = matchedRelations.filter((r: Relation) =>
      relTypeSet.has(r.relationType.toLowerCase())
    );
  }

  // Get neighborhood if requested
  let neighborhoodEntities: Entity[] = [];
  let neighborhoodRelations: Relation[] = [];

  if (includeNeighborhood && matchedEntityIds.size > 0) {
    const depth = neighborhoodDepth ?? 1;
    const neighborhood = expandNeighborhood(snapshot, Array.from(matchedEntityIds), depth);
    neighborhoodEntities = neighborhood.entities.filter((e: Entity) => !matchedEntityIds.has(e.id));
    neighborhoodRelations = neighborhood.relations;
  }

  // Combine results
  const allEntities = [...entityMatches.map((m) => m.entity), ...neighborhoodEntities];
  const allRelations = [...matchedRelations, ...neighborhoodRelations];

  // Deduplicate
  const entityMap = new Map<EntityId, Entity>();
  for (const e of allEntities) {
    entityMap.set(e.id, e);
  }

  const relationMap = new Map<string, Relation>();
  for (const r of allRelations) {
    relationMap.set(r.id, r);
  }

  return {
    entities: Array.from(entityMap.values()),
    observations: observationMatches.map((m) => m.observation),
    relations: Array.from(relationMap.values()),
    query,
    totalMatches: entityMatches.length + observationMatches.length,
  };
}

// ============================================================================
// Neighborhood Expansion
// ============================================================================

/**
 * Expands the neighborhood around given entity IDs
 *
 * @param snapshot Graph snapshot
 * @param entityIds Center entity IDs
 * @param depth How many hops to expand (1 or 2)
 * @returns Entities and relations in the neighborhood
 */
export function expandNeighborhood(
  snapshot: GraphSnapshot,
  entityIds: EntityId[],
  depth: 1 | 2
): { entities: Entity[]; relations: Relation[] } {
  const visitedIds = new Set<EntityId>(entityIds);
  const collectedRelations: Relation[] = [];

  let currentLayer = new Set(entityIds);

  for (let d = 0; d < depth; d++) {
    const nextLayer = new Set<EntityId>();

    for (const relation of snapshot.relations) {
      const fromInLayer = currentLayer.has(relation.fromId);
      const toInLayer = currentLayer.has(relation.toId);

      if (fromInLayer || toInLayer) {
        collectedRelations.push(relation);

        // Add connected entities to next layer
        if (fromInLayer && !visitedIds.has(relation.toId)) {
          nextLayer.add(relation.toId);
          visitedIds.add(relation.toId);
        }
        if (toInLayer && !visitedIds.has(relation.fromId)) {
          nextLayer.add(relation.fromId);
          visitedIds.add(relation.fromId);
        }
      }
    }

    currentLayer = nextLayer;
  }

  // Get all visited entities
  const entities = snapshot.entities.filter((e: Entity) => visitedIds.has(e.id));

  // Deduplicate relations
  const relationMap = new Map<string, Relation>();
  for (const r of collectedRelations) {
    relationMap.set(r.id, r);
  }

  return {
    entities: entities as Entity[],
    relations: Array.from(relationMap.values()),
  };
}

/**
 * Gets full neighborhood result for a single entity
 */
export function getEntityNeighborhood(
  snapshot: GraphSnapshot,
  entityId: EntityId,
  depth: 1 | 2
): NeighborhoodResult | null {
  const centerEntity = snapshot.entities.find((e: Entity) => e.id === entityId);
  if (!centerEntity) {
    return null;
  }

  const neighborhood = expandNeighborhood(snapshot, [entityId], depth);

  // Get observations for center entity
  const observations = snapshot.observations.filter((o: Observation) => o.entityId === entityId);

  return {
    centerEntity,
    entities: neighborhood.entities,
    observations: observations as Observation[],
    relations: neighborhood.relations,
    depth,
  };
}

// ============================================================================
// Lookup Functions
// ============================================================================

/**
 * Finds an entity by name or ID
 */
export function findEntity(
  snapshot: GraphSnapshot,
  nameOrId: string
): Entity | null {
  // Try exact ID match first
  const byId = snapshot.entities.find((e: Entity) => e.id === nameOrId);
  if (byId) return byId;

  // Try exact name match
  const normalizedInput = normalizeName(nameOrId);
  const byName = snapshot.entities.find(
    (e: Entity) => normalizeName(e.name) === normalizedInput
  );
  if (byName) return byName;

  // Try partial name match
  const byPartialName = snapshot.entities.find((e: Entity) =>
    normalizeName(e.name).includes(normalizedInput)
  );

  return byPartialName ?? null;
}

/**
 * Gets all observations for an entity
 */
export function getEntityObservations(
  snapshot: GraphSnapshot,
  entityId: EntityId
): Observation[] {
  return (snapshot.observations as Observation[])
    .filter((o: Observation) => o.entityId === entityId)
    .sort((a: Observation, b: Observation) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * Gets all relations where an entity is the source or target
 */
export function getEntityRelations(
  snapshot: GraphSnapshot,
  entityId: EntityId
): { outgoing: Relation[]; incoming: Relation[] } {
  const outgoing = (snapshot.relations as Relation[]).filter((r: Relation) => r.fromId === entityId);
  const incoming = (snapshot.relations as Relation[]).filter((r: Relation) => r.toId === entityId);
  return { outgoing, incoming };
}

/**
 * Builds a name-to-ID lookup map from a snapshot
 */
export function buildNameToIdMap(snapshot: GraphSnapshot): Map<string, EntityId> {
  const map = new Map<string, EntityId>();
  for (const entity of snapshot.entities) {
    map.set(normalizeName(entity.name), entity.id);
  }
  return map;
}

// ============================================================================
// Detailed Search (exposes scores + matched-fields)
// ============================================================================

export interface DetailedSearchResult {
  entityMatches: EntityMatch[];
  observationMatches: ObservationMatch[];
}

/**
 * Like `searchGraph` but returns raw scored matches instead of flattened
 * entity/observation arrays. Used by `get_targeted_context` to rank
 * pointers and build budgeted payloads.
 *
 * Does NOT modify `searchGraph`'s existing output.
 */
export function searchGraphDetailed(
  snapshot: GraphSnapshot,
  options: { query: string; limit?: number }
): DetailedSearchResult {
  const limit = options.limit ?? 20;
  const { query } = options;

  const isWildcard = !query || query === '*' || query.trim() === '';

  const entityMatches: EntityMatch[] = isWildcard
    ? snapshot.entities.slice(0, limit).map((entity) => ({
        entity,
        score: 100,
        matchedIn: ['name' as const],
      }))
    : searchEntities(snapshot.entities, query, limit);

  const observationMatches: ObservationMatch[] = isWildcard
    ? snapshot.observations.slice(0, limit).map((obs) => ({
        observation: obs,
        score: 100,
      }))
    : searchObservations(snapshot.observations, query, limit);

  return { entityMatches, observationMatches };
}

