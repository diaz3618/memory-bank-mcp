/**
 * Memory Bank Instructions Tool — Language Model Tool for Copilot.
 *
 * When referenced in a prompt (via `canBeReferencedInPrompt: true` in package.json),
 * this tool is automatically invoked and returns Memory Bank context + usage instructions.
 * This ensures the AI reads project context before, during, and after every task.
 */

import * as vscode from 'vscode';
import { ext } from '../extensionVariables';

const TOOL_NAME = 'memory-bank_get-instructions';

export function registerInstructionsTool(context: vscode.ExtensionContext): void {
  const tool = vscode.lm.registerTool(TOOL_NAME, new MemoryBankInstructionsTool());
  context.subscriptions.push(tool);
}

interface ToolInput {
  query?: string;
}

class MemoryBankInstructionsTool implements vscode.LanguageModelTool<ToolInput> {

  /**
   * Detect whether file content still contains default template placeholders.
   * These bracket-wrapped tokens (e.g. `[Project description]`) come from
   * CoreTemplates.ts and signal an uninitialized Memory Bank.
   */
  private static readonly PLACEHOLDER_RE =
    /\[(?:Project description|Objective \d|Task \d|Technology \d|Architecture description|Issue \d|Milestone \d|Date|Context|Decision|Alternatives|Consequences|Architecture patterns description|Code patterns description|Documentation patterns description|Next step \d|Note \d|Update)\]/;

  private hasPlaceholders(content: string): boolean {
    return MemoryBankInstructionsTool.PLACEHOLDER_RE.test(content);
  }

  async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<ToolInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const parts: string[] = [];

    parts.push('# Memory Bank MCP Server — Instructions\n');
    parts.push('You MUST use the Memory Bank MCP server before, during, and after every task. This is non-negotiable.\n');

    // ── Live status ────────────────────────────────────────────────
    let isConnected = false;
    let isFresh = false;

    try {
      const status = await ext.memoryBankService.getStatus();
      if (status) {
        isConnected = true;
        parts.push('## Current Status\n');
        parts.push(`- Path: ${status.path || 'Not set'}`);
        parts.push(`- Complete: ${status.isComplete ? 'Yes' : 'No'}`);
        parts.push(`- Files: ${status.files?.length ?? 'unknown'}\n`);

        const mode = await ext.memoryBankService.getCurrentMode();
        if (mode) {
          parts.push(`- Active Mode: ${mode}\n`);
        }

        // Read core files and detect placeholders
        let activeCtx: string | undefined;
        let progress: string | undefined;
        let productCtx: string | undefined;

        try { activeCtx = await ext.memoryBankService.readFile('active-context.md'); } catch { /* */ }
        try { progress = await ext.memoryBankService.readFile('progress.md'); } catch { /* */ }
        try { productCtx = await ext.memoryBankService.readFile('product-context.md'); } catch { /* */ }

        // Check whether any core file still has placeholder content
        isFresh = [activeCtx, progress, productCtx].some(
          (c) => c !== undefined && this.hasPlaceholders(c),
        );

        if (isFresh) {
          parts.push('## ⚠ FRESH MEMORY BANK DETECTED — Initialization Required\n');
          parts.push('The core files still contain default placeholder text.');
          parts.push('You MUST populate them with real project data **before doing anything else**.\n');
        }

        if (activeCtx) {
          parts.push('## Active Context\n');
          parts.push(activeCtx);
          parts.push('');
        }

        if (progress) {
          parts.push('## Progress\n');
          parts.push(progress);
          parts.push('');
        }
      } else {
        parts.push('## Status: Not Connected\n');
        parts.push('The Memory Bank server is not currently connected. Ask the user to connect via the Memory Bank sidebar.\n');
      }
    } catch {
      parts.push('## Status: Error reading Memory Bank\n');
      parts.push('Could not read Memory Bank status. The server may not be connected.\n');
    }

