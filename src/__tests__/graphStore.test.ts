/**
 * Tests for Knowledge Graph functionality
 *
 * Tests the GraphStore, GraphReducer, GraphSearch, and GraphRenderer modules.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { GraphStore } from '../core/graph/GraphStore.js';
import { LocalFileSystem } from '../utils/storage/LocalFileSystem.js';
import { reduceEventsToSnapshot, reduceJsonlToSnapshot, calculateStats } from '../core/graph/GraphReducer.js';
import { searchGraph, findEntity, expandNeighborhood, getEntityObservations } from '../core/graph/GraphSearch.js';
import { renderGraphToMarkdown, renderSearchResults } from '../core/graph/GraphRenderer.js';
import { createEntityId, createObservationId, createRelationId, normalizeName } from '../core/graph/GraphIds.js';
import { isEntity, isObservation, isRelation, isMarkerEvent, validateEntityInput, validateObservationInput, validateRelationInput } from '../core/graph/GraphSchemas.js';
import type { Entity, EntityId, GraphEvent, GraphSnapshot, MarkerEvent, EntityInput, ObservationInput, RelationInput } from '../types/graph.js';
import { MARKER_EVENT, GRAPH_PATHS } from '../types/graph.js';

const TEST_DIR = path.join(process.cwd(), 'src/__tests__/temp-graph-test-dir');
const STORE_ROOT = '';  // LocalFileSystem already uses TEST_DIR as base
const GRAPH_DIR = path.join(TEST_DIR, 'graph');

describe('Knowledge Graph Tests', () => {
  beforeEach(async () => {
    // Clean up and create test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(GRAPH_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  // ============================================================================
  // GraphIds Tests
  // ============================================================================

  describe('GraphIds', () => {
    test('normalizeName should lowercase and trim', () => {
      expect(normalizeName('  Hello World  ')).toBe('hello world');
      expect(normalizeName('TEST')).toBe('test');
    });

    test('createEntityId should generate deterministic IDs', () => {
      const id1 = createEntityId('test entity', 'person');
      const id2 = createEntityId('test entity', 'person');
      expect(id1).toBe(id2);
      expect(id1.startsWith('ent_')).toBe(true);
    });

    test('createEntityId should differ for different types', () => {
      const id1 = createEntityId('test entity', 'person');
      const id2 = createEntityId('test entity', 'project');
      expect(id1).not.toBe(id2);
    });

    test('createObservationId should generate unique IDs', () => {
      const id1 = createObservationId('ent_123' as EntityId, 'observation text');
      const id2 = createObservationId('ent_123' as EntityId, 'different text');
      expect(id1).not.toBe(id2);
      expect(id1.startsWith('obs_')).toBe(true);
    });

    test('createRelationId should be deterministic', () => {
      const id1 = createRelationId('ent_1' as EntityId, 'ent_2' as EntityId, 'knows');
      const id2 = createRelationId('ent_1' as EntityId, 'ent_2' as EntityId, 'knows');
      expect(id1).toBe(id2);
      expect(id1.startsWith('rel_')).toBe(true);
    });
  });

  // ============================================================================
  // GraphSchemas Tests
  // ============================================================================

  describe('GraphSchemas', () => {
    test('isEntity should validate entity objects', () => {
      const validEntity: Entity = {
        id: 'ent_123' as EntityId,
        name: 'Test Entity',
        entityType: 'person',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(isEntity(validEntity)).toBe(true);
      expect(isEntity({ name: 'incomplete' })).toBe(false);
      expect(isEntity(null)).toBe(false);
    });

    test('isMarkerEvent should validate marker events', () => {
      expect(isMarkerEvent(MARKER_EVENT)).toBe(true);
      expect(isMarkerEvent({ type: 'other' })).toBe(false);
      expect(isMarkerEvent({ type: 'memory_bank_graph', version: '2' })).toBe(false);
    });

    test('validateEntityInput should check required fields', () => {
      const valid: EntityInput = { name: 'Test', entityType: 'person' };
      const invalid1 = { name: '', entityType: 'person' };
      const invalid2 = { name: 'Test', entityType: '' };

      expect(validateEntityInput(valid).valid).toBe(true);
      expect(validateEntityInput(invalid1).valid).toBe(false);
      expect(validateEntityInput(invalid2).valid).toBe(false);
    });

    test('validateObservationInput should check required fields', () => {
      const valid = { entityRef: 'ent_123', text: 'Some observation' };
      const invalid1 = { entityRef: '', text: 'Some observation' };
      const invalid2 = { entityRef: 'ent_123', text: '' };

      expect(validateObservationInput(valid).valid).toBe(true);
      expect(validateObservationInput(invalid1).valid).toBe(false);
      expect(validateObservationInput(invalid2).valid).toBe(false);
    });

    test('validateRelationInput should check required fields', () => {
      const valid = {
        from: 'ent_1',
        to: 'ent_2',
        relationType: 'knows',
      };
      const invalid1 = {
        from: '',
        to: 'ent_2',
        relationType: 'knows',
      };
      const invalid2 = {
        from: 'ent_1',
        to: 'ent_2',
        relationType: '',
      };

      expect(validateRelationInput(valid).valid).toBe(true);
      expect(validateRelationInput(invalid1).valid).toBe(false);
      expect(validateRelationInput(invalid2).valid).toBe(false);
    });
  });

  // ============================================================================
  // GraphReducer Tests
  // ============================================================================

  describe('GraphReducer', () => {
    test('reduceEventsToSnapshot should require marker as first event', () => {
      const events: GraphEvent[] = [{ type: 'entity_upsert', entity: {} as Entity }];
      const result = reduceEventsToSnapshot(events, 'test-store');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('marker');
      }
    });

    test('reduceEventsToSnapshot should build snapshot from events', () => {
      const entity: Entity = {
        id: 'ent_123' as EntityId,
        name: 'Test Entity',
        entityType: 'person',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const events: GraphEvent[] = [
        MARKER_EVENT,
        { type: 'entity_upsert', entity },
      ];

      const result = reduceEventsToSnapshot(events, 'test-store');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.snapshot.entities).toHaveLength(1);
        expect(result.snapshot.entities[0].name).toBe('Test Entity');
      }
    });

    test('reduceEventsToSnapshot should handle entity_delete', () => {
      const entity: Entity = {
        id: 'ent_123' as EntityId,
        name: 'Test Entity',
        entityType: 'person',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const events: GraphEvent[] = [
        MARKER_EVENT,
        { type: 'entity_upsert', entity },
        { type: 'entity_delete', entityId: 'ent_123' as EntityId },
      ];

      const result = reduceEventsToSnapshot(events, 'test-store');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.snapshot.entities).toHaveLength(0);
      }
    });

    test('reduceJsonlToSnapshot should parse JSONL content', () => {
      const events = [
        JSON.stringify(MARKER_EVENT),
        JSON.stringify({
          type: 'entity_upsert',
          entity: {
            id: 'ent_123',
            name: 'Test',
            entityType: 'person',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          ts: new Date().toISOString(),
        }),
      ];

      const jsonl = events.join('\n');
      const result = reduceJsonlToSnapshot(jsonl, 'test-store');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.snapshot.entities).toHaveLength(1);
      }
    });

    test('calculateStats should compute graph statistics', () => {
      const snapshot: GraphSnapshot = {
        meta: {
          type: 'memory_bank_graph',
          version: '1',
          storeId: 'test',
          createdAt: new Date().toISOString(),
          source: 'memory-bank-mcp',
        },
        entities: [
          { id: 'ent_1' as EntityId, name: 'A', entityType: 'person', createdAt: '', updatedAt: '' },
          { id: 'ent_2' as EntityId, name: 'B', entityType: 'project', createdAt: '', updatedAt: '' },
        ],
        observations: [
          { id: 'obs_1' as any, entityId: 'ent_1' as EntityId, text: 'test', timestamp: '' },
        ],
        relations: [
          { id: 'rel_1' as any, fromId: 'ent_1' as EntityId, toId: 'ent_2' as EntityId, relationType: 'works_on', createdAt: '' },
        ],
      };

      const stats = calculateStats(snapshot);
      expect(stats.entityCount).toBe(2);
      expect(stats.observationCount).toBe(1);
      expect(stats.relationCount).toBe(1);
      expect(stats.entityTypes).toContain('person');
      expect(stats.entityTypes).toContain('project');
      expect(stats.relationTypes).toContain('works_on');
    });
  });

  // ============================================================================
  // GraphSearch Tests
  // ============================================================================

  describe('GraphSearch', () => {
    const testSnapshot: GraphSnapshot = {
      meta: {
        type: 'memory_bank_graph',
        version: '1',
        storeId: 'test',
        createdAt: new Date().toISOString(),
        source: 'memory-bank-mcp',
      },
      entities: [
        { id: 'ent_1' as EntityId, name: 'Alice Johnson', entityType: 'person', createdAt: '', updatedAt: '' },
        { id: 'ent_2' as EntityId, name: 'Project Alpha', entityType: 'project', createdAt: '', updatedAt: '' },
        { id: 'ent_3' as EntityId, name: 'Bob Smith', entityType: 'person', createdAt: '', updatedAt: '' },
      ],
      observations: [
        { id: 'obs_1' as any, entityId: 'ent_1' as EntityId, text: 'Alice is a software engineer', timestamp: '' },
        { id: 'obs_2' as any, entityId: 'ent_2' as EntityId, text: 'Alpha is a web application project', timestamp: '' },
      ],
      relations: [
        { id: 'rel_1' as any, fromId: 'ent_1' as EntityId, toId: 'ent_2' as EntityId, relationType: 'works_on', createdAt: '' },
        { id: 'rel_2' as any, fromId: 'ent_3' as EntityId, toId: 'ent_2' as EntityId, relationType: 'works_on', createdAt: '' },
      ],
    };

    test('searchGraph should find entities by name', () => {
      const results = searchGraph(testSnapshot, { query: 'Alice', limit: 10 });
      expect(results.entities.length).toBeGreaterThan(0);
      expect(results.entities[0].name).toBe('Alice Johnson');
    });

    test('searchGraph should find observations by text', () => {
      const results = searchGraph(testSnapshot, { query: 'software engineer', limit: 10 });
      expect(results.observations.length).toBeGreaterThan(0);
      expect(results.observations[0].text).toContain('software engineer');
    });

    test('findEntity should find by name', () => {
      const entity = findEntity(testSnapshot, 'Alice Johnson');
      expect(entity).not.toBeNull();
      expect(entity?.id).toBe('ent_1');
    });

    test('findEntity should find by ID', () => {
      const entity = findEntity(testSnapshot, 'ent_2');
      expect(entity).not.toBeNull();
      expect(entity?.name).toBe('Project Alpha');
    });

    test('expandNeighborhood should return connected entities', () => {
      const neighborhood = expandNeighborhood(testSnapshot, ['ent_1' as EntityId], 1);
      expect(neighborhood.entities.length).toBe(2); // Alice + Project Alpha
      expect(neighborhood.relations.length).toBe(1);
    });

    test('expandNeighborhood with depth 2 should expand further', () => {
      const neighborhood = expandNeighborhood(testSnapshot, ['ent_1' as EntityId], 2);
      expect(neighborhood.entities.length).toBe(3); // Alice + Project Alpha + Bob
      expect(neighborhood.relations.length).toBe(2);
    });

    test('getEntityObservations should return observations for entity', () => {
      const observations = getEntityObservations(testSnapshot, 'ent_1' as EntityId);
      expect(observations.length).toBe(1);
      expect(observations[0].text).toContain('software engineer');
    });
  });

  // ============================================================================
  // GraphRenderer Tests
  // ============================================================================

  describe('GraphRenderer', () => {
    const testSnapshot: GraphSnapshot = {
      meta: {
        type: 'memory_bank_graph',
        version: '1',
        storeId: 'test',
        createdAt: new Date().toISOString(),
        source: 'memory-bank-mcp',
      },
      entities: [
        { id: 'ent_1' as EntityId, name: 'Test Entity', entityType: 'person', createdAt: '', updatedAt: '' },
      ],
      observations: [
        { id: 'obs_1' as any, entityId: 'ent_1' as EntityId, text: 'Test observation', timestamp: '' },
      ],
      relations: [],
    };

    test('renderGraphToMarkdown should produce valid Markdown', () => {
      const markdown = renderGraphToMarkdown(testSnapshot);
      expect(markdown).toContain('# Knowledge Graph');
      expect(markdown).toContain('Test Entity');
      expect(markdown).toContain('Test observation');
    });

    test('renderSearchResults should format search results', () => {
      const entityMap = new Map<EntityId, Entity>();
      for (const e of testSnapshot.entities) {
        entityMap.set(e.id, e);
      }
      const markdown = renderSearchResults(
        testSnapshot.entities,
        testSnapshot.observations,
        [],
        'test query',
        entityMap
      );
      expect(markdown).toContain('Search Results');
      expect(markdown).toContain('test query');
      expect(markdown).toContain('Test Entity');
    });
  });

  // ============================================================================
  // GraphStore Integration Tests
  // ============================================================================

  describe('GraphStore', () => {
    test('should initialize with marker event', async () => {
      const fs = new LocalFileSystem(TEST_DIR);
      const store = new GraphStore(fs, '', 'test-store');

      const result = await store.initialize();
      expect(result.success).toBe(true);

      // Check that graph directory and files exist
      expect(existsSync(GRAPH_DIR)).toBe(true);
      expect(existsSync(path.join(GRAPH_DIR, 'graph.jsonl'))).toBe(true);

      // Check that JSONL starts with marker
      const jsonlContent = readFileSync(path.join(GRAPH_DIR, 'graph.jsonl'), 'utf-8');
      const firstLine = jsonlContent.split('\n')[0];
      const marker = JSON.parse(firstLine);
      expect(marker.type).toBe('memory_bank_graph');
      expect(marker.version).toBe('1');
    });

    test('should upsert entity', async () => {
      const fs = new LocalFileSystem(TEST_DIR);
      const store = new GraphStore(fs, '', 'test-store');
      await store.initialize();

      const result = await store.upsertEntity({
        name: 'Test Person',
        entityType: 'person',
        attrs: { role: 'developer' },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Test Person');
        expect(result.data.entityType).toBe('person');
        expect(result.data.attrs?.role).toBe('developer');
      }
    });

    test('should add observation', async () => {
      const fs = new LocalFileSystem(TEST_DIR);
      const store = new GraphStore(fs, '', 'test-store');
      await store.initialize();

      // First create an entity
      const entityResult = await store.upsertEntity({
        name: 'Test Person',
        entityType: 'person',
      });
      expect(entityResult.success).toBe(true);
      if (!entityResult.success) return;

      // Add observation
      const obsResult = await store.addObservation({
        entityRef: entityResult.data.id,
        text: 'This person is a great developer',
      });

      expect(obsResult.success).toBe(true);
      if (obsResult.success) {
        expect(obsResult.data.text).toBe('This person is a great developer');
        expect(obsResult.data.entityId).toBe(entityResult.data.id);
      }
    });

    test('should link entities', async () => {
      const fs = new LocalFileSystem(TEST_DIR);
      const store = new GraphStore(fs, '', 'test-store');
      await store.initialize();

      // Create two entities
      const person = await store.upsertEntity({ name: 'Alice', entityType: 'person' });
      const project = await store.upsertEntity({ name: 'Project X', entityType: 'project' });

      expect(person.success).toBe(true);
      expect(project.success).toBe(true);
      if (!person.success || !project.success) return;

      // Link them
      const linkResult = await store.linkEntities({
        from: person.data.id,
        to: project.data.id,
        relationType: 'works_on',
      });

      expect(linkResult.success).toBe(true);
      if (linkResult.success) {
        expect(linkResult.data.fromId).toBe(person.data.id);
        expect(linkResult.data.toId).toBe(project.data.id);
        expect(linkResult.data.relationType).toBe('works_on');
      }
    });

    test('should unlink entities', async () => {
      const fs = new LocalFileSystem(TEST_DIR);
      const store = new GraphStore(fs, '', 'test-store');
      await store.initialize();

      // Create and link entities
      const person = await store.upsertEntity({ name: 'Alice', entityType: 'person' });
      const project = await store.upsertEntity({ name: 'Project X', entityType: 'project' });
      if (!person.success || !project.success) return;

      await store.linkEntities({
        from: person.data.id,
        to: project.data.id,
        relationType: 'works_on',
      });

      // Unlink
      const unlinkResult = await store.unlinkEntities(
        person.data.id,
        'works_on',
        project.data.id
      );

      expect(unlinkResult.success).toBe(true);
    });

    test('should get snapshot', async () => {
      const fs = new LocalFileSystem(TEST_DIR);
      const store = new GraphStore(fs, '', 'test-store');
      await store.initialize();

      // Create some data
      await store.upsertEntity({ name: 'Alice', entityType: 'person' });
      await store.upsertEntity({ name: 'Bob', entityType: 'person' });

      const snapshotResult = await store.getSnapshot();
      expect(snapshotResult.success).toBe(true);
      if (snapshotResult.success) {
        expect(snapshotResult.data.entities).toHaveLength(2);
        expect(snapshotResult.data.meta.type).toBe('memory_bank_graph');
      }
    });

    test('should rebuild snapshot', async () => {
      const fs = new LocalFileSystem(TEST_DIR);
      const store = new GraphStore(fs, '', 'test-store');
      await store.initialize();

      // Create some data
      await store.upsertEntity({ name: 'Test Entity', entityType: 'concept' });

      // Rebuild
      const rebuildResult = await store.rebuildSnapshot();
      expect(rebuildResult.success).toBe(true);
      if (rebuildResult.success) {
        expect(rebuildResult.data.entities).toHaveLength(1);
      }

      // Check snapshot file exists
      expect(existsSync(path.join(GRAPH_DIR, 'graph.snapshot.json'))).toBe(true);

      // Check markdown file exists
      expect(existsSync(path.join(GRAPH_DIR, 'graph.md'))).toBe(true);
    });

    test('should validate marker before operations', async () => {
      // Write invalid marker
      writeFileSync(
        path.join(GRAPH_DIR, 'graph.jsonl'),
        JSON.stringify({ type: 'invalid_marker' }) + '\n'
      );

      const fs = new LocalFileSystem(TEST_DIR);
      const store = new GraphStore(fs, '', 'test-store');
      const result = await store.initialize();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('marker');
      }
    });

    test('should update entity on second upsert', async () => {
      const fs = new LocalFileSystem(TEST_DIR);
      const store = new GraphStore(fs, '', 'test-store');
      await store.initialize();

      // Create entity
      const result1 = await store.upsertEntity({
        name: 'Alice',
        entityType: 'person',
        attrs: { role: 'developer' },
      });
      expect(result1.success).toBe(true);
      if (!result1.success) return;

      // Update entity
      const result2 = await store.upsertEntity({
        name: 'Alice',
        entityType: 'person',
        attrs: { role: 'senior developer', team: 'platform' },
      });
      expect(result2.success).toBe(true);
      if (!result2.success) return;

      // Should have same ID
      expect(result2.data.id).toBe(result1.data.id);
      expect(result2.data.attrs?.role).toBe('senior developer');
      expect(result2.data.attrs?.team).toBe('platform');

      // Should only have one entity
      const snapshot = await store.getSnapshot();
      expect(snapshot.success).toBe(true);
      if (snapshot.success) {
        expect(snapshot.data.entities).toHaveLength(1);
      }
    });
  });
});
