/**
 * GraphRenderer - Renders graph snapshot to Markdown
 *
 * Produces human-friendly Markdown representation of the knowledge graph.
 * Designed to be readable and useful for reviewing graph state.
 */

import type {
  Entity,
  EntityId,
  GraphSnapshot,
  GraphStats,
  Observation,
  Relation,
} from '../../types/graph.js';
import { calculateStats } from './GraphReducer.js';

// ============================================================================
// Configuration
// ============================================================================

interface RenderOptions {
  /** Maximum observations to show per entity in the summary */
  maxObservationsPerEntity?: number;
  /** Maximum recent observations in the activity section */
  maxRecentObservations?: number;
  /** Include stats section */
  includeStats?: boolean;
  /** Include recent activity section */
  includeRecentActivity?: boolean;
  /** Sort entities by type */
  sortByType?: boolean;
}

const DEFAULT_OPTIONS: Required<RenderOptions> = {
  maxObservationsPerEntity: 3,
  maxRecentObservations: 10,
  includeStats: true,
  includeRecentActivity: true,
  sortByType: true,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formats a date for display
 */
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formats a date for relative display
 */
function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins <= 1 ? 'just now' : `${diffMins} min ago`;
    }
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  return formatDate(isoString);
}

/**
 * Truncates text with ellipsis
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Groups entities by type
 */
function groupByType(entities: readonly Entity[]): Map<string, Entity[]> {
  const groups = new Map<string, Entity[]>();
  for (const entity of entities) {
    const type = entity.entityType;
    const group = groups.get(type) ?? [];
    group.push(entity);
    groups.set(type, group);
  }
  return groups;
}

/**
 * Gets the name of an entity by ID from a lookup map
 */
function getEntityName(
  entityId: EntityId,
  entityMap: Map<EntityId, Entity>
): string {
  const entity = entityMap.get(entityId);
  return entity ? entity.name : entityId;
}

// ============================================================================
// Section Renderers
// ============================================================================

/**
 * Renders the header section
 */
function renderHeader(snapshot: GraphSnapshot): string {
  const lines: string[] = [
    '# Knowledge Graph',
    '',
    `> Store: \`${snapshot.meta.storeId}\``,
    `> Generated: ${formatDate(snapshot.meta.createdAt)}`,
    `> Version: ${snapshot.meta.version}`,
    '',
  ];
  return lines.join('\n');
}

/**
 * Renders statistics section
 */
function renderStats(stats: GraphStats): string {
  const lines: string[] = [
    '## Statistics',
    '',
    '| Metric | Count |',
    '|--------|-------|',
    `| Entities | ${stats.entityCount} |`,
    `| Observations | ${stats.observationCount} |`,
    `| Relations | ${stats.relationCount} |`,
    '',
  ];

  if (stats.entityTypes.length > 0) {
    lines.push(`**Entity Types:** ${stats.entityTypes.join(', ')}`, '');
  }

  if (stats.relationTypes.length > 0) {
    lines.push(`**Relation Types:** ${stats.relationTypes.join(', ')}`, '');
  }

  return lines.join('\n');
}

/**
 * Renders the entities section
 */
function renderEntities(
  snapshot: GraphSnapshot,
  options: Required<RenderOptions>
): string {
  if (snapshot.entities.length === 0) {
    return '## Entities\n\n*No entities in graph.*\n';
  }

  const lines: string[] = [
    `## Entities (${snapshot.entities.length})`,
    '',
  ];

  // Build observation lookup
  const observationsByEntity = new Map<EntityId, Observation[]>();
  for (const obs of snapshot.observations) {
    const existing = observationsByEntity.get(obs.entityId) ?? [];
    existing.push(obs);
    observationsByEntity.set(obs.entityId, existing);
  }

  // Sort observations by timestamp (newest first)
  for (const [entityId, obs] of observationsByEntity) {
    obs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    observationsByEntity.set(entityId, obs);
  }

  // Build relation lookup
  const relationsFrom = new Map<EntityId, Relation[]>();
  const relationsTo = new Map<EntityId, Relation[]>();
  for (const rel of snapshot.relations) {
    const fromRels = relationsFrom.get(rel.fromId) ?? [];
    fromRels.push(rel);
    relationsFrom.set(rel.fromId, fromRels);

    const toRels = relationsTo.get(rel.toId) ?? [];
    toRels.push(rel);
    relationsTo.set(rel.toId, toRels);
  }

  // Entity ID to name map
  const entityMap = new Map<EntityId, Entity>();
  for (const entity of snapshot.entities) {
    entityMap.set(entity.id, entity);
  }

  // Group by type if option enabled
  if (options.sortByType) {
    const groups = groupByType(snapshot.entities);
    const sortedTypes = Array.from(groups.keys()).sort();

    for (const type of sortedTypes) {
      const entities = groups.get(type)!;
      lines.push(`### ${type} (${entities.length})`, '');

      for (const entity of entities.sort((a, b) => a.name.localeCompare(b.name))) {
        lines.push(...renderEntity(entity, observationsByEntity, relationsFrom, relationsTo, entityMap, options));
      }
    }
  } else {
    // Just sort alphabetically
    const sorted = [...snapshot.entities].sort((a, b) => a.name.localeCompare(b.name));
    for (const entity of sorted) {
      lines.push(...renderEntity(entity, observationsByEntity, relationsFrom, relationsTo, entityMap, options));
    }
  }

  return lines.join('\n');
}

