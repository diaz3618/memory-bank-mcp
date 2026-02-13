/**
 * Register all commands — Docker extension pattern.
 * 
 * Each command is registered with proper error handling and
 * output channel logging.
 */

import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import { ext } from '../extensionVariables';
import type { TreeProviders } from '../tree/registerTrees';
import { GraphWebviewPanel } from '../views/GraphWebviewPanel';

export function registerCommands(
  context: vscode.ExtensionContext,
  trees: TreeProviders,
): void {
  const register = (id: string, handler: (...args: unknown[]) => Promise<void>) => {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async (...args: unknown[]) => {
        try {
          await handler(...args);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          ext.outputChannel.appendLine(`Command ${id} failed: ${msg}`);
          vscode.window.showErrorMessage(`Memory Bank: ${msg}`);
        }
      }),
    );
  };

  // ---------- Connection ----------

  register('memoryBank.initialize', async () => {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
      vscode.window.showErrorMessage('Open a folder first.');
      return;
    }

    const config = vscode.workspace.getConfiguration('memoryBank');
    const configuredPath = config.get<string>('path');
    const initPath = configuredPath || workspacePath;

    const result = await ext.memoryBankService.initialize(initPath);
    vscode.window.showInformationMessage(`Memory Bank initialized: ${result}`);
    refreshAll(trees);
  });

  register('memoryBank.reconnect', async () => {
    ext.memoryBankService.clearCache();
    const config = ext.mcpClientManager.getConnectionConfig();
    if (!config) {
      const choice = await vscode.window.showWarningMessage(
        'No MCP server configured. Would you like to set one up?',
        'Install Server',
        'Cancel',
      );
      if (choice === 'Install Server') {
        await vscode.commands.executeCommand('memoryBank.installServer');
      }
      return;
    }
    await ext.mcpClientManager.connect(config);

    // Auto-initialize if configured
    const autoInit = vscode.workspace.getConfiguration('memoryBank').get<boolean>('autoInitialize', false);
    if (autoInit) {
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspacePath) {
        const mbConfig = vscode.workspace.getConfiguration('memoryBank');
        const configuredPath = mbConfig.get<string>('path');
        await ext.memoryBankService.initialize(configuredPath || workspacePath);
      }
    }

    refreshAll(trees);
    vscode.window.showInformationMessage('Reconnected to MCP server.');
  });

  register('memoryBank.refresh', async () => {
    await ext.memoryBankService.refresh();
    refreshAll(trees);
  });

  register('memoryBank.showLogs', async () => {
    ext.outputChannel.show();
  });

  // ---------- Status tree ----------

  register('memoryBank.status.refresh', async () => {
    ext.memoryBankService.clearCache();
    await ext.memoryBankService.refresh();
    refreshAll(trees);
  });

  // ---------- Files ----------

  register('memoryBank.files.refresh', async () => {
    ext.memoryBankService.clearCache();
    trees.files.refresh();
  });

  register('memoryBank.openFile', async (filename?: unknown) => {
    if (typeof filename !== 'string' || !filename) {
      const files = await ext.memoryBankService.getFiles();
      const picked = await vscode.window.showQuickPick(files, { placeHolder: 'Select a file to open' });
      if (!picked) { return; }
      filename = picked;
    }

    // Try opening actual file on disk first
    const mbPath = await ext.memoryBankService.getMemoryBankPath();
    if (mbPath) {
      const filePath = vscode.Uri.file(`${mbPath}/${filename}`);
      try {
        await vscode.workspace.fs.stat(filePath);
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
        return;
      } catch {
        ext.outputChannel.appendLine(`File not on disk: ${filePath.fsPath}, reading via MCP`);
      }
    }

    // Fallback: read via MCP and open as untitled
    const content = await ext.memoryBankService.readFile(filename as string);
    const doc = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
    await vscode.window.showTextDocument(doc);
  });

  register('memoryBank.setPath', async () => {
    const result = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Select Memory Bank Folder',
    });

    if (result && result[0]) {
      const config = vscode.workspace.getConfiguration('memoryBank');
      await config.update('path', result[0].fsPath, vscode.ConfigurationTarget.Workspace);
      vscode.window.showInformationMessage(`Memory Bank path set to: ${result[0].fsPath}`);

      // Re-initialize with new path
      await ext.memoryBankService.initialize(result[0].fsPath);
      refreshAll(trees);
    }
  });

  // ---------- Actions ----------

  register('memoryBank.trackProgress', async () => {
    const summary = await vscode.window.showInputBox({
      prompt: 'Progress summary',
      placeHolder: 'e.g. Implemented authentication module',
    });
    if (!summary) { return; }

    const details = await vscode.window.showInputBox({
      prompt: 'Details (optional)',
      placeHolder: 'Additional details about the progress',
    });

    await ext.memoryBankService.trackProgress('other', details ? `${summary} — ${details}` : summary);
    vscode.window.showInformationMessage('Progress tracked.');
    trees.files.refresh();
  });

  register('memoryBank.logDecision', async () => {
    const decision = await vscode.window.showInputBox({
      prompt: 'Decision',
      placeHolder: 'e.g. Switched from REST to GraphQL',
    });
    if (!decision) { return; }

    const rationale = await vscode.window.showInputBox({
      prompt: 'Rationale (optional)',
      placeHolder: 'Why this decision was made',
    });

    await ext.memoryBankService.logDecision(decision, rationale || '', decision);
    vscode.window.showInformationMessage('Decision logged.');
    trees.files.refresh();
  });

  register('memoryBank.updateContext', async () => {
    const field = await vscode.window.showQuickPick(
      [
        { label: 'Tasks', description: 'Update ongoing tasks', detail: 'tasks' },
        { label: 'Issues', description: 'Update known issues', detail: 'issues' },
        { label: 'Next Steps', description: 'Update next steps', detail: 'nextSteps' },
      ],
      { placeHolder: 'What to update?' },
    );
    if (!field) { return; }

    const input = await vscode.window.showInputBox({
      prompt: `Enter ${field.label.toLowerCase()} (comma-separated for multiple)`,
      placeHolder: 'e.g. Working on authentication feature, Fixing login bug',
    });
    if (!input) { return; }

    const items = input.split(',').map(s => s.trim()).filter(Boolean);
    const params: { tasks?: string[]; issues?: string[]; nextSteps?: string[] } = {};
    params[field.detail as 'tasks' | 'issues' | 'nextSteps'] = items;

    await ext.memoryBankService.updateActiveContext(params);
    vscode.window.showInformationMessage(`Active context updated: ${items.length} ${field.label.toLowerCase()}.`);
    trees.files.refresh();
  });

  // ---------- Mode ----------

  register('memoryBank.switchMode', async (mode?: unknown) => {
    if (typeof mode !== 'string' || !mode) {
      const modes = ['architect', 'code', 'ask', 'debug', 'test'];
      mode = await vscode.window.showQuickPick(modes, { placeHolder: 'Select mode' });
      if (!mode) { return; }
    }

    ext.memoryBankService.clearCache();
    await ext.memoryBankService.switchMode(mode as string);

    // Sync the --mode arg into .vscode/mcp.json so VS Code's built-in MCP
    // (used by Copilot) picks up the same mode on next server restart.
    await syncModeToMcpJson(mode as string);

    vscode.window.showInformationMessage(
      `Switched to ${(mode as string).toUpperCase()} mode. Restart the MCP server in .vscode/mcp.json for Copilot to use this mode.`,
    );
    refreshAll(trees);
    trees.graph.refresh();
  });

  // ---------- Server Install & Configure ----------

  register('memoryBank.installServer', async () => {
    await installMcpServer();
  });

  register('memoryBank.configureServer', async () => {
    await configureMcpServer();
  });

  // ---------- Copilot Agent ----------

  register('memoryBank.createCopilotAgent', async () => {
    await createCopilotAgentInstructions();
  });

  // ---------- Graph ----------

  register('memoryBank.graph.refresh', async () => {
    trees.graph.refresh();
  });

  // ---------- Remote Servers ----------

  register('memoryBank.remote.refresh', async () => {
    trees.remote.refresh();
  });

  register('memoryBank.addRemoteServer', async () => {
    const name = await vscode.window.showInputBox({
      prompt: 'Server name',
      placeHolder: 'e.g. Production Server',
    });
    if (!name) { return; }

    const baseUrl = await vscode.window.showInputBox({
      prompt: 'Server URL',
      placeHolder: 'e.g. http://10.0.0.5:3000',
    });
    if (!baseUrl) { return; }

    const authToken = await vscode.window.showInputBox({
      prompt: 'Auth token (optional)',
      password: true,
    });

    // Save to workspace state
    const existing = ext.context.workspaceState.get<Array<{
      name: string;
      baseUrl: string;
      authToken?: string;
    }>>('memoryBank.remoteServers') ?? [];

    existing.push({ name, baseUrl, authToken: authToken || undefined });
    await ext.context.workspaceState.update('memoryBank.remoteServers', existing);

    trees.remote.refresh();
    vscode.window.showInformationMessage(`Remote server "${name}" added.`);
  });

  register('memoryBank.graph.addObservation', async (treeItem?: unknown) => {
    // Pre-fill entity name from context menu TreeItem
    let defaultEntity: string | undefined;
    if (treeItem && typeof treeItem === 'object' && 'name' in (treeItem as Record<string, unknown>)) {
      defaultEntity = (treeItem as { name: string }).name;
    }

    const entity = await vscode.window.showInputBox({
      prompt: 'Entity name or ID',
      placeHolder: 'e.g. MyService, Authentication Module',
      value: defaultEntity,
    });
    if (!entity) { return; }

    const text = await vscode.window.showInputBox({
      prompt: 'Observation text',
      placeHolder: 'e.g. Refactored to use dependency injection',
    });
    if (!text) { return; }

    const client = await ext.mcpClientManager.getClient();
    await client.graphAddObservation({ entity, text });
    vscode.window.showInformationMessage(`Observation added to ${entity}.`);
    trees.graph.refresh();
  });

  register('memoryBank.graph.linkEntities', async (treeItem?: unknown) => {
    // Pre-fill source entity from context menu TreeItem
    let defaultFrom: string | undefined;
    if (treeItem && typeof treeItem === 'object' && 'name' in (treeItem as Record<string, unknown>)) {
      defaultFrom = (treeItem as { name: string }).name;
    }

    const from = await vscode.window.showInputBox({
      prompt: 'Source entity name',
      placeHolder: 'e.g. UserService',
      value: defaultFrom,
    });
    if (!from) { return; }

    const to = await vscode.window.showInputBox({
      prompt: 'Target entity name',
      placeHolder: 'e.g. Database',
    });
    if (!to) { return; }

    const relationType = await vscode.window.showInputBox({
      prompt: 'Relation type',
      placeHolder: 'e.g. depends_on, uses, extends',
    });
    if (!relationType) { return; }

    const client = await ext.mcpClientManager.getClient();
    await client.graphLinkEntities({ from, to, relationType });
    vscode.window.showInformationMessage(`Linked ${from} --${relationType}--> ${to}.`);
    trees.graph.refresh();
  });

  register('memoryBank.graph.search', async () => {
    const query = await vscode.window.showInputBox({
      prompt: 'Search knowledge graph',
      placeHolder: 'e.g. authentication, UserService',
    });
    if (!query) { return; }

    const client = await ext.mcpClientManager.getClient();
    const result = await client.graphSearch({ query });

    if (!result.entities?.length && !result.relations?.length) {
      vscode.window.showInformationMessage('No results found.');
      return;
    }

    // Show results in quick pick
    const items: vscode.QuickPickItem[] = [];
    for (const e of result.entities || []) {
      items.push({
        label: `$(symbol-class) ${e.name}`,
        description: e.entityType,
        detail: e.observations?.map(o => o.text).join('; ') || 'No observations',
      });
    }
    for (const r of result.relations || []) {
      items.push({
        label: `$(arrow-right) ${r.from} → ${r.to}`,
        description: r.relationType,
      });
    }

    await vscode.window.showQuickPick(items, {
      placeHolder: `Found ${result.entities?.length || 0} entities, ${result.relations?.length || 0} relations`,
    });
  });

  // ---------- Graph: Upsert Entity ----------

  register('memoryBank.graph.upsertEntity', async () => {
    const name = await vscode.window.showInputBox({
      prompt: 'Entity name',
      placeHolder: 'e.g. AuthenticationModule',
    });
    if (!name) { return; }

    const entityType = await vscode.window.showInputBox({
      prompt: 'Entity type',
      placeHolder: 'e.g. module, service, concept, person',
    });
    if (!entityType) { return; }

    const client = await ext.mcpClientManager.getClient();
    await client.graphUpsertEntity({ name, entityType });
    vscode.window.showInformationMessage(`Entity "${name}" created/updated.`);
    trees.graph.refresh();
  });

  // ---------- Graph: Delete Entity ----------

  register('memoryBank.graph.deleteEntity', async (treeItemOrName?: unknown) => {
    // When invoked from context menu, treeItemOrName is a TreeItem with a `name` property.
    // When invoked from palette, it's undefined.
    let entity: string | undefined;

    if (treeItemOrName && typeof treeItemOrName === 'object' && 'name' in (treeItemOrName as Record<string, unknown>)) {
      entity = (treeItemOrName as { name: string }).name;
    } else if (typeof treeItemOrName === 'string') {
      entity = treeItemOrName;
    }

    if (!entity) {
      entity = await vscode.window.showInputBox({
        prompt: 'Entity name or ID to delete',
        placeHolder: 'e.g. AuthModule, ent_abc123',
      });
    }
    if (!entity) { return; }

    const confirm = await vscode.window.showWarningMessage(
      `Delete entity "${entity}" and all its observations and relations?`,
      { modal: true },
      'Delete',
    );
    if (confirm !== 'Delete') { return; }

    const client = await ext.mcpClientManager.getClient();
    await client.graphDeleteEntity({ entity });
    vscode.window.showInformationMessage(`Entity "${entity}" deleted.`);
    trees.graph.refresh();
  });

  // ---------- Graph: Delete Observation ----------

  register('memoryBank.graph.deleteObservation', async () => {
    const observationId = await vscode.window.showInputBox({
      prompt: 'Observation ID to delete',
      placeHolder: 'e.g. obs_abc123',
    });
    if (!observationId) { return; }

    const client = await ext.mcpClientManager.getClient();
    await client.graphDeleteObservation({ observationId });
    vscode.window.showInformationMessage(`Observation deleted.`);
    trees.graph.refresh();
  });

  // ---------- Graph: Compact ----------

  register('memoryBank.graph.compact', async () => {
    const client = await ext.mcpClientManager.getClient();
    await client.graphCompact();
    vscode.window.showInformationMessage('Graph event log compacted.');
    trees.graph.refresh();
  });

  // ---------- Graph: Open Webview ----------

  register('memoryBank.graph.openWebview', async () => {
    GraphWebviewPanel.create(context.extensionUri);
  });

  // ---------- Digest Preview ----------

  register('memoryBank.digest', async () => {
    const client = await ext.mcpClientManager.getClient();
    const result = await client.getContextDigest();
    const digest = result.digest;

    // Build readable markdown
    const lines: string[] = ['# Memory Bank Context Digest', ''];

    if (digest.projectState) {
      lines.push(`**Project State:** ${digest.projectState}`, '');
    }

    if (digest.currentContext.tasks.length > 0) {
      lines.push('## Current Tasks', '');
      for (const task of digest.currentContext.tasks) {
        lines.push(`- ${task}`);
      }
      lines.push('');
    }

    if (digest.currentContext.issues.length > 0) {
      lines.push('## Known Issues', '');
      for (const issue of digest.currentContext.issues) {
        lines.push(`- ${issue}`);
      }
      lines.push('');
    }

    if (digest.recentProgress.length > 0) {
      lines.push('## Recent Progress', '');
      for (const entry of digest.recentProgress) {
        lines.push(`- ${entry}`);
      }
      lines.push('');
    }

    if (digest.recentDecisions.length > 0) {
      lines.push('## Recent Decisions', '');
      for (const d of digest.recentDecisions) {
        lines.push(`### ${d.title}${d.date ? ` (${d.date})` : ''}`);
        lines.push(d.summary, '');
      }
    }

    if (digest.graphSummary) {
      lines.push(digest.graphSummary);
    }

    const doc = await vscode.workspace.openTextDocument({
      content: lines.join('\n'),
      language: 'markdown',
    });
    await vscode.window.showTextDocument(doc, { preview: true });
  });
}

