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

    // ── CRITICAL: Front-load the rules so no model can miss them ───
    parts.push('# MANDATORY: Read this ENTIRE section before proceeding\n');
    parts.push('## Rules (violation = broken workflow)');
    parts.push('1. BEFORE any code change → read context (done — you are reading it now)');
    parts.push('2. DURING work → call `track_progress` after each milestone, `log_decision` for choices');
    parts.push('3. AFTER work → call `update_active_context` with tasks/issues/nextSteps, then `track_progress` with session summary');
    parts.push('4. If active-context.md or progress.md contain placeholder text like `[Task 1]` → stop and initialize (see below)');
    parts.push('5. Never skip steps 1-3. Ever.\n');

    // ── Live status ────────────────────────────────────────────────
    let isConnected = false;
    let isFresh = false;

    try {
      const status = await ext.memoryBankService.getStatus();
      if (status) {
        isConnected = true;
        parts.push(`## Project Status`);
        parts.push(`Path: ${status.path || 'Not set'} | Files: ${status.files?.length ?? '?'} | Complete: ${status.isComplete ? 'Yes' : 'No'}`);

        const mode = await ext.memoryBankService.getCurrentMode();
        if (mode) { parts.push(`Mode: ${mode}`); }
        parts.push('');

        // Read core files and detect placeholders
        let activeCtx: string | undefined;
        let progress: string | undefined;
        let productCtx: string | undefined;

        try { activeCtx = await ext.memoryBankService.readFile('active-context.md'); } catch { /* */ }
        try { progress = await ext.memoryBankService.readFile('progress.md'); } catch { /* */ }
        try { productCtx = await ext.memoryBankService.readFile('product-context.md'); } catch { /* */ }

        isFresh = [activeCtx, progress, productCtx].some(
          (c) => c !== undefined && this.hasPlaceholders(c),
        );

        if (isFresh) {
          parts.push('## ⚠ STOP — Memory Bank needs initialization\n');
          parts.push('Files contain placeholder text. You MUST populate them before any other work:');
          parts.push('1. Scan workspace (package.json, README, source tree, configs)');
          parts.push('2. `write_memory_bank_file` for: product-context.md, active-context.md, progress.md, decision-log.md, system-patterns.md');
          parts.push('3. `graph_upsert_entity` + `graph_link_entities` for major components');
          parts.push('4. `add_session_note` → "Memory Bank initialized from workspace analysis."\n');
        }

        if (activeCtx && !this.hasPlaceholders(activeCtx)) {
          parts.push('## Active Context\n');
          parts.push(activeCtx);
          parts.push('');
        }

        if (progress && !this.hasPlaceholders(progress)) {
          // Show only last ~30 lines to keep output manageable
          const lines = progress.split('\n');
          const trimmed = lines.length > 40 ? lines.slice(-30) : lines;
          parts.push('## Recent Progress\n');
          if (lines.length > 40) { parts.push('*(showing last 30 lines)*\n'); }
          parts.push(trimmed.join('\n'));
          parts.push('');
        }
      } else {
        parts.push('## Status: NOT CONNECTED');
        parts.push('Use the Memory Bank sidebar to connect the MCP server.\n');
      }
    } catch {
      parts.push('## Status: Error reading Memory Bank\n');
    }

    // ── Workflow (compact) ─────────────────────────────────────────
    if (isConnected && !isFresh) {
      parts.push('## Workflow Reminder');
      parts.push('**Before:** Context loaded (above). Review it. Use `graph_search` if you need entity details.');
      parts.push('**During:** `track_progress` after milestones · `log_decision` for choices · `add_session_note` for blockers/observations');
      parts.push('**After:** `update_active_context` (tasks, issues, nextSteps) · final `track_progress` summary · update graph entities\n');
    }

    // ── Tool reference (compact table) ─────────────────────────────
    parts.push('## MCP Tool Reference');
    parts.push('**Context:** get_context_digest, get_context_bundle, get_memory_bank_status, read/write_memory_bank_file, batch_read/write_files, search_memory_bank');
    parts.push('**Progress:** track_progress, add_progress_entry, update_active_context, update_tasks, add_session_note, log_decision');
    parts.push('**Graph:** graph_search, graph_open_nodes, graph_upsert_entity, graph_add_observation, graph_link/unlink_entities, graph_delete_entity, graph_compact');
    parts.push('**Other:** switch_mode, get_current_mode, list_stores, select_store, initialize_memory_bank, create/restore_backup');
    parts.push('');
    parts.push('## Valid Modes');
    parts.push('Only 5 modes exist: **architect**, **code**, **ask**, **debug**, **test**.');
    parts.push('There is NO "full" mode. All tools work in every mode — modes control behavioral guidelines, not tool access.');

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