/**
 * Renders a single entity
 */
function renderEntity(
  entity: Entity,
  observationsByEntity: Map<EntityId, Observation[]>,
  relationsFrom: Map<EntityId, Relation[]>,
  relationsTo: Map<EntityId, Relation[]>,
  entityMap: Map<EntityId, Entity>,
  options: Required<RenderOptions>
): string[] {
  const lines: string[] = [];

  // Entity header
  lines.push(`#### ${entity.name}`, '');
  lines.push(`- **Type:** ${entity.entityType}`);
  lines.push(`- **ID:** \`${entity.id}\``);
  lines.push(`- **Created:** ${formatRelativeDate(entity.createdAt)}`);

  // Attributes
  if (entity.attrs && Object.keys(entity.attrs).length > 0) {
    lines.push(`- **Attributes:**`);
    for (const [key, value] of Object.entries(entity.attrs)) {
      lines.push(`  - ${key}: ${JSON.stringify(value)}`);
    }
  }

  // Relations
  const outgoing = relationsFrom.get(entity.id) ?? [];
  const incoming = relationsTo.get(entity.id) ?? [];

  if (outgoing.length > 0) {
    lines.push('', '**Outgoing Relations:**');
    for (const rel of outgoing) {
      const targetName = getEntityName(rel.toId, entityMap);
      lines.push(`- → \`${rel.relationType}\` → **${targetName}**`);
    }
  }

  if (incoming.length > 0) {
    lines.push('', '**Incoming Relations:**');
    for (const rel of incoming) {
      const sourceName = getEntityName(rel.fromId, entityMap);
      lines.push(`- ← \`${rel.relationType}\` ← **${sourceName}**`);
    }
  }

  // Observations
  const observations = observationsByEntity.get(entity.id) ?? [];
  if (observations.length > 0) {
    const toShow = observations.slice(0, options.maxObservationsPerEntity);
    lines.push('', '**Recent Observations:**');
    for (const obs of toShow) {
      const text = truncate(obs.text, 100);
      lines.push(`- ${formatRelativeDate(obs.timestamp)}: ${text}`);
    }
    if (observations.length > options.maxObservationsPerEntity) {
      lines.push(`- *...and ${observations.length - options.maxObservationsPerEntity} more*`);
    }
  }

  lines.push('');
  return lines;
}

/**
 * Renders the relations section (as a graph view)
 */
function renderRelations(snapshot: GraphSnapshot): string {
  if (snapshot.relations.length === 0) {
    return '## Relations\n\n*No relations in graph.*\n';
  }

  const lines: string[] = [
    `## Relations (${snapshot.relations.length})`,
    '',
  ];

  // Entity ID to name map
  const entityMap = new Map<EntityId, Entity>();
  for (const entity of snapshot.entities) {
    entityMap.set(entity.id, entity);
  }

  // Group by relation type
  const byType = new Map<string, Relation[]>();
  for (const rel of snapshot.relations) {
    const existing = byType.get(rel.relationType) ?? [];
    existing.push(rel);
    byType.set(rel.relationType, existing);
  }

  const sortedTypes = Array.from(byType.keys()).sort();

  for (const type of sortedTypes) {
    const relations = byType.get(type)!;
    lines.push(`### ${type} (${relations.length})`, '');
    lines.push('```');
    for (const rel of relations) {
      const fromName = getEntityName(rel.fromId, entityMap);
      const toName = getEntityName(rel.toId, entityMap);
      lines.push(`${fromName} --${type}--> ${toName}`);
    }
    lines.push('```', '');
  }

  return lines.join('\n');
}

