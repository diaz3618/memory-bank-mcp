/**
 * Memory Bank Chat Participant — @memory-bank agent for Copilot Chat.
 *
 * Handles slash commands: /status, /update, /progress, /decision
 * When invoked without a command, explains how to use the MCP server
 * and queries memory bank context for the AI.
 */

import * as vscode from 'vscode';
import { ext } from '../extensionVariables';

const PARTICIPANT_ID = 'memoryBank.agent';

/**
 * Regex matching default template placeholders from CoreTemplates.ts.
 * If any core file matches, the Memory Bank is still uninitialized.
 */
const PLACEHOLDER_RE =
  /\[(?:Project description|Objective \d|Task \d|Technology \d|Architecture description|Issue \d|Milestone \d|Date|Context|Decision|Alternatives|Consequences|Architecture patterns description|Code patterns description|Documentation patterns description|Next step \d|Note \d|Update)\]/;

export function registerChatParticipant(context: vscode.ExtensionContext): void {
  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);

  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'memoryBank.svg');

  context.subscriptions.push(participant);
}

async function handler(
  request: vscode.ChatRequest,
  _context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<vscode.ChatResult | void> {
  const command = request.command;

  try {
    switch (command) {
      case 'status':
        return await handleStatus(stream, token);
      case 'update':
        return await handleUpdate(request, stream, token);
      case 'progress':
        return await handleProgress(request, stream, token);
      case 'decision':
        return await handleDecision(request, stream, token);
      default:
        return await handleDefault(request, stream, token);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    stream.markdown(`**Error:** ${msg}\n\nMake sure the MCP server is connected. Use the Memory Bank sidebar to reconnect.`);
    return { metadata: { error: msg } };
  }
}

/**
 * Returns true when any core Memory Bank file still contains default
 * template placeholders (i.e. the Memory Bank has never been populated
 * with real project data).
 */
async function isFreshMemoryBank(): Promise<boolean> {
  const filesToCheck = ['product-context.md', 'active-context.md', 'progress.md'];
  for (const name of filesToCheck) {
    try {
      const content = await ext.memoryBankService.readFile(name);
      if (content && PLACEHOLDER_RE.test(content)) {
        return true;
      }
    } catch {
      // File may not exist — skip
    }
  }
  return false;
}

async function handleStatus(
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
): Promise<vscode.ChatResult> {
  const status = await ext.memoryBankService.getStatus();
  if (!status) {
    stream.markdown('Memory Bank is **not connected**. Use the sidebar to connect and initialize.');
    return { metadata: { command: 'status' } };
  }

  // Detect fresh/placeholder content
  const fresh = await isFreshMemoryBank();
  if (fresh) {
    stream.markdown('## ⚠ Fresh Memory Bank — Initialization Required\n\n');
    stream.markdown('The core files still contain **placeholder text**. ');
    stream.markdown('Ask Copilot to analyze the workspace and populate the Memory Bank before starting work.\n\n');
    stream.markdown('> Example: *"Read the project and fill all Memory Bank files with real data"*\n\n');
  }

  stream.markdown(`## Memory Bank Status\n\n`);
  stream.markdown(`- **Status:** ${status.isComplete ? 'Complete' : 'Incomplete'}\n`);
  stream.markdown(`- **Path:** ${status.path || 'Not set'}\n`);
  stream.markdown(`- **Files:** ${status.files?.length ?? 'unknown'}\n`);
  
  const mode = await ext.memoryBankService.getCurrentMode();
  stream.markdown(`- **Current Mode:** ${mode || 'unknown'}\n`);

  // Show files
  const files = await ext.memoryBankService.getFiles();
  if (files.length > 0) {
    stream.markdown(`\n### Files\n`);
    for (const file of files) {
      stream.markdown(`- ${file}\n`);
    }
  }

  // Read active context for AI
  try {
    const activeCtx = await ext.memoryBankService.readFile('active-context.md');
    if (activeCtx) {
      stream.markdown(`\n### Active Context\n\n${activeCtx}\n`);
    }
  } catch {
    // Not critical
  }

  return { metadata: { command: 'status' } };
}

async function handleUpdate(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
): Promise<vscode.ChatResult> {
  const content = request.prompt.trim();
  if (!content) {
    stream.markdown('Please provide content to update the active context.\n\nExample: `@memory-bank /update Working on authentication feature`');
    return { metadata: { command: 'update' } };
  }

  await ext.memoryBankService.updateActiveContext({ tasks: [content] });
  stream.markdown(`Active context updated: *${content}*`);
  return { metadata: { command: 'update' } };
}

async function handleProgress(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
): Promise<vscode.ChatResult> {
  const summary = request.prompt.trim();
  if (!summary) {
    stream.markdown('Please provide a progress summary.\n\nExample: `@memory-bank /progress Implemented login page`');
    return { metadata: { command: 'progress' } };
  }

  await ext.memoryBankService.trackProgress(summary);
  stream.markdown(`Progress tracked: *${summary}*`);
  return { metadata: { command: 'progress' } };
}

async function handleDecision(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
): Promise<vscode.ChatResult> {
  const decision = request.prompt.trim();
  if (!decision) {
    stream.markdown('Please provide a decision to log.\n\nExample: `@memory-bank /decision Switched from REST to GraphQL for better query flexibility`');
    return { metadata: { command: 'decision' } };
  }

  await ext.memoryBankService.logDecision(decision);
  stream.markdown(`Decision logged: *${decision}*`);
  return { metadata: { command: 'decision' } };
}

async function handleDefault(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
): Promise<vscode.ChatResult> {
  // If there's a prompt, try to provide context-aware help
  if (request.prompt.trim()) {
    stream.markdown(`## Memory Bank Agent\n\n`);
    stream.markdown(`I'm the Memory Bank agent. I help maintain project context across sessions.\n\n`);
    
    // Always include current status
    const status = await ext.memoryBankService.getStatus();
    if (status) {
      // Warn about fresh MB
      const fresh = await isFreshMemoryBank();
      if (fresh) {
        stream.markdown('> **⚠ The Memory Bank still contains placeholder data.** Ask Copilot to analyze the workspace and populate all files before starting work.\n\n');
      }

      stream.markdown(`**Current status:** ${status.isComplete ? 'Active' : 'Incomplete'} | **Path:** ${status.path || 'Not set'}\n\n`);
      
      // Include active context for the AI
      try {
        const activeCtx = await ext.memoryBankService.readFile('active-context.md');
        if (activeCtx) {
          stream.markdown(`### Current Active Context\n\n${activeCtx}\n\n`);
        }
      } catch {
        // Not critical
      }
    }

    stream.markdown(`### Available Commands\n`);
    stream.markdown(`- \`/status\` — View Memory Bank status and contents\n`);
    stream.markdown(`- \`/update <text>\` — Update active context\n`);
    stream.markdown(`- \`/progress <summary>\` — Track progress\n`);
    stream.markdown(`- \`/decision <text>\` — Log a decision\n`);
    
    return { metadata: { command: 'default' } };
  }

  // No prompt — show help
  stream.markdown(`## Memory Bank Agent\n\n`);
  stream.markdown(`I manage your project's Memory Bank — persistent context that helps AI assistants understand your project across sessions.\n\n`);
  stream.markdown(`### Commands\n`);
  stream.markdown(`- \`@memory-bank /status\` — View status and files\n`);
  stream.markdown(`- \`@memory-bank /update <text>\` — Update active context\n`);
  stream.markdown(`- \`@memory-bank /progress <summary>\` — Track progress\n`);
  stream.markdown(`- \`@memory-bank /decision <text>\` — Log a decision\n\n`);
  stream.markdown(`### How It Works\n`);
  stream.markdown(`The Memory Bank MCP server stores project context in markdown files:\n`);
  stream.markdown(`- **active-context.md** — Current focus and recent changes\n`);
  stream.markdown(`- **progress.md** — Implementation progress\n`);
  stream.markdown(`- **decision-log.md** — Architectural decisions\n`);
  stream.markdown(`- **system-patterns.md** — Code patterns and conventions\n`);
  stream.markdown(`- **product-context.md** — Product overview and goals\n\n`);
  stream.markdown(`This context is read before every task and updated after, so AI assistants always have full project awareness.\n`);

  return { metadata: { command: 'help' } };
}
