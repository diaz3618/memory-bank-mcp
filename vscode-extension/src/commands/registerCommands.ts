/**
 * Register all commands — Docker extension pattern.
 * 
 * Each command is registered with proper error handling and
 * output channel logging.
 */

import * as vscode from 'vscode';
import { ext } from '../extensionVariables';
import type { TreeProviders } from '../tree/registerTrees';

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

    await ext.memoryBankService.trackProgress(summary, details || undefined);
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

    await ext.memoryBankService.logDecision(decision, rationale || undefined);
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
    vscode.window.showInformationMessage(`Switched to ${(mode as string).toUpperCase()} mode.`);
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
    existing = JSON.parse(Buffer.from(content).toString());
  } catch {
    // File doesn't exist yet
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

const COPILOT_INSTRUCTIONS_CONTENT = `# Memory Bank MCP — Copilot Instructions

> **Auto-generated by Memory Bank extension. Edit freely to customize.**

## Non-Negotiable Requirement

You MUST use the Memory Bank MCP server tools at the start and end of EVERY coding task.
This is mandatory — no exceptions. The Memory Bank maintains persistent context across sessions.

## First-Time Setup (Fresh Memory Bank Detection)

Before any work begins, check whether the Memory Bank has been populated with real project data.

### How to detect a fresh/uninitialized Memory Bank
1. Call \`get_memory_bank_status\` to verify the Memory Bank is active.
2. Call \`get_context_bundle\` to read all core files.
3. If any file still contains **placeholder text** from the default templates (e.g. \`[Project description]\`, \`[Objective 1]\`, \`[Task 1]\`, \`[Technology 1]\`, \`[Architecture description]\`, \`[Issue 1]\`, \`[Milestone 1]\`, \`[Date]\`, \`[Context]\`, \`[Decision]\`, \`[Architecture patterns description]\`), the Memory Bank is uninitialized.

### How to initialize with real project data
When you detect placeholder content, you MUST populate all five core files before doing anything else:

1. **Analyze the project** — Scan the workspace to understand:
   - What the project is (language, framework, purpose)
   - Directory structure and key files (\`package.json\`, \`README.md\`, config files, source layout)
   - Technologies, dependencies, and patterns used
   - Current state (any existing tests, CI, issues)

2. **Fill \`product-context.md\`** — Use \`write_memory_bank_file\` to replace placeholder content with:
   - Accurate project description
   - Real objectives and goals
   - Actual technologies and dependencies
   - Architecture description based on the codebase
   - Project structure overview

3. **Fill \`active-context.md\`** — Write realistic current context:
   - Any visible ongoing work or TODO items found in the code
   - Known issues from the codebase (lint errors, TODOs, FIXMEs)
   - Logical next steps based on the project state

4. **Fill \`progress.md\`** — Write with what's observable:
   - Milestones that appear already completed (e.g. "Initial project setup")
   - Use today's date for the initialization entry
   - List any pending milestones you can infer

5. **Fill \`decision-log.md\`** — Record observable technical decisions:
   - Language/framework choice
   - Build tool or bundler choice
   - Any architectural patterns visible in the code

6. **Fill \`system-patterns.md\`** — Document patterns found in the codebase:
   - Architecture patterns (e.g. MVC, event-driven, microservices)
   - Code patterns (e.g. dependency injection, repository pattern)
   - Documentation and testing patterns

7. **Populate the knowledge graph** — Create entities for key project components:
   - Use \`graph_upsert_entity\` for major modules, services, and concepts
   - Use \`graph_add_observation\` for facts about each entity
   - Use \`graph_link_entities\` for relationships (depends-on, uses, part-of)

8. **Confirm completion** — Call \`add_session_note\` with: "Memory Bank initialized with project data from workspace analysis."

After initialization is complete, proceed with the normal workflow below.

## Normal Workflow (After Initialization)

### Before Starting Any Task
1. Call \`get_context_bundle\` or \`get_context_digest\` to load current context
2. Read \`active-context.md\` and \`progress.md\` to understand current state
3. Review the knowledge graph with \`graph_search\` for relevant entities

### During Work
- Use \`track_progress\` to log milestones and progress
- Use \`log_decision\` for architectural or design decisions
- Use \`add_session_note\` for observations, blockers, or questions
- Use \`update_active_context\` to keep tasks and issues current
- Use knowledge graph tools to update entities and relationships as the project evolves

### After Completing Work
- Update \`active-context.md\` with what was done and next steps
- Track final progress entry summarizing the session
- Ensure all decisions are logged
- Update knowledge graph entities with any new observations

## Available MCP Tools

### Core Tools
- \`initialize_memory_bank\` — Initialize at a path
- \`get_memory_bank_status\` — Check current status
- \`read_memory_bank_file\` / \`write_memory_bank_file\` — Read/write individual files
- \`batch_read_files\` / \`batch_write_files\` — Read/write multiple files at once
- \`list_memory_bank_files\` — List all files
- \`get_context_bundle\` — Read all core files at once
- \`get_context_digest\` — Compact summary (includes knowledge graph summary)
- \`search_memory_bank\` — Full-text search across all files
- \`track_progress\` — Log progress with type, summary, details, tags
- \`add_progress_entry\` — Structured progress entry (feature/fix/refactor/docs/test/chore)
- \`log_decision\` — Record decisions with rationale and alternatives
- \`update_active_context\` — Update tasks, issues, next steps
- \`update_tasks\` — Add, remove, or replace tasks
- \`add_session_note\` — Add timestamped notes (observation/blocker/question/decision/todo)
- \`switch_mode\` / \`get_current_mode\` — Mode management
- \`create_backup\` / \`list_backups\` / \`restore_backup\` — Backup management

### Knowledge Graph Tools
- \`graph_upsert_entity\` — Create or update entities
- \`graph_add_observation\` — Add observations to entities
- \`graph_link_entities\` / \`graph_unlink_entities\` — Manage relationships
- \`graph_delete_entity\` — Delete an entity and its observations/relations
- \`graph_delete_observation\` — Delete a specific observation
- \`graph_search\` — Search entities, observations, and relations
- \`graph_open_nodes\` — Get subgraph by entity names with neighborhood
- \`graph_rebuild\` — Rebuild graph snapshot from event log
- \`graph_compact\` — Compact event log (reduces file size, preserves state)

### Store Tools
- \`list_stores\` — List available Memory Bank stores
- \`select_store\` — Switch active store
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