/**
 * Renders recent activity section
 */
function renderRecentActivity(
  snapshot: GraphSnapshot,
  options: Required<RenderOptions>
): string {
  const lines: string[] = [
    '## Recent Activity',
    '',
  ];

  // Get recent observations
  const recentObs = [...snapshot.observations]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, options.maxRecentObservations);

  if (recentObs.length === 0) {
    lines.push('*No recent activity.*', '');
    return lines.join('\n');
  }

  // Entity ID to name map
  const entityMap = new Map<EntityId, Entity>();
  for (const entity of snapshot.entities) {
    entityMap.set(entity.id, entity);
  }

  for (const obs of recentObs) {
    const entityName = getEntityName(obs.entityId, entityMap);
    const text = truncate(obs.text, 80);
    lines.push(`- **${formatRelativeDate(obs.timestamp)}** on _${entityName}_: ${text}`);
  }

  lines.push('');
  return lines.join('\n');
}

// ============================================================================
// Main Render Function
// ============================================================================

/**
 * Renders a graph snapshot to Markdown
 *
 * @param snapshot Graph snapshot to render
 * @param options Render options
 * @returns Markdown string
 */
export function renderGraphToMarkdown(
  snapshot: GraphSnapshot,
  options: RenderOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const stats = calculateStats(snapshot);

  const sections: string[] = [
    renderHeader(snapshot),
  ];

  if (opts.includeStats) {
    sections.push(renderStats(stats));
  }

  if (opts.includeRecentActivity) {
    sections.push(renderRecentActivity(snapshot, opts));
  }

  sections.push(renderEntities(snapshot, opts));
  sections.push(renderRelations(snapshot));

  return sections.join('\n');
}

/**
 * Renders a minimal graph summary (for context digest)
 */
export function renderGraphSummary(snapshot: GraphSnapshot): string {
  const stats = calculateStats(snapshot);
  const lines: string[] = [
    '### Knowledge Graph Summary',
    '',
    `- ${stats.entityCount} entities (${stats.entityTypes.slice(0, 5).join(', ')}${stats.entityTypes.length > 5 ? '...' : ''})`,
    `- ${stats.observationCount} observations`,
    `- ${stats.relationCount} relations (${stats.relationTypes.slice(0, 5).join(', ')}${stats.relationTypes.length > 5 ? '...' : ''})`,
    '',
  ];

  // Show top 5 entities by observation count
  const observationCounts = new Map<EntityId, number>();
  for (const obs of snapshot.observations) {
    observationCounts.set(obs.entityId, (observationCounts.get(obs.entityId) ?? 0) + 1);
  }

  const entityMap = new Map<EntityId, Entity>();
  for (const entity of snapshot.entities) {
    entityMap.set(entity.id, entity);
  }

  const topEntities = Array.from(observationCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (topEntities.length > 0) {
    lines.push('**Key Entities:**');
    for (const [entityId, count] of topEntities) {
      const entity = entityMap.get(entityId);
      if (entity) {
        lines.push(`- ${entity.name} [${entity.entityType}] (${count} obs)`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Renders search results to Markdown
 */
export function renderSearchResults(
  entities: readonly Entity[],
  observations: readonly Observation[],
  relations: readonly Relation[],
  query: string,
  entityMap: Map<EntityId, Entity>
): string {
  const lines: string[] = [
    `### Search Results for "${query}"`,
    '',
  ];

  if (entities.length === 0 && observations.length === 0) {
    lines.push('*No results found.*');
    return lines.join('\n');
  }

  if (entities.length > 0) {
    lines.push(`**Entities (${entities.length}):**`);
    for (const entity of entities) {
      lines.push(`- **${entity.name}** [${entity.entityType}]`);
    }
    lines.push('');
  }

  if (observations.length > 0) {
    lines.push(`**Observations (${observations.length}):**`);
    for (const obs of observations) {
      const entityName = getEntityName(obs.entityId, entityMap);
      lines.push(`- _${entityName}_: ${truncate(obs.text, 80)}`);
    }
    lines.push('');
  }

  if (relations.length > 0) {
    lines.push(`**Related Connections (${relations.length}):**`);
    for (const rel of relations) {
      const fromName = getEntityName(rel.fromId, entityMap);
      const toName = getEntityName(rel.toId, entityMap);
      lines.push(`- ${fromName} → ${rel.relationType} → ${toName}`);
    }
  }

  return lines.join('\n');
}
