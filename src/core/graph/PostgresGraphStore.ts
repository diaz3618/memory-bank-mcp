/**
 * PostgresGraphStore — Knowledge graph storage backed by Postgres tables
 *
 * Replaces the JSONL-based GraphStore for the HTTP+Postgres deployment mode.
 * Maps Entity/Observation/Relation types to their respective Postgres tables.
 *
 * All queries run with RLS context via DatabaseManager.queryWithContext().
 */

import type { DatabaseManager } from '../../utils/DatabaseManager.js';
import type {
  Entity,
  EntityId,
  Observation,
  Relation,
  GraphStats,
  GraphSnapshot,
  GraphSnapshotMeta,
  GraphOperationResult,
  EntityInput,
  ObservationInput,
  RelationInput,
  ObservationId,
  RelationId,
} from '../../types/graph.js';
import { LogManager } from '../../utils/LogManager.js';

const logger = LogManager.getInstance();

export class PostgresGraphStore {
  private readonly db: DatabaseManager;
  private readonly projectId: string;
  private readonly userId: string;
  private readonly storeId: string;

  constructor(
    db: DatabaseManager,
    projectId: string,
    userId: string,
    storeId: string = 'default',
  ) {
    this.db = db;
    this.projectId = projectId;
    this.userId = userId;
    this.storeId = storeId;
  }

  // ===========================================================================
  // Initialization (tables already exist from migrations)
  // ===========================================================================

