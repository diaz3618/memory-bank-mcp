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

    await ext.memoryBankService.switchMode(mode as string);
    vscode.window.showInformationMessage(`Switched to ${mode} mode.`);
    trees.mode.refresh();
    trees.status.refresh();
  });

  // ---------- Server Install & Configure ----------

  register('memoryBank.installServer', async () => {
    await installMcpServer();
  });

  register('memoryBank.configureServer', async () => {
    await configureMcpServer();
  });

  // ---------- Graph ----------

  register('memoryBank.graph.refresh', async () => {
    trees.graph.refresh();
  });

  register('memoryBank.graph.addObservation', async () => {
    const entity = await vscode.window.showInputBox({
      prompt: 'Entity name or ID',
      placeHolder: 'e.g. MyService, Authentication Module',
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

  register('memoryBank.graph.linkEntities', async () => {
    const from = await vscode.window.showInputBox({
      prompt: 'Source entity name',
      placeHolder: 'e.g. UserService',
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
}

function refreshAll(trees: TreeProviders): void {
  trees.status.refresh();
  trees.files.refresh();
  trees.actions.refresh();
  trees.mode.refresh();
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