function refreshAll(trees: TreeProviders): void {
  trees.status.refresh();
  trees.files.refresh();
  trees.actions.refresh();
  trees.mode.refresh();
  trees.graph.refresh();
  trees.stores.refresh();
}

/**
 * Sync the selected mode into `.vscode/mcp.json` so VS Code's built-in MCP
 * server (used by Copilot) starts with the same `--mode` on next restart.
 *
 * Works by updating the `args` array: replaces an existing `--mode <value>`
 * pair or appends one if absent.
 */
async function syncModeToMcpJson(mode: string): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;

  const mcpJsonPath = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode', 'mcp.json');

  let raw: string;
  try {
    const bytes = await vscode.workspace.fs.readFile(mcpJsonPath);
    raw = Buffer.from(bytes).toString('utf-8');
  } catch {
    // mcp.json doesn't exist — nothing to sync
    return;
  }

  try {
    const parsed = jsonc.parse(raw);
    const server = parsed?.servers?.['memory-bank-mcp'];
    if (!server) return;

    const args: string[] = server.args || [];
    const modeIdx = args.indexOf('--mode');
    if (modeIdx !== -1 && modeIdx + 1 < args.length) {
      args[modeIdx + 1] = mode;
    } else if (modeIdx !== -1) {
      args.push(mode);
    } else {
      args.push('--mode', mode);
    }
    server.args = args;

    const encoded = Buffer.from(JSON.stringify(parsed, null, 2) + '\n');
    await vscode.workspace.fs.writeFile(mcpJsonPath, encoded);
    ext.outputChannel.appendLine(`Synced --mode ${mode} to .vscode/mcp.json`);
  } catch (err) {
    ext.outputChannel.appendLine(`Failed to sync mode to mcp.json: ${err}`);
  }
}

