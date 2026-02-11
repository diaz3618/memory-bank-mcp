/**
 * GraphStore - Main knowledge graph storage manager
 *
 * Manages the append-only event log and snapshot lifecycle.
 * Uses the FileSystemInterface for IO operations.
 *
 * Key responsibilities:
 * - Initialize graph storage
 * - Append events to JSONL
 * - Maintain snapshot consistency
 * - Generate Markdown representation
 */

import type { FileSystemInterface } from '../../utils/storage/FileSystemInterface.js';
import type {
  Entity,
  EntityId,
  GraphEvent,
  GraphIndex,
  GraphSnapshot,
  GraphStats,
  Observation,
  Relation,
  DataEvent,
  EntityInput,
  ObservationInput,
  RelationInput,
  GraphOperationResult,
} from '../../types/graph.js';
import {
  GRAPH_PATHS as GP,
  MARKER_EVENT as ME,
} from '../../types/graph.js';
import {
  createEntityId,
  createObservationId,
  createRelationId,
  normalizeName,
} from './GraphIds.js';
import {
  isMarkerEvent,
  validateEntityInput,
  validateObservationInput,
  validateRelationInput,
} from './GraphSchemas.js';
import {
  calculateStats,
  reduceJsonlToSnapshot,
  getEventLineCount,
} from './GraphReducer.js';
import {
  findEntity,
} from './GraphSearch.js';
import { renderGraphToMarkdown } from './GraphRenderer.js';
import { ETagUtils } from '../../utils/ETagUtils.js';
import { LogManager } from '../../utils/LogManager.js';

const logger = LogManager.getInstance();

// ============================================================================
// GraphStore Class
// ============================================================================

export class GraphStore {
  private readonly fs: FileSystemInterface;
  private readonly storeRoot: string;
  private readonly storeId: string;

  // In-memory cache for performance
  private cachedSnapshot: GraphSnapshot | null = null;
  private cachedIndex: GraphIndex | null = null;
  private lastJsonlEtag: string | null = null;

  constructor(fs: FileSystemInterface, storeRoot: string, storeId: string = 'default') {
    this.fs = fs;
    this.storeRoot = storeRoot;
    this.storeId = storeId;
  }

  // ==========================================================================
  // Path Helpers
  // ==========================================================================

  private get graphDir(): string {
    return this.storeRoot ? `${this.storeRoot}/${GP.DIR}` : GP.DIR;
  }

  private get jsonlPath(): string {
    return this.storeRoot ? `${this.storeRoot}/${GP.JSONL}` : GP.JSONL;
  }

  private get snapshotPath(): string {
    return this.storeRoot ? `${this.storeRoot}/${GP.SNAPSHOT}` : GP.SNAPSHOT;
  }

  private get markdownPath(): string {
    return this.storeRoot ? `${this.storeRoot}/${GP.MARKDOWN}` : GP.MARKDOWN;
  }

