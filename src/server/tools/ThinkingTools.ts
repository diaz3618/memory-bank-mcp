/**
 * ThinkingTools - Sequential thinking tool for structured reasoning
 *
 * Provides a built-in sequential thinking tool that allows AI agents to
 * break complex problems into numbered steps with branching, revision,
 * and dynamic expansion. Raw thoughts are never returned or persisted;
 * only metadata is sent back. The finalize tool bridges thinking outcomes
 * into Memory Bank files.
 *
 * Reference: repos/sequentialthinking/ (vendored reference implementation)
 */

import { MemoryBankManager } from '../../core/MemoryBankManager.js';
import { LogManager } from '../../utils/LogManager.js';

const logger = LogManager.getInstance();

// ============================================================================
// Types
// ============================================================================

interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  sessionId?: string;
}

interface ThoughtMetadata {
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  branches: string[];
  thoughtHistoryLength: number;
  sessionId?: string;
}

interface SessionState {
  history: ThoughtData[];
  branches: Record<string, ThoughtData[]>;
}

// ============================================================================
// In-Memory State (process-global, keyed by sessionId)
// ============================================================================

const sessions = new Map<string, SessionState>();
const DEFAULT_SESSION = '__default__';

function getSession(sessionId?: string): SessionState {
  const key = sessionId || DEFAULT_SESSION;
  let session = sessions.get(key);
  if (!session) {
    session = { history: [], branches: {} };
    sessions.set(key, session);
  }
  return session;
}

function resetSession(sessionId?: string): void {
  const key = sessionId || DEFAULT_SESSION;
  sessions.delete(key);
}

function resetAllSessions(): void {
  sessions.clear();
}

// ============================================================================
// Logging
// ============================================================================

const disableThoughtLogging =
  (process.env.DISABLE_THOUGHT_LOGGING || '').toLowerCase() === 'true';

function logThoughtMeta(data: ThoughtData): void {
  if (disableThoughtLogging) return;

  let label = 'Thought';
  let context = '';
  if (data.isRevision) {
    label = 'Revision';
    context = ` (revising thought ${data.revisesThought})`;
  } else if (data.branchFromThought) {
    label = 'Branch';
    context = ` (from thought ${data.branchFromThought}, ID: ${data.branchId})`;
  }

  const sessionTag = data.sessionId ? ` [session:${data.sessionId}]` : '';
  // STDIO safety: only write to stderr, never stdout. ASCII-only, no chalk.
  logger.debug(
    'ThinkingTools',
    `${label} ${data.thoughtNumber}/${data.totalThoughts}${context}${sessionTag}`
  );
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const thinkingTools = [
  {
    name: 'sequential_thinking',
    description:
      'Record a numbered thinking step for structured reasoning. ' +
      'Use this to break complex problems into sequential steps with optional branching and revision. ' +
      'The raw thought text is NOT returned — only metadata. ' +
      'Call finalize_thinking_session when done to persist outcomes to Memory Bank.',
    inputSchema: {
      type: 'object',
      properties: {
        thought: {
          type: 'string',
          description: 'The thinking step content (will NOT be returned in the response)',
        },
        nextThoughtNeeded: {
          type: 'boolean',
          description: 'Whether another thinking step is needed after this one',
        },
        thoughtNumber: {
          type: 'integer',
          description: 'Current thought number (>= 1)',
          minimum: 1,
        },
        totalThoughts: {
          type: 'integer',
          description: 'Estimated total number of thoughts (>= 1, auto-adjusts upward)',
          minimum: 1,
        },
        isRevision: {
          type: 'boolean',
          description: 'Whether this thought revises a previous one',
        },
        revisesThought: {
          type: 'integer',
          description: 'The thought number being revised (when isRevision is true)',
          minimum: 1,
        },
        branchFromThought: {
          type: 'integer',
          description: 'The thought number to branch from',
          minimum: 1,
        },
        branchId: {
          type: 'string',
          description: 'Identifier for the branch',
        },
        needsMoreThoughts: {
          type: 'boolean',
          description: 'Explicit signal that the total should be increased',
        },
        sessionId: {
          type: 'string',
          description: 'Session identifier to isolate thinking state across tasks',
        },
      },
      required: ['thought', 'nextThoughtNeeded', 'thoughtNumber', 'totalThoughts'],
    },
  },
  {
    name: 'reset_sequential_thinking',
    description:
      'Clear the in-memory sequential thinking history. ' +
      'Provide a sessionId to reset only that session, or omit to reset all sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Optional session ID to reset. If omitted, resets ALL sessions.',
        },
      },
    },
  },
  {
    name: 'finalize_thinking_session',
    description:
      'Persist the outcome of a thinking session into Memory Bank files. ' +
      'Accepts only human-facing summary fields — raw thoughts are NEVER persisted. ' +
      'Writes to existing Memory Bank files (active-context.md, decision-log.md, progress.md) via existing mechanisms.',
    inputSchema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Human-facing summary of the thinking session outcome',
        },
        decision: {
          type: 'object',
          description: 'Optional decision to log',
          properties: {
            title: { type: 'string', description: 'Decision title' },
            context: { type: 'string', description: 'Decision context' },
            decision: { type: 'string', description: 'The decision made' },
            alternatives: {
              type: 'array',
              items: { type: 'string' },
              description: 'Alternatives considered',
            },
            consequences: {
              type: 'array',
              items: { type: 'string' },
              description: 'Consequences of the decision',
            },
          },
          required: ['title', 'context', 'decision'],
        },
        tasks: {
          type: 'object',
          description: 'Optional task updates (compatible with update_tasks)',
          properties: {
            add: { type: 'array', items: { type: 'string' }, description: 'Tasks to add' },
            remove: { type: 'array', items: { type: 'string' }, description: 'Tasks to remove' },
            replace: { type: 'array', items: { type: 'string' }, description: 'Replace entire task list' },
          },
        },
        nextSteps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional next steps to add to active context',
        },
        progressEntry: {
          type: 'object',
          description: 'Optional progress entry to record',
          properties: {
            type: {
              type: 'string',
              enum: ['feature', 'fix', 'refactor', 'docs', 'test', 'chore', 'other'],
              description: 'Progress entry type',
            },
            summary: { type: 'string', description: 'Progress summary' },
            details: { type: 'string', description: 'Optional detailed description' },
            files: { type: 'array', items: { type: 'string' }, description: 'Affected files' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
          },
          required: ['type', 'summary'],
        },
        sessionId: {
          type: 'string',
          description: 'Session ID (appended as a tag to session note)',
        },
      },
      required: ['summary'],
    },
  },
];