// ---------- Server Installation ----------

async function installMcpServer(): Promise<void> {
  const choice = await vscode.window.showQuickPick(
    [
      { label: 'Default Setup', description: 'Install @diazstg/memory-bank-mcp via npx (recommended)', detail: 'default' },
      { label: 'Custom Setup', description: 'Configure command, args, and connection manually', detail: 'custom' },
    ],
    { placeHolder: 'How would you like to set up the MCP server?' },
  );

  if (!choice) { return; }

  if (choice.detail === 'default') {
    // Default: npx -y @diazstg/memory-bank-mcp
    const config = vscode.workspace.getConfiguration('memoryBank');
    await config.update('connectionMode', 'stdio', vscode.ConfigurationTarget.Workspace);
    await config.update('stdio.command', 'npx', vscode.ConfigurationTarget.Workspace);
    await config.update('stdio.args', ['-y', '@diazstg/memory-bank-mcp'], vscode.ConfigurationTarget.Workspace);
    
    // Also write .vscode/mcp.json for Copilot MCP integration
    await writeMcpJson();
    
    vscode.window.showInformationMessage(
      'MCP server configured! Use "Memory Bank: Reconnect" to connect.',
    );
  } else {
    await configureMcpServer();
  }
}

async function configureMcpServer(): Promise<void> {
  const mode = await vscode.window.showQuickPick(
    [
      { label: 'stdio', description: 'Launch server as child process (default)' },
      { label: 'http', description: 'Connect to remote HTTP server' },
    ],
    { placeHolder: 'Connection mode' },
  );

  if (!mode) { return; }
  const config = vscode.workspace.getConfiguration('memoryBank');
  await config.update('connectionMode', mode.label, vscode.ConfigurationTarget.Workspace);

  if (mode.label === 'stdio') {
    const command = await vscode.window.showInputBox({
      prompt: 'Server command',
      value: config.get<string>('stdio.command', 'npx'),
      placeHolder: 'npx',
    });
    if (!command) { return; }

    const argsStr = await vscode.window.showInputBox({
      prompt: 'Server arguments (space-separated)',
      value: config.get<string[]>('stdio.args', ['-y', '@diazstg/memory-bank-mcp']).join(' '),
      placeHolder: '-y @diazstg/memory-bank-mcp',
    });
    if (argsStr === undefined) { return; }

    await config.update('stdio.command', command, vscode.ConfigurationTarget.Workspace);
    await config.update('stdio.args', argsStr.split(' ').filter(Boolean), vscode.ConfigurationTarget.Workspace);

    // Write .vscode/mcp.json
    await writeMcpJson(command, argsStr.split(' ').filter(Boolean));

  } else {
    const baseUrl = await vscode.window.showInputBox({
      prompt: 'Server base URL',
      value: config.get<string>('http.baseUrl', ''),
      placeHolder: 'http://localhost:3000',
    });
    if (!baseUrl) { return; }

    const authToken = await vscode.window.showInputBox({
      prompt: 'Auth token (optional)',
      password: true,
    });

    await config.update('http.baseUrl', baseUrl, vscode.ConfigurationTarget.Workspace);
    if (authToken) {
      await config.update('http.authToken', authToken, vscode.ConfigurationTarget.Workspace);
    }
  }

  vscode.window.showInformationMessage(
    'MCP server configured. Use "Memory Bank: Reconnect" to connect.',
  );
}

