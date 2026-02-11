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

  async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<ToolInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const parts: string[] = [];

    parts.push('# Memory Bank MCP Server — Instructions\n');
    parts.push('You MUST use the Memory Bank MCP server before, during, and after every task. This is non-negotiable.\n');
    parts.push('## Workflow\n');
    parts.push('1. **Before starting**: Read active-context.md and progress.md to understand current state');
    parts.push('2. **During work**: Track progress and log decisions as you go');
    parts.push('3. **After completing**: Update active-context.md with what was done and what\'s next\n');

    // Include current status if connected
    try {
      const status = await ext.memoryBankService.getStatus();
      if (status) {
        parts.push('## Current Status\n');
        parts.push(`- Path: ${status.path || 'Not set'}`);
        parts.push(`- Complete: ${status.isComplete ? 'Yes' : 'No'}`);
        parts.push(`- Files: ${status.files?.length ?? 'unknown'}\n`);

        const mode = await ext.memoryBankService.getCurrentMode();
        if (mode) {
          parts.push(`- Active Mode: ${mode}\n`);
        }

        // Read active context
        try {
          const activeCtx = await ext.memoryBankService.readFile('active-context.md');
          if (activeCtx) {
            parts.push('## Active Context\n');
            parts.push(activeCtx);
            parts.push('');
          }
        } catch {
          // Not critical
        }

        // Read progress
        try {
          const progress = await ext.memoryBankService.readFile('progress.md');
          if (progress) {
            parts.push('## Progress\n');
            parts.push(progress);
            parts.push('');
          }
        } catch {
          // Not critical
        }
      } else {
        parts.push('## Status: Not Connected\n');
        parts.push('The Memory Bank server is not currently connected. Ask the user to connect via the Memory Bank sidebar.\n');
      }
    } catch {
      parts.push('## Status: Error reading Memory Bank\n');
      parts.push('Could not read Memory Bank status. The server may not be connected.\n');
    }

    parts.push('## Available MCP Tools\n');
    parts.push('### Core');
    parts.push('- `initialize_memory_bank` — Initialize at a path');
    parts.push('- `read_memory_bank_file` — Read a file');
    parts.push('- `write_memory_bank_file` — Write a file');
    parts.push('- `list_memory_bank_files` — List all files');
    parts.push('- `get_memory_bank_status` — Get status');
    parts.push('- `track_progress` — Log progress');
    parts.push('- `log_decision` — Log a decision');
    parts.push('- `update_active_context` — Update active context (tasks, issues, nextSteps)');
    parts.push('- `switch_mode` — Switch operating mode');
    parts.push('- `get_current_mode` — Get current mode');
    parts.push('- `get_context_bundle` — Read all core files at once');
    parts.push('- `get_context_digest` — Compact summary for context-limited situations');
    parts.push('- `add_session_note` — Add a timestamped note to active context');
    parts.push('- `search_memory_bank` — Full-text search across all files');
    parts.push('### Knowledge Graph');
    parts.push('- `graph_upsert_entity` — Create or update an entity');
    parts.push('- `graph_add_observation` — Add observation to an entity');
    parts.push('- `graph_link_entities` — Link two entities with a relation');
    parts.push('- `graph_unlink_entities` — Remove a relation');
    parts.push('- `graph_search` — Search entities and relations');
    parts.push('- `graph_open_nodes` — Get subgraph by entity names');
    parts.push('- `graph_rebuild` — Rebuild snapshot from event log');

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