// ============================================================================
// Handlers
// ============================================================================

/**
 * Handle sequential_thinking tool call.
 * Stores thought in memory, returns metadata only (never the raw thought text).
 */
export function handleSequentialThinking(input: {
  thought: string;
  nextThoughtNeeded: boolean;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  sessionId?: string;
}): { content: Array<{ type: string; text: string }>; isError?: boolean } {
  try {
    const data: ThoughtData = {
      thought: input.thought,
      thoughtNumber: input.thoughtNumber,
      totalThoughts: input.totalThoughts,
      nextThoughtNeeded: input.nextThoughtNeeded,
      isRevision: input.isRevision,
      revisesThought: input.revisesThought,
      branchFromThought: input.branchFromThought,
      branchId: input.branchId,
      needsMoreThoughts: input.needsMoreThoughts,
      sessionId: input.sessionId,
    };

    // Auto-adjust totalThoughts upward if needed (like reference impl)
    if (data.thoughtNumber > data.totalThoughts) {
      data.totalThoughts = data.thoughtNumber;
    }

    const session = getSession(data.sessionId);
    session.history.push(data);

    // Track branch
    if (data.branchFromThought && data.branchId) {
      if (!session.branches[data.branchId]) {
        session.branches[data.branchId] = [];
      }
      session.branches[data.branchId].push(data);
    }

    // Log metadata to stderr (NEVER the raw thought text)
    logThoughtMeta(data);

    // Return metadata ONLY — thought text is deliberately excluded
    const metadata: ThoughtMetadata = {
      thoughtNumber: data.thoughtNumber,
      totalThoughts: data.totalThoughts,
      nextThoughtNeeded: data.nextThoughtNeeded,
      branches: Object.keys(session.branches),
      thoughtHistoryLength: session.history.length,
    };
    if (data.sessionId) {
      metadata.sessionId = data.sessionId;
    }

    return {
      content: [
        { type: 'text', text: JSON.stringify(metadata, null, 2) },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed',
          }),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Handle reset_sequential_thinking tool call.
 * Clears in-memory state for a given sessionId or all sessions.
 */
export function handleResetSequentialThinking(sessionId?: string): {
  content: Array<{ type: string; text: string }>;
} {
  if (sessionId) {
    const had = sessions.has(sessionId) || sessions.has(sessionId);
    resetSession(sessionId);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            reset: true,
            sessionId,
            existed: had,
            message: `Session '${sessionId}' cleared.`,
          }),
        },
      ],
    };
  }

  const count = sessions.size;
  resetAllSessions();
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          reset: true,
          sessionsCleared: count,
          message: 'All sequential thinking sessions cleared.',
        }),
      },
    ],
  };
}