async function writeMcpJson(
  command = 'npx',
  args = ['-y', '@diazstg/memory-bank-mcp'],
): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) { return; }

  const mcpJsonPath = vscode.Uri.joinPath(workspaceFolders[0].uri, '.vscode', 'mcp.json');
  
  let existing: Record<string, unknown> = {};
  try {
    const content = await vscode.workspace.fs.readFile(mcpJsonPath);
    const raw = Buffer.from(content).toString('utf-8');
    const parsed = jsonc.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      existing = parsed;
    } else {
      vscode.window.showWarningMessage('mcp.json has unexpected structure — creating fresh config.');
    }
  } catch (err) {
    // Distinguish "file not found" from "parse error"
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'FileNotFound') {
      // File doesn't exist yet — will create
    } else if (err instanceof SyntaxError) {
      vscode.window.showWarningMessage('mcp.json contains invalid JSON(C). Creating fresh config — back up your file if needed.');
    }
    // Fall through with empty existing
  }

  const servers = (existing['servers'] as Record<string, unknown>) || {};
  servers['memory-bank-mcp'] = {
    command,
    args,
    type: 'stdio',
  };
  existing['servers'] = servers;

  const encoded = Buffer.from(JSON.stringify(existing, null, 2));
  await vscode.workspace.fs.writeFile(mcpJsonPath, encoded);
  ext.outputChannel.appendLine(`Wrote .vscode/mcp.json with memory-bank-mcp server config`);
}

