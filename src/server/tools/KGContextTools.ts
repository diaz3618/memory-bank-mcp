/**
 * KGContextTools - Knowledge-graph-driven targeted context retrieval
 *
 * Provides:
 * - `get_targeted_context`: Uses the KG as an index over Memory Bank files
 *   to return a budgeted, minimal "context pack" for a query.
 * - `graph_add_doc_pointer`: Convenience tool to link an entity to a
 *   Memory Bank file path + heading.
 *
 * Also exports deterministic excerpt utilities:
 * - readSectionByHeading
 * - excerptAroundMatches
 */

import { MemoryBankManager } from '../../core/MemoryBankManager.js';
import { GraphStore } from '../../core/graph/GraphStore.js';
import {
  searchGraphDetailed,
  expandNeighborhood,
  getEntityObservations,
  findEntity,
} from '../../core/graph/GraphSearch.js';
import type { EntityMatch } from '../../core/graph/GraphSearch.js';
import type { Entity, Observation, Relation, GraphSnapshot } from '../../types/graph.js';
import { StoreRegistry } from '../../core/StoreRegistry.js';
import { LocalFileSystem } from '../../utils/storage/LocalFileSystem.js';
import { LogManager } from '../../utils/LogManager.js';
import path from 'path';

const logger = LogManager.getInstance();

// ============================================================================
// Excerpt Utilities
// ============================================================================

/**
 * Find a section by heading in markdown and return its content.
 *
 * Match is case-insensitive substring against heading text (ignoring leading `#`).
 * Returns from the matched heading to the next heading of same or higher level.
 */
export function readSectionByHeading(
  markdown: string,
  headingHint: string,
  maxChars: number
): { excerpt: string; truncated: boolean } | null {
  const lines = markdown.split('\n');
  const hintLower = headingHint.toLowerCase().trim();

  let startIdx = -1;
  let startLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const headingMatch = lines[i].match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim().toLowerCase();
      if (text.includes(hintLower)) {
        startIdx = i;
        startLevel = level;
        break;
      }
    }
  }

  if (startIdx === -1) return null;

  // Collect lines until next heading of same or higher level
  const sectionLines: string[] = [lines[startIdx]];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const headingMatch = lines[i].match(/^(#{1,6})\s+/);
    if (headingMatch && headingMatch[1].length <= startLevel) {
      break;
    }
    sectionLines.push(lines[i]);
  }

  let excerpt = sectionLines.join('\n');
  let truncated = false;

  if (excerpt.length > maxChars) {
    excerpt = excerpt.slice(0, maxChars - 15) + '\n...(truncated)';
    truncated = true;
  }

  return { excerpt, truncated };
}

/**
 * Extract lines around query matches in markdown content.
 *
 * Returns a single excerpt per file with `windowLines` context above/below
 * each match. Prefers earliest/highest-density matches.
 */
export function excerptAroundMatches(
  markdown: string,
  query: string,
  windowLines: number = 3,
  maxChars: number = 2000
): { excerpt: string; truncated: boolean } | null {
  const lines = markdown.split('\n');
  const queryLower = query.toLowerCase();
  const matchIndices: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(queryLower)) {
      matchIndices.push(i);
    }
  }

  if (matchIndices.length === 0) return null;

  // Merge match windows
  const ranges: Array<[number, number]> = [];
  for (const idx of matchIndices) {
    const start = Math.max(0, idx - windowLines);
    const end = Math.min(lines.length - 1, idx + windowLines);

    if (ranges.length > 0 && start <= ranges[ranges.length - 1][1] + 1) {
      // Merge with previous range
      ranges[ranges.length - 1][1] = end;
    } else {
      ranges.push([start, end]);
    }
  }

  // Build excerpt from merged windows
  const parts: string[] = [];
  let totalChars = 0;
  let truncated = false;

  for (const [start, end] of ranges) {
    const chunk = lines.slice(start, end + 1).join('\n');
    if (totalChars + chunk.length > maxChars) {
      const remaining = maxChars - totalChars - 14; // room for truncation marker
      if (remaining > 20) {
        parts.push(chunk.slice(0, remaining) + '\n...(truncated)');
      }
      truncated = true;
      break;
    }
    if (parts.length > 0) {
      parts.push('...');
      totalChars += 3;
    }
    parts.push(chunk);
    totalChars += chunk.length;
  }

  if (parts.length === 0) return null;
  return { excerpt: parts.join('\n'), truncated };
}