/**
 * Handle finalize_thinking_session tool call.
 * Persists sanitized outcomes into Memory Bank files — never raw thoughts.
 */
export async function handleFinalizeThinkingSession(
  memoryBankManager: MemoryBankManager,
  input: {
    summary: string;
    decision?: {
      title: string;
      context: string;
      decision: string;
      alternatives?: string[];
      consequences?: string[];
    };
    tasks?: { add?: string[]; remove?: string[]; replace?: string[] };
    nextSteps?: string[];
    progressEntry?: {
      type: 'feature' | 'fix' | 'refactor' | 'docs' | 'test' | 'chore' | 'other';
      summary: string;
      details?: string;
      files?: string[];
      tags?: string[];
    };
    sessionId?: string;
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

    const results: string[] = [];
    const now = new Date();

    // 1) Add session note with summary
    {
      let activeContext: string;
      try {
        activeContext = await memoryBankManager.readFile('active-context.md');
      } catch {
        activeContext = '# Active Context\n\n## Session Notes\n\n';
      }

      const timestamp = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      const sessionTag = input.sessionId ? ` [session:${input.sessionId}]` : '';
      const noteEntry = `- [${timestamp}] 🧠 ${input.summary}${sessionTag}\n`;

      const sessionNotesIndex = activeContext.indexOf('## Session Notes');
      if (sessionNotesIndex !== -1) {
        const afterHeader = activeContext.indexOf('\n', sessionNotesIndex) + 1;
        activeContext =
          activeContext.slice(0, afterHeader) +
          '\n' +
          noteEntry +
          activeContext.slice(afterHeader);
      } else {
        activeContext += '\n## Session Notes\n\n' + noteEntry;
      }

      // 2) Update next steps if provided
      if (input.nextSteps && input.nextSteps.length > 0) {
        const nextStepsSection = input.nextSteps.map((s) => `- ${s}`).join('\n') + '\n';
        const nextStepsIndex = activeContext.indexOf('## Next Steps');
        if (nextStepsIndex !== -1) {
          const afterNsHeader = activeContext.indexOf('\n', nextStepsIndex) + 1;
          let nsEnd = activeContext.indexOf('\n##', afterNsHeader);
          if (nsEnd === -1) nsEnd = activeContext.length;
          // Append to existing next steps
          activeContext =
            activeContext.slice(0, nsEnd) +
            nextStepsSection +
            activeContext.slice(nsEnd);
        } else {
          activeContext += '\n## Next Steps\n\n' + nextStepsSection;
        }
        results.push(`Next steps updated (${input.nextSteps.length} items)`);
      }

      // 3) Update tasks if provided
      if (input.tasks) {
        const { add, remove, replace } = input.tasks;
        const tasksMatch = activeContext.match(/## (?:Current )?Tasks\s*\n((?:- .*\n)*)/);
        let currentTasks: string[] = [];

        if (tasksMatch) {
          currentTasks = tasksMatch[1]
            .split('\n')
            .filter((line) => line.startsWith('- '))
            .map((line) => line.slice(2).trim());
        }

        let updatedTasks: string[];
        if (replace !== undefined) {
          updatedTasks = replace;
        } else {
          updatedTasks = [...currentTasks];
          if (remove && remove.length > 0) {
            updatedTasks = updatedTasks.filter(
              (task) => !remove.some((r) => task.toLowerCase().includes(r.toLowerCase()))
            );
          }
          if (add && add.length > 0) {
            for (const task of add) {
              if (!updatedTasks.some((t) => t.toLowerCase() === task.toLowerCase())) {
                updatedTasks.push(task);
              }
            }
          }
        }

        const tasksSection =
          updatedTasks.length > 0
            ? updatedTasks.map((t) => `- ${t}`).join('\n') + '\n'
            : '';

        const tasksHeaderMatch = activeContext.match(/## (?:Current )?Tasks\s*\n/);
        if (tasksHeaderMatch) {
          const headerEnd =
            activeContext.indexOf(tasksHeaderMatch[0]) + tasksHeaderMatch[0].length;
          let sectionEnd = headerEnd;
          const lines = activeContext.slice(headerEnd).split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('##')) break;
            sectionEnd += lines[i].length + 1;
          }
          activeContext =
            activeContext.slice(0, headerEnd) +
            tasksSection +
            activeContext.slice(sectionEnd);
        } else {
          activeContext += '\n## Current Tasks\n\n' + tasksSection;
        }

        results.push(`Tasks updated`);
      }

      await memoryBankManager.writeFile('active-context.md', activeContext);
      results.push('Session note added to active-context.md');
    }

    // 4) Log decision if provided
    if (input.decision) {
      let decisionLog: string;
      try {
        decisionLog = await memoryBankManager.readFile('decision-log.md');
      } catch {
        decisionLog = '# Decision Log\n\n';
      }

      // Count existing decisions to number the new one
      const existingDecisions = decisionLog.match(/^## \d+\./gm);
      const nextNum = (existingDecisions?.length ?? 0) + 1;
      const dateStr = now.toISOString().split('T')[0];

      let entry = `## ${nextNum}. ${input.decision.title}\n`;
      entry += `- **Date:** ${dateStr}\n`;
      entry += `- **Context:** ${input.decision.context}\n`;
      entry += `- **Decision:** ${input.decision.decision}\n`;

      if (input.decision.alternatives && input.decision.alternatives.length > 0) {
        entry += `- **Alternatives:**\n`;
        for (const alt of input.decision.alternatives) {
          entry += `  - ${alt}\n`;
        }
      }

      if (input.decision.consequences && input.decision.consequences.length > 0) {
        entry += `- **Consequences:**\n`;
        for (const cons of input.decision.consequences) {
          entry += `  - ${cons}\n`;
        }
      }

      entry += '\n';
      decisionLog += entry;
      await memoryBankManager.writeFile('decision-log.md', decisionLog);
      results.push(`Decision logged: ${input.decision.title}`);
    }

    // 5) Add progress entry if provided
    if (input.progressEntry) {
      const pe = input.progressEntry;

      let progressContent: string;
      try {
        progressContent = await memoryBankManager.readFile('progress.md');
      } catch {
        progressContent = '# Progress\n\n## Update History\n\n';
      }

      const dateStr = now.toISOString().split('T')[0];
      const entryId = `p_${dateStr}_${now.getTime().toString(36)}`;
      const PROGRESS_TYPE_LABELS: Record<string, string> = {
        feature: '✨ Feature',
        fix: '🐛 Fix',
        refactor: '♻️ Refactor',
        docs: '📝 Docs',
        test: '🧪 Test',
        chore: '🔧 Chore',
        other: '📦 Other',
      };
      const typeLabel = PROGRESS_TYPE_LABELS[pe.type] || pe.type;
      const timestamp = now.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      let entry = `### [${timestamp}] ${typeLabel}: ${pe.summary}\n`;
      entry += `<!-- ID: ${entryId} -->\n\n`;
      if (pe.details) entry += `${pe.details}\n\n`;
      if (pe.files && pe.files.length > 0) {
        entry += `**Affected files:**\n`;
        for (const f of pe.files) entry += `- \`${f}\`\n`;
        entry += '\n';
      }
      if (pe.tags && pe.tags.length > 0) {
        entry += `**Tags:** ${pe.tags.map((t) => `\`${t}\``).join(', ')}\n\n`;
      }
      entry += '---\n\n';

      const historyIndex = progressContent.indexOf('## Update History');
      if (historyIndex !== -1) {
        const insertPoint = progressContent.indexOf('\n', historyIndex) + 1;
        progressContent =
          progressContent.slice(0, insertPoint) +
          '\n' +
          entry +
          progressContent.slice(insertPoint);
      } else {
        progressContent += '\n## Update History\n\n' + entry;
      }

      await memoryBankManager.writeFile('progress.md', progressContent);
      results.push(`Progress entry added: ${pe.summary}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              actions: results,
              timestamp: now.toISOString(),
              sessionId: input.sessionId || null,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    logger.error('ThinkingTools', `Error in finalize_thinking_session: ${error}`);
    return {
      content: [
        {
          type: 'text',
          text: `Error finalizing thinking session: ${error}`,
        },
      ],
      isError: true,
    };
  }
}