  private get indexPath(): string {
    return this.storeRoot ? `${this.storeRoot}/${GP.INDEX}` : GP.INDEX;
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initializes the graph storage
   * Creates necessary directories and files with marker
   */
  async initialize(): Promise<GraphOperationResult<void>> {
    try {
      // Ensure graph directory exists
      const dirExists = await this.fs.fileExists(this.graphDir);
      if (!dirExists) {
        await this.fs.ensureDirectory(this.graphDir);
        logger.info('GraphStore', `Created graph directory at ${this.graphDir}`);
      }

      // Check if JSONL exists
      const jsonlExists = await this.fs.fileExists(this.jsonlPath);
      if (!jsonlExists) {
        // Create with marker line
        const markerLine = JSON.stringify(ME) + '\n';
        await this.fs.writeFile(this.jsonlPath, markerLine);
        logger.info('GraphStore', `Created graph.jsonl with marker at ${this.jsonlPath}`);
      } else {
        // Validate existing marker
        const validation = await this.validateMarker();
        if (!validation.success) {
          return validation;
        }
      }

      // Build initial snapshot if needed
      const snapshotExists = await this.fs.fileExists(this.snapshotPath);
      if (!snapshotExists) {
        await this.rebuildSnapshot();
      }

      return { success: true, data: undefined };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('GraphStore', `Initialization failed: ${message}`);
      return { success: false, error: message, code: 'IO_ERROR' };
    }
  }

  /**
   * Validates the marker in the JSONL file
   */
  async validateMarker(): Promise<GraphOperationResult<void>> {
    try {
      const content = await this.fs.readFile(this.jsonlPath);
      const firstLine = content.split('\n')[0];

      if (!firstLine) {
        return { success: false, error: 'JSONL file is empty', code: 'MARKER_MISMATCH' };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(firstLine);
      } catch {
        return { success: false, error: 'JSONL file first line is not valid JSON', code: 'MARKER_MISMATCH' };
      }

      if (!isMarkerEvent(parsed)) {
        return {
          success: false,
          error: `Invalid marker: expected ${JSON.stringify(ME)}, got ${JSON.stringify(parsed)}`,
          code: 'MARKER_MISMATCH',
        };
      }

      return { success: true, data: undefined };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Failed to validate marker: ${message}`, code: 'IO_ERROR' };
    }
  }

  /**
   * Checks if the graph has been initialized
   */
  async isInitialized(): Promise<boolean> {
    try {
      const jsonlExists = await this.fs.fileExists(this.jsonlPath);
      if (!jsonlExists) return false;

      const validation = await this.validateMarker();
      return validation.success;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // Event Appending
  // ==========================================================================

  /**
   * Appends an event to the JSONL file
   * Uses atomic write pattern for safety
   */
  private async appendEvent(event: DataEvent): Promise<GraphOperationResult<void>> {
    try {
      // Read current content
      const currentContent = await this.fs.readFile(this.jsonlPath);

      // Validate marker still present
      const firstLine = currentContent.split('\n')[0];
      let markerValid = false;
      try {
        markerValid = !!firstLine && isMarkerEvent(JSON.parse(firstLine));
      } catch {
        // JSON.parse failed — marker is corrupted
      }
      if (!markerValid) {
        return { success: false, error: 'JSONL file marker missing or invalid', code: 'MARKER_MISMATCH' };
      }

      // Append new event
      const eventLine = JSON.stringify(event) + '\n';
      const newContent = currentContent.endsWith('\n')
        ? currentContent + eventLine
        : currentContent + '\n' + eventLine;

      // Write atomically
      await this.fs.writeFile(this.jsonlPath, newContent);

      // Invalidate cache
      this.cachedSnapshot = null;
      this.cachedIndex = null;

      return { success: true, data: undefined };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('GraphStore', `Failed to append event: ${message}`);
      return { success: false, error: message, code: 'IO_ERROR' };
    }
  }

  // ==========================================================================
  // Entity Operations
  // ==========================================================================

  /**
   * Upserts an entity (create or update)
   */
  async upsertEntity(input: EntityInput): Promise<GraphOperationResult<Entity>> {
    const validation = validateEntityInput(input);
    if (!validation.valid) {
      return { success: false, error: validation.error, code: 'INVALID_INPUT' };
    }

    const { name, entityType, attrs } = validation;
    const now = new Date().toISOString();
    const id = createEntityId(name, entityType);

    // Check if entity exists
    const snapshot = await this.getSnapshot();
    if (!snapshot.success) {
      return snapshot;
    }

    const existing = snapshot.data.entities.find((e: Entity) => e.id === id);

    const entity: Entity = {
      id,
      name,
      entityType,
      attrs,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const event: DataEvent = {
      type: 'entity_upsert',
      entity,
      ts: now,
    };

    const appendResult = await this.appendEvent(event);
    if (!appendResult.success) {
      return appendResult;
    }

    logger.info('GraphStore', `Upserted entity: ${name} [${entityType}]`);
    return { success: true, data: entity };
  }

  /**
   * Deletes an entity and its associated observations and relations
   */
  async deleteEntity(nameOrId: string): Promise<GraphOperationResult<void>> {
    const snapshot = await this.getSnapshot();
    if (!snapshot.success) {
      return snapshot;
    }

    const entity = findEntity(snapshot.data, nameOrId);
    if (!entity) {
      return { success: false, error: `Entity not found: ${nameOrId}`, code: 'ENTITY_NOT_FOUND' };
    }

    const now = new Date().toISOString();
    const event: DataEvent = {
      type: 'entity_delete',
      entityId: entity.id,
      ts: now,
    };

    const appendResult = await this.appendEvent(event);
    if (!appendResult.success) {
      return appendResult;
    }

    logger.info('GraphStore', `Deleted entity: ${entity.name}`);
    return { success: true, data: undefined };
  }

  // ==========================================================================
  // Observation Operations
  // ==========================================================================

  /**
   * Adds an observation to an entity
   */
  async addObservation(input: ObservationInput): Promise<GraphOperationResult<Observation>> {
    const validation = validateObservationInput(input);
    if (!validation.valid) {
      return { success: false, error: validation.error, code: 'INVALID_INPUT' };
    }

    const { entityRef, text, source, timestamp } = validation;
    const ts = timestamp ?? new Date().toISOString();

    // Find the entity
    const snapshot = await this.getSnapshot();
    if (!snapshot.success) {
      return snapshot;
    }

    const entity = findEntity(snapshot.data, entityRef);
    if (!entity) {
      return { success: false, error: `Entity not found: ${entityRef}`, code: 'ENTITY_NOT_FOUND' };
    }

    const id = createObservationId(entity.id, text, ts);

    const observation: Observation = {
      id,
      entityId: entity.id,
      text,
      source,
      timestamp: ts,
    };

    const event: DataEvent = {
      type: 'observation_add',
      observation,
      ts,
    };

    const appendResult = await this.appendEvent(event);
    if (!appendResult.success) {
      return appendResult;
    }

    logger.info('GraphStore', `Added observation to ${entity.name}`);
    return { success: true, data: observation };
  }

  // ==========================================================================
  // Relation Operations
  // ==========================================================================

  /**
   * Links two entities with a relation
   * Idempotent - same link won't create duplicates
   */
  async linkEntities(input: RelationInput): Promise<GraphOperationResult<Relation>> {
    const validation = validateRelationInput(input);
    if (!validation.valid) {
      return { success: false, error: validation.error, code: 'INVALID_INPUT' };
    }

    const { from, relationType, to } = validation;
    const now = new Date().toISOString();

    // Find both entities
    const snapshot = await this.getSnapshot();
    if (!snapshot.success) {
      return snapshot;
    }

    const fromEntity = findEntity(snapshot.data, from);
    if (!fromEntity) {
      return { success: false, error: `Entity not found: ${from}`, code: 'ENTITY_NOT_FOUND' };
    }

    const toEntity = findEntity(snapshot.data, to);
    if (!toEntity) {
      return { success: false, error: `Entity not found: ${to}`, code: 'ENTITY_NOT_FOUND' };
    }

    const id = createRelationId(fromEntity.id, toEntity.id, relationType);

    // Check if relation already exists (idempotent)
    const existingRelation = snapshot.data.relations.find((r: Relation) => r.id === id);
    if (existingRelation) {
      return { success: true, data: existingRelation };
    }

    const relation: Relation = {
      id,
      fromId: fromEntity.id,
      toId: toEntity.id,
      relationType,
      createdAt: now,
    };

    const event: DataEvent = {
      type: 'relation_add',
      relation,
      ts: now,
    };

    const appendResult = await this.appendEvent(event);
    if (!appendResult.success) {
      return appendResult;
    }

    logger.info('GraphStore', `Linked ${fromEntity.name} --${relationType}--> ${toEntity.name}`);
    return { success: true, data: relation };
  }

  /**
   * Removes a relation between two entities
   */
  async unlinkEntities(
    from: string,
    relationType: string,
    to: string
  ): Promise<GraphOperationResult<void>> {
    const snapshot = await this.getSnapshot();
    if (!snapshot.success) {
      return snapshot;
    }

    const fromEntity = findEntity(snapshot.data, from);
    if (!fromEntity) {
      return { success: false, error: `Entity not found: ${from}`, code: 'ENTITY_NOT_FOUND' };
    }

    const toEntity = findEntity(snapshot.data, to);
    if (!toEntity) {
      return { success: false, error: `Entity not found: ${to}`, code: 'ENTITY_NOT_FOUND' };
    }

    const relationId = createRelationId(fromEntity.id, toEntity.id, relationType);

    // Check if relation exists
    const existingRelation = snapshot.data.relations.find((r: Relation) => r.id === relationId);
    if (!existingRelation) {
      return { success: true, data: undefined }; // Idempotent - no-op if doesn't exist
    }

    const now = new Date().toISOString();
    const event: DataEvent = {
      type: 'relation_remove',
      fromId: fromEntity.id,
      toId: toEntity.id,
      relationType,
      ts: now,
    };

    const appendResult = await this.appendEvent(event);
    if (!appendResult.success) {
      return appendResult;
    }

    logger.info('GraphStore', `Unlinked ${fromEntity.name} --${relationType}--> ${toEntity.name}`);
    return { success: true, data: undefined };
  }

  // ==========================================================================
  // Snapshot Operations
  // ==========================================================================

  /**
   * Gets the current snapshot, rebuilding if necessary
   */
  async getSnapshot(): Promise<GraphOperationResult<GraphSnapshot>> {
    try {
      // Check if we need to rebuild
      const needsRebuild = await this.checkNeedsRebuild();

      if (needsRebuild || !this.cachedSnapshot) {
        const result = await this.rebuildSnapshot();
        if (!result.success) {
          return result;
        }
      }

      return { success: true, data: this.cachedSnapshot! };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, code: 'IO_ERROR' };
    }
  }

  /**
   * Checks if snapshot needs rebuilding
   */
  private async checkNeedsRebuild(): Promise<boolean> {
    try {
      if (!this.cachedSnapshot) return true;

      // Check if JSONL has changed
      const jsonlContent = await this.fs.readFile(this.jsonlPath);
      const currentEtag = ETagUtils.calculateETag(jsonlContent);

      if (this.lastJsonlEtag !== currentEtag) {
        return true;
      }

      return false;
    } catch {
      return true;
    }
  }

  /**
   * Rebuilds the snapshot from JSONL
   */
  async rebuildSnapshot(): Promise<GraphOperationResult<GraphSnapshot>> {
    try {
      const jsonlContent = await this.fs.readFile(this.jsonlPath);
      const result = reduceJsonlToSnapshot(jsonlContent, this.storeId);

      if (!result.success) {
        return { success: false, error: result.error, code: 'VALIDATION_ERROR' };
      }

      this.cachedSnapshot = result.snapshot;
      this.lastJsonlEtag = ETagUtils.calculateETag(jsonlContent);

      // Write snapshot file
      await this.fs.writeFile(this.snapshotPath, JSON.stringify(result.snapshot, null, 2));

      // Update Markdown view
      const markdown = renderGraphToMarkdown(result.snapshot);
      await this.fs.writeFile(this.markdownPath, markdown);

      // Update index
      const lineCount = getEventLineCount(jsonlContent);
      const stats = calculateStats(result.snapshot);
      const nameToEntityId: Record<string, string> = {};
      for (const entity of result.snapshot.entities) {
        nameToEntityId[normalizeName(entity.name)] = entity.id;
      }

      const index: GraphIndex = {
        lastEventLineCount: lineCount,
        snapshotBuiltAt: new Date().toISOString(),
        jsonlModifiedAt: new Date().toISOString(),
        stats,
        nameToEntityId: nameToEntityId as Record<string, EntityId>,
      };
      this.cachedIndex = index;
      await this.fs.writeFile(this.indexPath, JSON.stringify(index, null, 2));

      logger.info('GraphStore', `Rebuilt snapshot: ${stats.entityCount} entities, ${stats.relationCount} relations`);
      return { success: true, data: result.snapshot };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('GraphStore', `Failed to rebuild snapshot: ${message}`);
      return { success: false, error: message, code: 'IO_ERROR' };
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Gets graph statistics
   */
  async getStats(): Promise<GraphOperationResult<GraphStats>> {
    const snapshot = await this.getSnapshot();
    if (!snapshot.success) {
      return snapshot;
    }
    return { success: true, data: calculateStats(snapshot.data) };
  }

  /**
   * Gets the Markdown representation
   */
  async getMarkdown(): Promise<GraphOperationResult<string>> {
    try {
      const exists = await this.fs.fileExists(this.markdownPath);
      if (!exists) {
        // Rebuild to generate it
        const result = await this.rebuildSnapshot();
        if (!result.success) {
          return result;
        }
      }
      const content = await this.fs.readFile(this.markdownPath);
      return { success: true, data: content };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, code: 'IO_ERROR' };
    }
  }

  /**
   * Clears the in-memory cache
   */
  clearCache(): void {
    this.cachedSnapshot = null;
    this.cachedIndex = null;
    this.lastJsonlEtag = null;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a GraphStore instance for a memory bank
 */
export function createGraphStore(
  fs: FileSystemInterface,
  memoryBankRoot: string,
  storeId: string = 'default'
): GraphStore {
  return new GraphStore(fs, memoryBankRoot, storeId);
}