// ============================================================================
// Shared: getGraphStore (duplicated from GraphTools to avoid circular deps)
// ============================================================================

let storeRegistryInstance: StoreRegistry | null = null;
function getStoreRegistry(): StoreRegistry {
  if (!storeRegistryInstance) {
    storeRegistryInstance = StoreRegistry.getInstance();
  }
  return storeRegistryInstance;
}

const storeCache = new Map<string, GraphStore>();

async function getGraphStore(
  memoryBankManager: MemoryBankManager,
  storeId?: string
): Promise<GraphStore | null> {
  let memoryBankDir: string | null = null;

  if (storeId) {
    const registry = getStoreRegistry();
    const projectPath = await registry.resolveStorePath(storeId);
    if (projectPath) {
      const folderName = memoryBankManager.getFolderName();
      memoryBankDir = path.join(projectPath, folderName);
      await registry.touchStore(storeId).catch(() => {});
    }
  }

  if (!memoryBankDir) {
    memoryBankDir = memoryBankManager.getMemoryBankDir();
  }

  if (!memoryBankDir) return null;

  const cached = storeCache.get(memoryBankDir);
  if (cached) return cached;

  const fs = new LocalFileSystem(memoryBankDir);
  const resolvedStoreId = storeId ?? path.basename(memoryBankDir);
  const store = new GraphStore(fs, '', resolvedStoreId);
  const initResult = await store.initialize();
  if (!initResult.success) {
    logger.error('KGContextTools', `Failed to initialize GraphStore: ${initResult.error}`);
    return null;
  }

  storeCache.set(memoryBankDir, store);
  return store;
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const kgContextTools = [
  {
    name: 'get_targeted_context',
    description:
      'Returns a budgeted, minimal "context pack" for a query by using the knowledge graph as an index. ' +
      'Reads only the smallest relevant slices of Memory Bank files instead of dumping full documents. ' +
      'Prefer this over get_context_bundle or batch_read_files for most questions.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find relevant context',
        },
        maxChars: {
          type: 'integer',
          description: 'Hard ceiling for entire payload in characters (default: 8000)',
          minimum: 500,
        },
        maxFiles: {
          type: 'integer',
          description: 'Maximum number of files to excerpt (default: 4)',
          minimum: 1,
          maximum: 10,
        },
        graphLimit: {
          type: 'integer',
          description: 'Maximum number of KG entity hits (default: 6)',
          minimum: 1,
          maximum: 20,
        },
        graphDepth: {
          type: 'integer',
          description: 'Neighborhood expansion depth (1 or 2, default: 1)',
          enum: [1, 2],
        },
        preferActiveContext: {
          type: 'boolean',
          description: 'Prioritize core Memory Bank files in pointer ranking (default: true)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'graph_add_doc_pointer',
    description:
      'Link a knowledge graph entity to a specific Memory Bank file (and optional heading). ' +
      'This helps get_targeted_context find the right file excerpts for a query. ' +
      'The file path is validated before saving.',
    inputSchema: {
      type: 'object',
      properties: {
        entityNameOrId: {
          type: 'string',
          description: 'Name or ID of the KG entity to link',
        },
        docPath: {
          type: 'string',
          description:
            'Memory Bank-relative file path (e.g., "decision-log.md", "docs/design.md")',
        },
        heading: {
          type: 'string',
          description: 'Optional heading within the file to point to',
        },
        note: {
          type: 'string',
          description: 'Optional note to include in the observation',
        },
      },
      required: ['entityNameOrId', 'docPath'],
    },
  },
];

// ============================================================================
// Internal: Compact Digest Builder
// ============================================================================

/**
 * Build a compact text digest from active-context, progress, and decisions.
 * Reuses the same files as handleGetContextDigest but returns plain text
 * capped at `maxChars`.
 */
async function buildCompactDigest(
  memoryBankManager: MemoryBankManager,
  maxChars: number
): Promise<string> {
  const parts: string[] = [];

  // Active context
  try {
    const ac = await memoryBankManager.readFile('active-context.md');
    const taskLines = extractListItems(ac, /## (?:Ongoing )?Tasks/);
    const issueLines = extractListItems(ac, /## (?:Known )?Issues/);
    const nextLines = extractListItems(ac, /## Next Steps/);

    if (taskLines.length > 0) parts.push('Tasks: ' + taskLines.join('; '));
    if (issueLines.length > 0) parts.push('Issues: ' + issueLines.join('; '));
    if (nextLines.length > 0) parts.push('Next: ' + nextLines.join('; '));
  } catch {
    // no active-context — skip
  }

  // Recent progress (max 5 entries)
  try {
    const prog = await memoryBankManager.readFile('progress.md');
    const entries = extractRecentProgressLines(prog, 5);
    if (entries.length > 0) parts.push('Recent progress:\n' + entries.join('\n'));
  } catch {
    // no progress — skip
  }

  // Recent decisions (max 3)
  try {
    const dlog = await memoryBankManager.readFile('decision-log.md');
    const decs = extractRecentDecisionOneLiner(dlog, 3);
    if (decs.length > 0) parts.push('Decisions:\n' + decs.join('\n'));
  } catch {
    // no decision-log — skip
  }

  let text = parts.join('\n\n');
  if (text.length > maxChars) {
    text = text.slice(0, maxChars - 14) + '\n...(truncated)';
  }
  return text;
}

function extractListItems(content: string, headingPattern: RegExp): string[] {
  const match = content.match(new RegExp(headingPattern.source + '\\s+([\\s\\S]*?)(?=##|$)'));
  if (!match) return [];
  return match[1]
    .split('\n')
    .filter((l) => l.trim().startsWith('-'))
    .map((l) => l.replace(/^-\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 8);
}

function extractRecentProgressLines(content: string, max: number): string[] {
  const entries: string[] = [];
  for (const line of content.split('\n')) {
    if (line.trim().startsWith('### [') || (line.trim().startsWith('- [') && /\d{4}/.test(line))) {
      entries.push(line.trim());
      if (entries.length >= max) break;
    }
  }
  return entries;
}

function extractRecentDecisionOneLiner(content: string, max: number): string[] {
  const results: string[] = [];
  const sections = content.split(/^## /m).filter((s) => s.trim());
  for (let i = 0; i < Math.min(sections.length, max); i++) {
    const lines = sections[i].split('\n');
    const title = lines[0]?.trim();
    if (!title || title === 'Decision Log') continue;
    const decLine = lines.find((l) => l.includes('**Decision:**'));
    const summary = decLine ? decLine.replace(/.*\*\*Decision:\*\*\s*/, '').trim() : '';
    results.push(`- ${title}: ${summary || '(see log)'}`);
  }
  return results;
}

// ============================================================================
// Internal: Doc Pointer Extraction
// ============================================================================

interface DocPointer {
  path: string;
  headingHint?: string;
  reason: string;
  entityId?: string;
  score: number;
}

const CORE_FILES = new Set([
  'active-context.md',
  'decision-log.md',
  'progress.md',
  'product-context.md',
  'system-patterns.md',
]);

/**
 * Extract doc pointers from entity matches.
 *
 * Sources (per plan):
 * 1) entity attrs: docPath/path, heading/section/anchor
 * 2) observation patterns: DOC: <path> [# <heading>]
 */
function extractPointers(
  entityMatches: EntityMatch[],
  snapshot: GraphSnapshot,
  preferActiveContext: boolean
): DocPointer[] {
  const pointers: DocPointer[] = [];
  const seen = new Set<string>(); // dedupe by path

  for (const em of entityMatches) {
    const { entity, score } = em;

    // 1) Entity attrs
    const docPath =
      (entity.attrs?.docPath as string | undefined) ||
      (entity.attrs?.path as string | undefined);
    if (docPath && !seen.has(docPath)) {
      const heading =
        (entity.attrs?.heading as string | undefined) ||
        (entity.attrs?.section as string | undefined) ||
        (entity.attrs?.anchor as string | undefined);
      pointers.push({
        path: docPath,
        headingHint: heading,
        reason: `Entity "${entity.name}" (${entity.entityType}) attrs.docPath`,
        entityId: entity.id,
        score,
      });
      seen.add(docPath);
    }

    // 2) Observation patterns
    const observations = getEntityObservations(snapshot, entity.id);
    for (const obs of observations) {
      const docMatch = obs.text.match(/^DOC:\s*(\S+?)(?:\s*#\s*(.+))?$/);
      if (docMatch) {
        const obsPath = docMatch[1];
        if (seen.has(obsPath)) continue;
        pointers.push({
          path: obsPath,
          headingHint: docMatch[2]?.trim(),
          reason: `Observation on "${entity.name}": DOC pointer`,
          entityId: entity.id,
          score,
        });
        seen.add(obsPath);
      }
    }
  }

  // Sort with deterministic comparator per plan section E
  pointers.sort((a, b) => {
    // 1) Higher entity score
    if (b.score !== a.score) return b.score - a.score;
    // 2) Has headingHint
    const aHasHint = a.headingHint ? 1 : 0;
    const bHasHint = b.headingHint ? 1 : 0;
    if (bHasHint !== aHasHint) return bHasHint - aHasHint;
    // 3) Prefer core files if preferActiveContext
    if (preferActiveContext) {
      const aCore = CORE_FILES.has(a.path) ? 1 : 0;
      const bCore = CORE_FILES.has(b.path) ? 1 : 0;
      if (bCore !== aCore) return bCore - aCore;
    }
    // 4) Lexicographic tie-breaker
    return a.path.localeCompare(b.path);
  });

  return pointers;
}

// ============================================================================
// Handlers
// ============================================================================

/**
 * Handle get_targeted_context tool call.
 */
export async function handleGetTargetedContext(
  memoryBankManager: MemoryBankManager,
  input: {
    query: string;
    maxChars?: number;
    maxFiles?: number;
    graphLimit?: number;
    graphDepth?: 1 | 2;
    preferActiveContext?: boolean;
  }
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const memoryBankDir = memoryBankManager.getMemoryBankDir();
    if (!memoryBankDir) {
      return {
        content: [
          {
            type: 'text',
            text: 'Memory Bank not initialized. Use set_memory_bank_path or initialize_memory_bank first.',
          },
        ],
        isError: true,
      };
    }

    const {
      query,
      maxChars = 8000,
      maxFiles = 4,
      graphLimit = 6,
      graphDepth = 1,
      preferActiveContext = true,
    } = input;

    let usedChars = 0;
    let truncated = false;

    // ---- 1) Digest (capped at ~1500 chars) ----
    const digestMaxChars = Math.min(1500, Math.floor(maxChars * 0.2));
    const digestText = await buildCompactDigest(memoryBankManager, digestMaxChars);
    usedChars += digestText.length;

    // ---- 2) Graph search ----
    const graphStore = await getGraphStore(memoryBankManager);
    let graphHits: Array<{
      id: string;
      name: string;
      entityType: string;
      score: number;
      matchedIn: Array<'name' | 'type' | 'attrs'>;
    }> = [];
    let opened: {
      entities: Array<{ id: string; name: string; entityType: string; attrs?: Record<string, unknown> }>;
      observations: Array<{ id: string; entityId: string; text: string; timestamp: string }>;
      relations: Array<{ fromId: string; toId: string; relationType: string }>;
    } = { entities: [], observations: [], relations: [] };
    let pointers: DocPointer[] = [];
    let snapshot: GraphSnapshot | null = null;

    if (graphStore) {
      const snapshotResult = await graphStore.getSnapshot();
      if (snapshotResult.success && snapshotResult.data) {
        snapshot = snapshotResult.data;

        // Detailed search
        const detailed = searchGraphDetailed(snapshot, {
          query,
          limit: graphLimit,
        });

        graphHits = detailed.entityMatches.map((em) => ({
          id: em.entity.id,
          name: em.entity.name,
          entityType: em.entity.entityType,
          score: em.score,
          matchedIn: em.matchedIn,
        }));

        // Neighborhood expansion
        if (detailed.entityMatches.length > 0) {
          const entityIds = detailed.entityMatches.map((em) => em.entity.id);
          const neighborhood = expandNeighborhood(snapshot, entityIds, graphDepth);

          opened = {
            entities: neighborhood.entities.map((e: Entity) => ({
              id: e.id,
              name: e.name,
              entityType: e.entityType,
              ...(e.attrs && Object.keys(e.attrs).length > 0 ? { attrs: e.attrs } : {}),
            })),
            observations: [] as Array<{ id: string; entityId: string; text: string; timestamp: string }>,
            relations: neighborhood.relations.map((r: Relation) => ({
              fromId: r.fromId,
              toId: r.toId,
              relationType: r.relationType,
            })),
          };

          // Get observations for matched entities only (keep bounded)
          for (const em of detailed.entityMatches) {
            const obs = getEntityObservations(snapshot, em.entity.id);
            for (const o of obs.slice(0, 5)) {
              opened.observations.push({
                id: o.id,
                entityId: o.entityId,
                text: o.text,
                timestamp: o.timestamp,
              });
            }
          }
        }

        // Extract doc pointers
        pointers = extractPointers(detailed.entityMatches, snapshot, preferActiveContext);
      }
    }

    // Measure graph payload size
    const graphPayload = JSON.stringify({ hits: graphHits, opened });
    usedChars += graphPayload.length;

    // ---- 3) Excerpts (within remaining budget) ----
    const excerpts: Array<{
      path: string;
      excerpt: string;
      chars: number;
      rationale: string;
    }> = [];

    // Select up to maxFiles unique valid pointers
    const validPointers: DocPointer[] = [];
    for (const ptr of pointers) {
      if (validPointers.length >= maxFiles) break;
      try {
        // Validate path via MemoryBankManager (enforces safety)
        await memoryBankManager.readFile(ptr.path);
        validPointers.push(ptr);
      } catch {
        // Path invalid or file not found — drop silently
        logger.debug('KGContextTools', `Dropped invalid pointer: ${ptr.path}`);
      }
    }

    for (const ptr of validPointers) {
      const remainingBudget = maxChars - usedChars;
      if (remainingBudget < 50) {
        truncated = true;
        break;
      }

      try {
        const fileContent = await memoryBankManager.readFile(ptr.path);
        let result: { excerpt: string; truncated: boolean } | null = null;

        // Try heading-based first, then query-match, then top-of-file
        if (ptr.headingHint) {
          result = readSectionByHeading(fileContent, ptr.headingHint, remainingBudget);
        }
        if (!result) {
          result = excerptAroundMatches(fileContent, query, 3, remainingBudget);
        }
        if (!result) {
          // Fallback: top 60 lines
          const topLines = fileContent.split('\n').slice(0, 60).join('\n');
          const sliced =
            topLines.length > remainingBudget
              ? topLines.slice(0, remainingBudget - 14) + '\n...(truncated)'
              : topLines;
          result = { excerpt: sliced, truncated: sliced.length < topLines.length };
        }

        if (result.truncated) truncated = true;

        excerpts.push({
          path: ptr.path,
          excerpt: result.excerpt,
          chars: result.excerpt.length,
          rationale: ptr.reason,
        });
        usedChars += result.excerpt.length;
      } catch (err) {
        logger.debug('KGContextTools', `Error reading ${ptr.path}: ${err}`);
      }
    }

    // ---- 4) Build response ----
    const response = {
      query,
      digest: { text: digestText, chars: digestText.length },
      graph: {
        hits: graphHits,
        opened,
      },
      pointers: validPointers.map((p) => ({
        path: p.path,
        ...(p.headingHint ? { headingHint: p.headingHint } : {}),
        reason: p.reason,
        ...(p.entityId ? { entityId: p.entityId } : {}),
      })),
      excerpts,
      budget: { maxChars, usedChars, truncated },
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
    };
  } catch (error) {
    logger.error('KGContextTools', `Error in get_targeted_context: ${error}`);
    return {
      content: [
        {
          type: 'text',
          text: `Error getting targeted context: ${error}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Handle graph_add_doc_pointer tool call.
 * Links a KG entity to a Memory Bank file path + optional heading.
 */
export async function handleGraphAddDocPointer(
  memoryBankManager: MemoryBankManager,
  input: {
    entityNameOrId: string;
    docPath: string;
    heading?: string;
    note?: string;
  }
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const { entityNameOrId, docPath, heading, note } = input;

    // Validate docPath by attempting read
    try {
      await memoryBankManager.readFile(docPath);
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid docPath "${docPath}": ${err instanceof Error ? err.message : String(err)}. ` +
              'Only Memory Bank files (root + docs/) with .md/.json extensions are allowed.',
          },
        ],
        isError: true,
      };
    }

    // Get graph store
    const graphStore = await getGraphStore(memoryBankManager);
    if (!graphStore) {
      return {
        content: [
          { type: 'text', text: 'Knowledge graph not available. Initialize Memory Bank first.' },
        ],
        isError: true,
      };
    }

    // Find the entity
    const snapshotResult = await graphStore.getSnapshot();
    if (!snapshotResult.success || !snapshotResult.data) {
      return {
        content: [{ type: 'text', text: 'Failed to read graph snapshot.' }],
        isError: true,
      };
    }

    const entity = findEntity(snapshotResult.data, entityNameOrId);
    if (!entity) {
      return {
        content: [
          {
            type: 'text',
            text: `Entity "${entityNameOrId}" not found. Create it first with graph_upsert_entity.`,
          },
        ],
        isError: true,
      };
    }

    const results: string[] = [];

    // Update entity attrs with docPath + heading
    const newAttrs: Record<string, unknown> = { ...(entity.attrs || {}) };
    newAttrs.docPath = docPath;
    if (heading) {
      newAttrs.heading = heading;
    }

    const upsertResult = await graphStore.upsertEntity({
      name: entity.name,
      entityType: entity.entityType,
      attrs: newAttrs,
    });
    if (upsertResult.success) {
      results.push(`Updated entity "${entity.name}" attrs with docPath="${docPath}"` +
        (heading ? `, heading="${heading}"` : ''));
    }

    // Add DOC observation
    let obsText = `DOC: ${docPath}`;
    if (heading) obsText += ` # ${heading}`;
    if (note) obsText += ` — ${note}`;

    const obsResult = await graphStore.addObservation({
      entityId: entity.id,
      text: obsText,
      source: 'graph_add_doc_pointer' as import('../../types/graph.js').ObservationSource,
    });
    if (obsResult.success) {
      results.push(`Added DOC observation to entity "${entity.name}"`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, entity: entity.name, actions: results }, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('KGContextTools', `Error in graph_add_doc_pointer: ${error}`);
    return {
      content: [
        { type: 'text', text: `Error adding doc pointer: ${error}` },
      ],
      isError: true,
    };
  }
}