    // ── First-time initialization instructions ─────────────────────
    if (isConnected && isFresh) {
      parts.push('## First-Time Initialization Procedure\n');
      parts.push('Complete ALL of the following steps before proceeding with any other work:\n');
      parts.push('1. **Analyze the project** — Scan the workspace:');
      parts.push('   - Read `package.json`, `README.md`, config files, source directory structure');
      parts.push('   - Identify language, framework, purpose, dependencies, and patterns\n');
      parts.push('2. **Fill `product-context.md`** via `write_memory_bank_file`:');
      parts.push('   - Real project description, objectives, technologies, architecture, structure\n');
      parts.push('3. **Fill `active-context.md`** — Current tasks, known issues, next steps from codebase\n');
      parts.push('4. **Fill `progress.md`** — Observable milestones, today\'s date, pending work\n');
      parts.push('5. **Fill `decision-log.md`** — Visible tech decisions (language, build tool, patterns)\n');
      parts.push('6. **Fill `system-patterns.md`** — Architecture, code, documentation, and testing patterns\n');
      parts.push('7. **Populate knowledge graph** — `graph_upsert_entity`, `graph_add_observation`, `graph_link_entities` for major components\n');
      parts.push('8. **Confirm** — Call `add_session_note` with: "Memory Bank initialized with project data from workspace analysis."\n');
      parts.push('After initialization is complete, follow the Normal Workflow below.\n');
    }

    // ── Normal workflow ────────────────────────────────────────────
    parts.push('## Normal Workflow\n');
    parts.push('### Before Starting Any Task');
    parts.push('1. Call `get_context_bundle` or `get_context_digest` to load context');
    parts.push('2. Read `active-context.md` and `progress.md` to understand current state');
    parts.push('3. Review the knowledge graph with `graph_search` for relevant entities\n');
    parts.push('### During Work');
    parts.push('- `track_progress` — log milestones and progress');
    parts.push('- `log_decision` — record architectural / design decisions');
    parts.push('- `add_session_note` — observations, blockers, questions');
    parts.push('- `update_active_context` — keep tasks and issues current');
    parts.push('- Update knowledge graph entities and relationships as the project evolves\n');
    parts.push('### After Completing Work');
    parts.push('- Update `active-context.md` with what was done and next steps');
    parts.push('- Track final progress entry summarizing the session');
    parts.push('- Ensure all decisions are logged');
    parts.push('- Update knowledge graph entities with any new observations\n');

    // ── Tool catalogue ─────────────────────────────────────────────
    parts.push('## Available MCP Tools\n');
    parts.push('### Core');
    parts.push('- `initialize_memory_bank` — Initialize at a path');
    parts.push('- `get_memory_bank_status` — Check current status');
    parts.push('- `read_memory_bank_file` / `write_memory_bank_file` — Read/write individual files');
    parts.push('- `batch_read_files` / `batch_write_files` — Read/write multiple files at once');
    parts.push('- `list_memory_bank_files` — List all files');
    parts.push('- `get_context_bundle` — Read all core files at once');
    parts.push('- `get_context_digest` — Compact summary (includes graph summary)');
    parts.push('- `search_memory_bank` — Full-text search across all files');
    parts.push('- `track_progress` — Log progress');
    parts.push('- `add_progress_entry` — Structured entry (feature/fix/refactor/docs/test/chore)');
    parts.push('- `log_decision` — Record decisions with rationale and alternatives');
    parts.push('- `update_active_context` — Update tasks, issues, next steps');
    parts.push('- `update_tasks` — Add, remove, or replace tasks');
    parts.push('- `add_session_note` — Timestamped note (observation/blocker/question/decision/todo)');
    parts.push('- `switch_mode` / `get_current_mode` — Mode management');
    parts.push('- `create_backup` / `list_backups` / `restore_backup` — Backup management');
    parts.push('### Knowledge Graph');
    parts.push('- `graph_upsert_entity` — Create or update entities');
    parts.push('- `graph_add_observation` — Add observations to entities');
    parts.push('- `graph_link_entities` / `graph_unlink_entities` — Manage relationships');
    parts.push('- `graph_delete_entity` — Delete an entity and its relations');
    parts.push('- `graph_delete_observation` — Delete a specific observation');
    parts.push('- `graph_search` — Search entities, observations, and relations');
    parts.push('- `graph_open_nodes` — Get subgraph by entity names');
    parts.push('- `graph_rebuild` — Rebuild snapshot from event log');
    parts.push('- `graph_compact` — Compact event log (reduces file size)');
    parts.push('### Stores');
    parts.push('- `list_stores` — List available stores');
    parts.push('- `select_store` — Switch active store');

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(parts.join('\n')),
    ]);
  }

  async prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<ToolInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation | undefined> {
    return {
      invocationMessage: 'Reading Memory Bank context...',
    };
  }
}