// ---------- Copilot Agent Instructions ----------

const COPILOT_INSTRUCTIONS_CONTENT = `# Memory Bank — Copilot Instructions

> Auto-generated by Memory Bank extension. Edit freely to customize.

This project uses the Memory Bank MCP server to persist context across AI sessions.
You have access to Memory Bank MCP tools. USE THEM — they are not optional.

## Mandatory Workflow (every task, no exceptions)

### START of task
1. Call \`memory-bank_get-instructions\` tool (or \`get_context_digest\` MCP tool) to load context
2. Read the returned active-context.md and progress.md
3. Use \`graph_search\` to find relevant knowledge graph entities

### DURING task
4. Call \`track_progress\` after completing milestones
5. Call \`log_decision\` when making architectural/design choices
6. Call \`add_session_note\` for observations, blockers, or questions

### END of task
7. Call \`update_active_context\` with updated tasks, issues, and next steps
8. Call \`track_progress\` with a final summary of what was accomplished
9. Update knowledge graph entities if project structure changed

## If Memory Bank contains placeholder text
If any core file contains \`[Project description]\` or \`[Task 1]\` style placeholders,
the Memory Bank has never been initialized. You MUST populate all core files with real
project data from the workspace before doing any other work.

## First-Time Initialization Procedure
When placeholder content is detected:
1. Scan workspace: package.json, README, config files, source directories
2. \`write_memory_bank_file\` for: product-context.md, active-context.md, progress.md, decision-log.md, system-patterns.md
3. \`graph_upsert_entity\` + \`graph_add_observation\` + \`graph_link_entities\` for major components
4. \`add_session_note\` → "Memory Bank initialized from workspace analysis."

## Available MCP Tools

### Context & Status
- \`get_context_digest\` — Compact summary (includes graph)
- \`get_context_bundle\` — All core files at once
- \`get_memory_bank_status\` — Current status
- \`read_memory_bank_file\` / \`write_memory_bank_file\` — Individual files
- \`batch_read_files\` / \`batch_write_files\` — Multiple files
- \`search_memory_bank\` — Full-text search

### Progress & Decisions
- \`track_progress\` — Log progress (type, summary, details, tags)
- \`add_progress_entry\` — Structured entry (feature/fix/refactor/docs/test/chore)
- \`update_active_context\` — Update tasks, issues, next steps
- \`update_tasks\` — Add, remove, or replace tasks
- \`log_decision\` — Record decisions with rationale
- \`add_session_note\` — Timestamped notes (observation/blocker/question/todo)

### Knowledge Graph
- \`graph_search\` — Search entities and relations
- \`graph_open_nodes\` — Subgraph by entity names
- \`graph_upsert_entity\` — Create/update entities
- \`graph_add_observation\` — Add observations to entities
- \`graph_link_entities\` / \`graph_unlink_entities\` — Manage relationships
- \`graph_delete_entity\` / \`graph_delete_observation\` — Remove data
- \`graph_rebuild\` / \`graph_compact\` — Maintenance

### Other
- \`switch_mode\` / \`get_current_mode\` — Mode management
- \`list_stores\` / \`select_store\` — Store management
- \`create_backup\` / \`list_backups\` / \`restore_backup\` — Backups
- \`initialize_memory_bank\` — Initialize at a path

## Valid Modes
The ONLY valid modes are: **architect**, **code**, **ask**, **debug**, **test**.
There is NO "full" mode. All tools are available in every mode — modes control
behavior guidelines (via .clinerules files), not tool access.
`;

