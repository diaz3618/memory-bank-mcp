/**
 * Graph Module Exports
 *
 * Provides knowledge graph functionality for memory-bank-mcp.
 */

// Core store
export { GraphStore, createGraphStore } from './GraphStore.js';

// ID utilities
export {
  createEntityId,
  createObservationId,
  createRelationId,
  normalizeName,
  isValidEntityId,
  isValidObservationId,
  isValidRelationId,
  toEntityId,
  toObservationId,
  toRelationId,
} from './GraphIds.js';

// Schema validation
export {
  isEntity,
  isObservation,
  isRelation,
  isMarkerEvent,
  isGraphEvent,
  isGraphSnapshot,
  isGraphStats,
  validateEntityInput,
  validateObservationInput,
  validateRelationInput,
  validateMarker,
  parseEventLine,
} from './GraphSchemas.js';

// Reducer functions
export {
  reduceEventsToSnapshot,
  reduceJsonlToSnapshot,
  calculateStats,
  createEmptySnapshot,
  mergeSnapshots,
  filterByEntityTypes,
  getEventLineCount,
} from './GraphReducer.js';

// Search functions
export {
  searchGraph,
  expandNeighborhood,
  getEntityNeighborhood,
  findEntity,
  getEntityObservations,
  getEntityRelations,
  buildNameToIdMap,
} from './GraphSearch.js';

// Rendering
export {
  renderGraphToMarkdown,
  renderGraphSummary,
  renderSearchResults,
} from './GraphRenderer.js';