  async initialize(): Promise<GraphOperationResult<void>> {
    try {
      // Verify we can query the tables
      await this.db.queryWithContext(
        this.userId,
        this.projectId,
        'SELECT 1 FROM graph_entities WHERE project_id = $1 LIMIT 0',
        [this.projectId],
      );
      return { success: true, data: undefined };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, code: 'IO_ERROR' };
    }
  }

  // ===========================================================================
  // Entity CRUD
  // ===========================================================================

  async addEntities(inputs: EntityInput[]): Promise<GraphOperationResult<Entity[]>> {
    try {
      const entities: Entity[] = [];
      for (const input of inputs) {
        const result = await this.db.queryWithContext<{
          id: string; name: string; entity_type: string;
          attrs: Record<string, unknown>; created_at: string; updated_at: string;
        }>(
          this.userId,
          this.projectId,
          `INSERT INTO graph_entities (project_id, name, entity_type, attrs)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (project_id, name)
           DO UPDATE SET entity_type = EXCLUDED.entity_type,
                         attrs = graph_entities.attrs || EXCLUDED.attrs
           RETURNING id, name, entity_type, attrs, created_at::text, updated_at::text`,
          [this.projectId, input.name, input.entityType, JSON.stringify(input.attrs ?? {})],
        );
        const row = result.rows[0];
        if (row) {
          entities.push({
            id: row.id as EntityId,
            name: row.name,
            entityType: row.entity_type,
            attrs: row.attrs,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          });
        }
      }
      return { success: true, data: entities };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, code: 'IO_ERROR' };
    }
  }

  async getEntity(nameOrId: string): Promise<GraphOperationResult<Entity | null>> {
    try {
      const result = await this.db.queryWithContext<{
        id: string; name: string; entity_type: string;
        attrs: Record<string, unknown>; created_at: string; updated_at: string;
      }>(
        this.userId,
        this.projectId,
        `SELECT id, name, entity_type, attrs, created_at::text, updated_at::text
         FROM graph_entities
         WHERE project_id = $1 AND (name = $2 OR id::text = $2)`,
        [this.projectId, nameOrId],
      );
      const row = result.rows[0];
      if (!row) return { success: true, data: null };

      return {
        success: true,
        data: {
          id: row.id as EntityId,
          name: row.name,
          entityType: row.entity_type,
          attrs: row.attrs,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, code: 'IO_ERROR' };
    }
  }

  async deleteEntities(names: string[]): Promise<GraphOperationResult<string[]>> {
    try {
      const deleted: string[] = [];
      for (const name of names) {
        const result = await this.db.queryWithContext(
          this.userId,
          this.projectId,
          `DELETE FROM graph_entities WHERE project_id = $1 AND name = $2 RETURNING name`,
          [this.projectId, name],
        );
        if ((result.rowCount ?? 0) > 0) deleted.push(name);
      }
      return { success: true, data: deleted };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, code: 'IO_ERROR' };
    }
  }

  // ===========================================================================
  // Observation CRUD
  // ===========================================================================

  async addObservations(inputs: ObservationInput[]): Promise<GraphOperationResult<Observation[]>> {
    try {
      const observations: Observation[] = [];
      for (const input of inputs) {
        // Find entity by name or id (entityRef)
        const entityResult = await this.db.queryWithContext<{ id: string }>(
          this.userId,
          this.projectId,
          'SELECT id FROM graph_entities WHERE project_id = $1 AND (name = $2 OR id::text = $2)',
          [this.projectId, input.entityRef],
        );
        if (!entityResult.rows[0]) {
          return { success: false, error: `Entity not found: ${input.entityRef}`, code: 'ENTITY_NOT_FOUND' };
        }
        const entityId = entityResult.rows[0].id;

        const result = await this.db.queryWithContext<{
          id: string; entity_id: string; content: string; source: unknown; created_at: string;
        }>(
          this.userId,
          this.projectId,
          `INSERT INTO graph_observations (entity_id, project_id, content, source)
           VALUES ($1, $2, $3, $4)
           RETURNING id, entity_id, content, source, created_at::text`,
          [entityId, this.projectId, input.text, input.source ? JSON.stringify(input.source) : null],
        );
        const row = result.rows[0];
        if (row) {
          observations.push({
            id: row.id as ObservationId,
            entityId: row.entity_id as EntityId,
            text: row.content,
            source: row.source as any,
            timestamp: row.created_at,
          });
        }
      }
      return { success: true, data: observations };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, code: 'IO_ERROR' };
    }
  }

  async deleteObservations(
    entityRef: string,
    observations: string[],
  ): Promise<GraphOperationResult<string[]>> {
    try {
      const entityResult = await this.db.queryWithContext<{ id: string }>(
        this.userId,
        this.projectId,
        'SELECT id FROM graph_entities WHERE project_id = $1 AND (name = $2 OR id::text = $2)',
        [this.projectId, entityRef],
      );
      if (!entityResult.rows[0]) {
        return { success: false, error: `Entity not found: ${entityRef}`, code: 'ENTITY_NOT_FOUND' };
      }
      const entityId = entityResult.rows[0].id;

      const deleted: string[] = [];
      for (const text of observations) {
        const result = await this.db.queryWithContext(
          this.userId,
          this.projectId,
          `DELETE FROM graph_observations
           WHERE entity_id = $1 AND project_id = $2 AND content = $3
           RETURNING content`,
          [entityId, this.projectId, text],
        );
        if ((result.rowCount ?? 0) > 0) deleted.push(text);
      }
      return { success: true, data: deleted };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, code: 'IO_ERROR' };
    }
  }

  // ===========================================================================
  // Relation CRUD
  // ===========================================================================

  async addRelations(inputs: RelationInput[]): Promise<GraphOperationResult<Relation[]>> {
    try {
      const relations: Relation[] = [];
      for (const input of inputs) {
        // Resolve entity IDs by name
        const fromResult = await this.db.queryWithContext<{ id: string }>(
          this.userId,
          this.projectId,
          'SELECT id FROM graph_entities WHERE project_id = $1 AND name = $2',
          [this.projectId, input.from],
        );
        const toResult = await this.db.queryWithContext<{ id: string }>(
          this.userId,
          this.projectId,
          'SELECT id FROM graph_entities WHERE project_id = $1 AND name = $2',
          [this.projectId, input.to],
        );
        if (!fromResult.rows[0]) {
          return { success: false, error: `Entity not found: ${input.from}`, code: 'ENTITY_NOT_FOUND' };
        }
        if (!toResult.rows[0]) {
          return { success: false, error: `Entity not found: ${input.to}`, code: 'ENTITY_NOT_FOUND' };
        }

        const result = await this.db.queryWithContext<{
          id: string; from_entity_id: string; to_entity_id: string;
          relation_type: string; created_at: string;
        }>(
          this.userId,
          this.projectId,
          `INSERT INTO graph_relations (project_id, from_entity_id, to_entity_id, relation_type)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (project_id, from_entity_id, to_entity_id, relation_type) DO NOTHING
           RETURNING id, from_entity_id, to_entity_id, relation_type, created_at::text`,
          [this.projectId, fromResult.rows[0].id, toResult.rows[0].id, input.relationType],
        );
        const row = result.rows[0];
        if (row) {
          relations.push({
            id: row.id as RelationId,
            fromId: row.from_entity_id as EntityId,
            toId: row.to_entity_id as EntityId,
            relationType: row.relation_type,
            createdAt: row.created_at,
          });
        }
      }
      return { success: true, data: relations };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, code: 'IO_ERROR' };
    }
  }

  async deleteRelations(
    from: string,
    to: string,
    relationType: string,
  ): Promise<GraphOperationResult<number>> {
    try {
      const fromResult = await this.db.queryWithContext<{ id: string }>(
        this.userId,
        this.projectId,
        'SELECT id FROM graph_entities WHERE project_id = $1 AND name = $2',
        [this.projectId, from],
      );
      const toResult = await this.db.queryWithContext<{ id: string }>(
        this.userId,
        this.projectId,
        'SELECT id FROM graph_entities WHERE project_id = $1 AND name = $2',
        [this.projectId, to],
      );
      if (!fromResult.rows[0] || !toResult.rows[0]) {
        return { success: true, data: 0 };
      }

      const result = await this.db.queryWithContext(
        this.userId,
        this.projectId,
        `DELETE FROM graph_relations
         WHERE project_id = $1 AND from_entity_id = $2 AND to_entity_id = $3 AND relation_type = $4`,
        [this.projectId, fromResult.rows[0].id, toResult.rows[0].id, relationType],
      );
      return { success: true, data: result.rowCount ?? 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, code: 'IO_ERROR' };
    }
  }

  // ===========================================================================
  // Search (uses FTS)
  // ===========================================================================

  async searchEntities(query: string): Promise<GraphOperationResult<Entity[]>> {
    try {
      const result = await this.db.queryWithContext<{
        id: string; name: string; entity_type: string;
        attrs: Record<string, unknown>; created_at: string; updated_at: string;
      }>(
        this.userId,
        this.projectId,
        `SELECT id, name, entity_type, attrs, created_at::text, updated_at::text
         FROM graph_entities
         WHERE project_id = $1
           AND to_tsvector('simple', name || ' ' || entity_type) @@ websearch_to_tsquery('simple', $2)
         ORDER BY name
         LIMIT 50`,
        [this.projectId, query],
      );

      const entities = result.rows.map((row) => ({
        id: row.id as EntityId,
        name: row.name,
        entityType: row.entity_type,
        attrs: row.attrs,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
      return { success: true, data: entities };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, code: 'IO_ERROR' };
    }
  }

  async searchObservations(query: string): Promise<GraphOperationResult<Observation[]>> {
    try {
      const result = await this.db.queryWithContext<{
        id: string; entity_id: string; content: string;
        source: unknown; created_at: string;
      }>(
        this.userId,
        this.projectId,
        `SELECT o.id, o.entity_id, o.content, o.source, o.created_at::text
         FROM graph_observations o
         WHERE o.project_id = $1
           AND o.fts_vector @@ websearch_to_tsquery('english', $2)
         ORDER BY ts_rank(o.fts_vector, websearch_to_tsquery('english', $2)) DESC
         LIMIT 50`,
        [this.projectId, query],
      );

      const observations = result.rows.map((row) => ({
        id: row.id as ObservationId,
        entityId: row.entity_id as EntityId,
        text: row.content,
        source: row.source as any,
        timestamp: row.created_at,
      }));
      return { success: true, data: observations };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, code: 'IO_ERROR' };
    }
  }

  // ===========================================================================
  // Stats + snapshot
  // ===========================================================================

  async getStats(): Promise<GraphOperationResult<GraphStats>> {
    try {
      const entities = await this.db.queryWithContext<{ count: string }>(
        this.userId, this.projectId,
        'SELECT count(*) FROM graph_entities WHERE project_id = $1',
        [this.projectId],
      );
      const observations = await this.db.queryWithContext<{ count: string }>(
        this.userId, this.projectId,
        'SELECT count(*) FROM graph_observations WHERE project_id = $1',
        [this.projectId],
      );
      const relations = await this.db.queryWithContext<{ count: string }>(
        this.userId, this.projectId,
        'SELECT count(*) FROM graph_relations WHERE project_id = $1',
        [this.projectId],
      );

      return {
        success: true,
        data: {
          entityCount: parseInt(entities.rows[0]?.count ?? '0', 10),
          observationCount: parseInt(observations.rows[0]?.count ?? '0', 10),
          relationCount: parseInt(relations.rows[0]?.count ?? '0', 10),
          entityTypes: [],
          relationTypes: [],
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, code: 'IO_ERROR' };
    }
  }

  async getSnapshot(): Promise<GraphOperationResult<GraphSnapshot>> {
    try {
      // Fetch all entities
      const entResult = await this.db.queryWithContext<{
        id: string; name: string; entity_type: string;
        attrs: Record<string, unknown>; created_at: string; updated_at: string;
      }>(
        this.userId, this.projectId,
        `SELECT id, name, entity_type, attrs, created_at::text, updated_at::text
         FROM graph_entities WHERE project_id = $1 ORDER BY name`,
        [this.projectId],
      );

      // Fetch all observations
      const obsResult = await this.db.queryWithContext<{
        id: string; entity_id: string; content: string;
        source: unknown; created_at: string;
      }>(
        this.userId, this.projectId,
        `SELECT id, entity_id, content, source, created_at::text
         FROM graph_observations WHERE project_id = $1`,
        [this.projectId],
      );

      // Fetch all relations
      const relResult = await this.db.queryWithContext<{
        id: string; from_entity_id: string; to_entity_id: string;
        relation_type: string; created_at: string;
      }>(
        this.userId, this.projectId,
        `SELECT id, from_entity_id, to_entity_id, relation_type, created_at::text
         FROM graph_relations WHERE project_id = $1`,
        [this.projectId],
      );

      const meta: GraphSnapshotMeta = {
        type: 'memory_bank_graph',
        version: '1',
        storeId: this.storeId,
        createdAt: new Date().toISOString(),
        source: 'memory-bank-mcp',
      };

      const entities: Entity[] = entResult.rows.map((r) => ({
        id: r.id as EntityId,
        name: r.name,
        entityType: r.entity_type,
        attrs: r.attrs,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));

      const observations: Observation[] = obsResult.rows.map((r) => ({
        id: r.id as ObservationId,
        entityId: r.entity_id as EntityId,
        text: r.content,
        source: r.source as any,
        timestamp: r.created_at,
      }));

      const relations: Relation[] = relResult.rows.map((r) => ({
        id: r.id as RelationId,
        fromId: r.from_entity_id as EntityId,
        toId: r.to_entity_id as EntityId,
        relationType: r.relation_type,
        createdAt: r.created_at,
      }));

      return {
        success: true,
        data: { meta, entities, observations, relations },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, code: 'IO_ERROR' };
    }
  }

  /** List all entities (no search filter) */
  async listEntities(): Promise<GraphOperationResult<Entity[]>> {
    try {
      const result = await this.db.queryWithContext<{
        id: string; name: string; entity_type: string;
        attrs: Record<string, unknown>; created_at: string; updated_at: string;
      }>(
        this.userId, this.projectId,
        `SELECT id, name, entity_type, attrs, created_at::text, updated_at::text
         FROM graph_entities WHERE project_id = $1 ORDER BY name`,
        [this.projectId],
      );
      return {
        success: true,
        data: result.rows.map((r) => ({
          id: r.id as EntityId,
          name: r.name,
          entityType: r.entity_type,
          attrs: r.attrs,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, code: 'IO_ERROR' };
    }
  }
}