async function createCopilotAgentInstructions(): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage('Open a folder first.');
    return;
  }

  const githubDir = vscode.Uri.joinPath(workspaceFolders[0].uri, '.github');
  const instructionsPath = vscode.Uri.joinPath(githubDir, 'copilot-instructions.md');

  // Check if file already exists
  let exists = false;
  try {
    await vscode.workspace.fs.stat(instructionsPath);
    exists = true;
  } catch {
    // Doesn't exist yet
  }

  if (exists) {
    const choice = await vscode.window.showWarningMessage(
      '.github/copilot-instructions.md already exists. Overwrite?',
      'Overwrite',
      'Open Existing',
      'Cancel',
    );
    if (choice === 'Open Existing') {
      const doc = await vscode.workspace.openTextDocument(instructionsPath);
      await vscode.window.showTextDocument(doc);
      return;
    }
    if (choice !== 'Overwrite') {
      return;
    }
  }

  // Ensure .github directory exists
  await vscode.workspace.fs.createDirectory(githubDir);

  // Write the file
  const encoded = Buffer.from(COPILOT_INSTRUCTIONS_CONTENT);
  await vscode.workspace.fs.writeFile(instructionsPath, encoded);

  ext.outputChannel.appendLine('Created .github/copilot-instructions.md');

  // Open the file
  const doc = await vscode.workspace.openTextDocument(instructionsPath);
  await vscode.window.showTextDocument(doc);

  vscode.window.showInformationMessage(
    'Copilot agent instructions created! GitHub Copilot will now use Memory Bank MCP in every conversation.',
  );
}
