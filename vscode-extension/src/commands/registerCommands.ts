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
import type { ApiKeyInfo } from '../services/ApiKeyService.js';
import { ApiKeyItem } from '../tree/ApiKeyTreeProvider.js';

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

  register('memoryBank.createCopilotAgent.stdio', async () => {
    await createCopilotAgentInstructions('stdio');
  });

  register('memoryBank.createCopilotAgent.http', async () => {
    await createCopilotAgentInstructions('http');
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

  register('memoryBank.removeRemoteServer', async (...args: unknown[]) => {
    // Can be invoked from tree context menu (RemoteServerItem) or palette
    const { RemoteServerItem } = await import('../tree/RemoteServersTreeProvider.js');
    const treeItem = args[0] instanceof RemoteServerItem ? args[0] : undefined;

    const existing = ext.context.workspaceState.get<Array<{
      name: string;
      baseUrl: string;
      authToken?: string;
    }>>('memoryBank.remoteServers') ?? [];

    if (existing.length === 0 && !treeItem) {
      vscode.window.showInformationMessage('No remote servers to remove.');
      return;
    }

    let serverName: string;
    let serverUrl: string;

    if (treeItem) {
      serverName = treeItem.serverConfig.name;
      serverUrl = treeItem.serverConfig.baseUrl;
    } else {
      const items = existing.map(s => ({
        label: s.name,
        description: s.baseUrl,
        detail: s.authToken ? 'Auth configured' : 'No auth',
      }));

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a server to remove',
      });
      if (!picked) { return; }
      serverName = picked.label;
      serverUrl = picked.description!;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Remove remote server "${serverName}" (${serverUrl})?`,
      { modal: true },
      'Remove',
    );
    if (confirm !== 'Remove') { return; }

    const updated = existing.filter(s => !(s.name === serverName && s.baseUrl === serverUrl));
    await ext.context.workspaceState.update('memoryBank.remoteServers', updated);

    // If this was the active connection, disconnect
    const config = vscode.workspace.getConfiguration('memoryBank');
    if (config.get<string>('http.baseUrl') === serverUrl) {
      await config.update('connectionMode', 'stdio', vscode.ConfigurationTarget.Workspace);
      await config.update('http.baseUrl', undefined, vscode.ConfigurationTarget.Workspace);
      await config.update('http.authToken', undefined, vscode.ConfigurationTarget.Workspace);
    }

    trees.remote.refresh();
    vscode.window.showInformationMessage(`Remote server "${serverName}" removed.`);
  });

  register('memoryBank.connectToRemoteServer', async (...args: unknown[]) => {
    const { RemoteServerItem } = await import('../tree/RemoteServersTreeProvider.js');
    let serverConfig: { name: string; baseUrl: string; authToken?: string };

    if (args[0] instanceof RemoteServerItem) {
      serverConfig = args[0].serverConfig;
    } else if (args[0] && typeof args[0] === 'object' && 'baseUrl' in (args[0] as Record<string, unknown>)) {
      serverConfig = args[0] as { name: string; baseUrl: string; authToken?: string };
    } else {
      // Show picker
      const { RemoteServersTreeProvider } = await import('../tree/RemoteServersTreeProvider.js');
      const provider = new RemoteServersTreeProvider();
      const servers = provider.getConfiguredServers();

      if (servers.length === 0) {
        vscode.window.showInformationMessage('No remote servers configured. Add one first.');
        return;
      }

      const picked = await vscode.window.showQuickPick(
        servers.map(s => ({
          label: s.name,
          description: s.baseUrl,
          server: s,
        })),
        { placeHolder: 'Select a server to connect to' },
      );
      if (!picked) { return; }
      serverConfig = picked.server;
    }

    // Update VS Code settings to point to this server
    const config = vscode.workspace.getConfiguration('memoryBank');
    await config.update('connectionMode', 'http', vscode.ConfigurationTarget.Workspace);
    await config.update('http.baseUrl', serverConfig.baseUrl, vscode.ConfigurationTarget.Workspace);
    if (serverConfig.authToken) {
      await config.update('http.authToken', serverConfig.authToken, vscode.ConfigurationTarget.Workspace);
    }

    // Write HTTP config to mcp.json — url needs /mcp suffix for VS Code MCP protocol
    const mcpUrl = serverConfig.baseUrl.replace(/\/$/, '').replace(/\/mcp$/, '') + '/mcp';
    await writeHttpMcpJson(mcpUrl, serverConfig.authToken || '');

    // Reconnect — use the full MCP endpoint URL
    ext.memoryBankService.clearCache();
    await ext.mcpClientManager.connect({
      mode: 'http',
      baseUrl: mcpUrl,
      authToken: serverConfig.authToken || '',
    });

    refreshAll(trees);
    vscode.window.showInformationMessage(`Connected to ${serverConfig.name} (${serverConfig.baseUrl}).`);
  });

  // ---------- API Key: Enter Token (paste from deployment) ----------

  register('memoryBank.apiKeys.enterToken', async () => {
    const token = await vscode.window.showInputBox({
      prompt: 'Paste your API key from deployment (docker logs, .env, admin panel)',
      placeHolder: 'mbmcp_live_...',
      password: true,
      ignoreFocusOut: true,
    });
    if (!token) { return; }

    const config = vscode.workspace.getConfiguration('memoryBank');
    await config.update('http.authToken', token, vscode.ConfigurationTarget.Workspace);

    // Also update mcp.json if it has an HTTP entry
    const baseUrl = config.get<string>('http.baseUrl', '');
    if (baseUrl) {
      const mcpUrl = baseUrl.replace(/\/$/, '').replace(/\/mcp$/, '') + '/mcp';
      await writeHttpMcpJson(mcpUrl, token);
    }

    // Reconnect with the new token
    ext.memoryBankService.clearCache();
    const connConfig = ext.mcpClientManager.getConnectionConfig();
    if (connConfig) {
      await ext.mcpClientManager.connect(connConfig);
    }

    refreshAll(trees);
    vscode.window.showInformationMessage('API key saved. Extension will reconnect.');
  });

  // ---------- API Key: Bootstrap from Database ----------

  register('memoryBank.apiKeys.bootstrap', async () => {
    const dbType = await vscode.window.showQuickPick(
      [
        { label: 'Supabase', description: 'Connect via Supabase connection string', detail: 'supabase' },
        { label: 'PostgreSQL', description: 'Connect via Postgres connection string', detail: 'postgres' },
        { label: 'Show Instructions', description: 'Show how to get the first API key', detail: 'instructions' },
      ],
      { placeHolder: 'How would you like to create the first API key?' },
    );
    if (!dbType) { return; }

    if (dbType.detail === 'instructions') {
      const doc = await vscode.workspace.openTextDocument({
        content: [
          '# Creating Your First API Key',
          '',
          'When deploying the Memory Bank MCP HTTP server for the first time,',
          'you need to create an initial API key to authenticate with the extension.',
          '',
          '## Option 1: From Docker Deployment',
          '',
          'If you deployed via Docker Compose, check the container logs:',
          '',
          '```bash',
          'docker logs memory-bank-mcp 2>&1 | grep "Admin API key"',
          '```',
          '',
          'Or check your `.env` file for `ADMIN_API_KEY`.',
          '',
          '## Option 2: Direct Database SQL',
          '',
          'Connect to your database and run:',
          '',
          '```sql',
          "INSERT INTO api_keys (prefix, key_hash, environment, status, scopes, rate_limit)",
          "VALUES (",
          "  'mbmcp_live_' || substr(md5(random()::text), 1, 8),",
          "  encode(sha256(('mbmcp_live_' || md5(random()::text))::bytea), 'hex'),",
          "  'live',",
          "  'active',",
          "  ARRAY['read', 'write', 'admin'],",
          "  0",
          ");",
          '```',
          '',
          '> **Note:** The above generates a random key in the database but you',
          '> won\'t see the plaintext. Use Option 1 or the bootstrap endpoint instead.',
          '',
          '## Option 3: Using the REST API (if bootstrap is enabled)',
          '',
          '```bash',
          'curl -X POST http://your-server/api/keys/bootstrap',
          '```',
          '',
          'This only works once on a fresh deployment with no existing keys.',
          '',
          '## After Obtaining Your Key',
          '',
          'Click **"Enter API Key..."** in the API Keys tree and paste your key.',
        ].join('\n'),
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc, { preview: true });
      return;
    }

    // Postgres / Supabase direct connection
    const connString = await vscode.window.showInputBox({
      prompt: `${dbType.label} connection string`,
      placeHolder: dbType.detail === 'supabase'
        ? 'postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres'
        : 'postgresql://user:password@host:5432/dbname',
      password: true,
      ignoreFocusOut: true,
    });
    if (!connString) { return; }

    // Generate a new API key
    const crypto = require('crypto');
    const prefix = 'mbmcp_live_';
    const randomPart = crypto.randomBytes(24).toString('base64url');
    const plainKey = `${prefix}${randomPart}`;
    const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');
    const keyPrefix = plainKey.substring(0, 20);

    // Build the SQL command to create the key
    const insertSql = `INSERT INTO api_keys (prefix, key_hash, label, environment, status, scopes, rate_limit) VALUES ('${keyPrefix}', '${keyHash}', 'VS Code Extension (bootstrapped)', 'live', 'active', ARRAY['read','write','admin','graph:read','graph:write'], 0);`;

    // Try to execute via psql (most common Postgres client)
    const terminal = vscode.window.createTerminal({
      name: 'Memory Bank: Bootstrap Key',
      hideFromUser: false,
    });
    terminal.show();
    terminal.sendText(`echo "Creating first API key in database..."`);
    terminal.sendText(`psql "${connString}" -c "${insertSql}"`);
    terminal.sendText(`echo ""`);
    terminal.sendText(`echo "If successful, your API key is:"`);
    terminal.sendText(`echo "${plainKey}"`);
    terminal.sendText(`echo ""`);
    terminal.sendText(`echo "Copy the key above and use 'Enter API Key...' in the extension."`);

    // Also show the key in a doc for easy copying
    const doc = await vscode.workspace.openTextDocument({
      content: [
        '# Bootstrap API Key',
        '',
        '> **Save this key now — it will NOT be shown again.**',
        '',
        `| Field      | Value |`,
        `|------------|-------|`,
        `| **Key**    | \`${plainKey}\` |`,
        `| **Prefix** | ${keyPrefix}... |`,
        `| **Scopes** | read, write, admin, graph:read, graph:write |`,
        '',
        'A terminal has been opened to insert this key into the database.',
        'After the SQL executes successfully, click **"Enter API Key..."** in the API Keys tree,',
        'or paste this key directly:',
        '',
        '```',
        plainKey,
        '```',
        '',
        '> **Requires:** `psql` must be available in your PATH.',
        '> If not, run the SQL manually in your database client.',
      ].join('\n'),
      language: 'markdown',
    });
    await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
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

  // ---------- API Key Management ----------

  register('memoryBank.apiKeys.create', async () => {
    const { ApiKeyService } = await import('../services/ApiKeyService.js');
    const apiKeyService = new ApiKeyService();

    const label = await vscode.window.showInputBox({
      prompt: 'Key label (optional)',
      placeHolder: 'e.g. CI/CD Pipeline, Dev Workstation',
    });
    // User can press Escape to cancel — label itself is optional
    if (label === undefined) { return; }

    const environment = await vscode.window.showQuickPick(
      [
        { label: 'live', description: 'Production key (prefix: mbmcp_live_)' },
        { label: 'test', description: 'Test key (prefix: mbmcp_test_)' },
      ],
      { placeHolder: 'Select environment' },
    );
    if (!environment) { return; }

    const expiryChoice = await vscode.window.showQuickPick(
      [
        { label: 'No expiry', detail: '0' },
        { label: '30 days', detail: '30' },
        { label: '90 days', detail: '90' },
        { label: '180 days', detail: '180' },
        { label: '365 days', detail: '365' },
        { label: 'Custom', detail: 'custom' },
      ],
      { placeHolder: 'Key expiry' },
    );
    if (!expiryChoice) { return; }

    let expiresInDays: number | undefined;
    if (expiryChoice.detail === 'custom') {
      const days = await vscode.window.showInputBox({
        prompt: 'Expiry in days',
        placeHolder: 'e.g. 60',
        validateInput: (v) => /^\d+$/.test(v) ? null : 'Enter a positive number',
      });
      if (!days) { return; }
      expiresInDays = parseInt(days, 10);
    } else {
      const n = parseInt(expiryChoice.detail!, 10);
      if (n > 0) { expiresInDays = n; }
    }

    // Scopes selection
    const scopeItems: vscode.QuickPickItem[] = [
      { label: 'read', description: 'Read-only access to memory bank data', picked: true },
      { label: 'write', description: 'Create and update memory bank data', picked: true },
      { label: 'admin', description: 'Full administrative access (manage keys, settings)' },
      { label: 'graph:read', description: 'Read knowledge graph entities' },
      { label: 'graph:write', description: 'Create/update/delete graph entities' },
    ];

    const selectedScopes = await vscode.window.showQuickPick(scopeItems, {
      placeHolder: 'Select scopes (defaults: read, write)',
      canPickMany: true,
    });
    if (!selectedScopes) { return; }

    const scopes = selectedScopes.length > 0
      ? selectedScopes.map(s => s.label)
      : ['read', 'write'];

    // Rate limit
    const rateLimitChoice = await vscode.window.showQuickPick(
      [
        { label: '30 req/min', detail: '30', description: 'Conservative' },
        { label: '60 req/min', detail: '60', description: 'Default' },
        { label: '120 req/min', detail: '120', description: 'High throughput' },
        { label: '300 req/min', detail: '300', description: 'Very high throughput' },
        { label: 'Unlimited', detail: '0', description: 'No rate limiting' },
        { label: 'Custom', detail: 'custom' },
      ],
      { placeHolder: 'Rate limit (requests per minute)' },
    );
    if (!rateLimitChoice) { return; }

    let rateLimit: number | undefined;
    if (rateLimitChoice.detail === 'custom') {
      const val = await vscode.window.showInputBox({
        prompt: 'Rate limit (requests per minute, 0 for unlimited)',
        placeHolder: 'e.g. 100',
        validateInput: (v) => /^\d+$/.test(v) ? null : 'Enter a non-negative number',
      });
      if (val === undefined) { return; }
      rateLimit = parseInt(val, 10);
    } else {
      rateLimit = parseInt(rateLimitChoice.detail!, 10);
    }

    const result = await apiKeyService.createKey({
      label: label || undefined,
      environment: environment.label as 'live' | 'test',
      expiresInDays,
      scopes,
      rateLimit: rateLimit || undefined,
    });

    // Show the plaintext key — this is the only time it's visible
    const doc = await vscode.workspace.openTextDocument({
      content: [
        '# New API Key Created',
        '',
        '> **Save this key now — it will NOT be shown again.**',
        '',
        `| Field          | Value |`,
        `|----------------|-------|`,
        `| **Key**        | \`${result.key}\` |`,
        `| **ID**         | ${result.id} |`,
        `| **Prefix**     | ${result.prefix} |`,
        `| **Label**      | ${result.label ?? '—'} |`,
        `| **Scopes**     | ${result.scopes.length > 0 ? result.scopes.join(', ') : 'all'} |`,
        `| **Rate Limit** | ${result.rateLimit > 0 ? `${result.rateLimit}/min` : 'Unlimited'} |`,
        `| **Expires**    | ${result.expiresAt ?? 'Never'} |`,
        `| **Created**    | ${result.createdAt} |`,
        '',
        '## Usage',
        '',
        'Add the key to your MCP client configuration:',
        '',
        '```json',
        `"authToken": "${result.key}"`,
        '```',
        '',
        'Or set it as an environment variable:',
        '',
        '```bash',
        `export MEMORY_BANK_API_KEY="${result.key}"`,
        '```',
      ].join('\n'),
      language: 'markdown',
    });
    await vscode.window.showTextDocument(doc, { preview: true });

    ext.outputChannel.appendLine(`API key created: ${result.prefix}... (${result.label ?? 'no label'})`);
    vscode.window.showInformationMessage(`API key created: ${result.prefix}...`);
    trees.apiKeys.refresh();
  });

  register('memoryBank.apiKeys.list', async () => {
    const { ApiKeyService } = await import('../services/ApiKeyService.js');
    const apiKeyService = new ApiKeyService();

    const showRevoked = await vscode.window.showQuickPick(
      [
        { label: 'Active keys only', detail: 'false' },
        { label: 'Include revoked keys', detail: 'true' },
      ],
      { placeHolder: 'Which keys to show?' },
    );
    if (!showRevoked) { return; }

    const { keys, total } = await apiKeyService.listKeys(showRevoked.detail === 'true');

    if (total === 0) {
      vscode.window.showInformationMessage('No API keys found.');
      return;
    }

    const statusIcon = (status: string) =>
      status === 'active' ? '$(pass-filled)' :
      status === 'revoked' ? '$(circle-slash)' :
      '$(warning)'; // expired

    interface KeyQuickPickItem extends vscode.QuickPickItem {
      keyId: string;
      keyStatus: string;
    }

    const items: KeyQuickPickItem[] = keys.map((k: ApiKeyInfo) => ({
      label: `${statusIcon(k.status)} ${k.prefix}...`,
      description: k.label ?? '',
      detail: `Status: ${k.status} | Created: ${k.createdAt}${k.expiresAt ? ` | Expires: ${k.expiresAt}` : ''}`,
      keyId: k.id,
      keyStatus: k.status,
    }));

    const picked = await vscode.window.showQuickPick<KeyQuickPickItem>(items, {
      placeHolder: `${total} key(s) found — select to see details or revoke`,
    });

    if (!picked) { return; }

    // Offer actions on the selected key
    const actions = [{ label: 'Copy ID', detail: 'copy' }];
    if (picked.keyStatus === 'active') {
      actions.push({ label: '$(trash) Revoke this key', detail: 'revoke' });
    }

    const action = await vscode.window.showQuickPick(actions, {
      placeHolder: `Action for ${picked.label}`,
    });

    if (action?.detail === 'copy') {
      await vscode.env.clipboard.writeText(picked.keyId);
      vscode.window.showInformationMessage('Key ID copied to clipboard.');
    } else if (action?.detail === 'revoke') {
      const confirm = await vscode.window.showWarningMessage(
        `Revoke API key ${picked.label}? This cannot be undone.`,
        { modal: true },
        'Revoke',
      );
      if (confirm === 'Revoke') {
        await apiKeyService.revokeKey(picked.keyId);
        vscode.window.showInformationMessage(`API key revoked: ${picked.label}`);
        trees.apiKeys.refresh();
      }
    }
  });

  register('memoryBank.apiKeys.revoke', async (...args: unknown[]) => {
    const { ApiKeyService } = await import('../services/ApiKeyService.js');
    const apiKeyService = new ApiKeyService();

    // When invoked from tree context menu, the first arg is the ApiKeyItem
    const treeItem = args[0] instanceof ApiKeyItem ? args[0] : undefined;

    let keyId: string;
    let keyLabel: string;

    if (treeItem) {
      keyId = treeItem.keyInfo.id;
      keyLabel = `${treeItem.keyInfo.prefix}...`;
    } else {
      // Fallback: QuickPick to select a key
      const { keys } = await apiKeyService.listKeys(false);
      const activeKeys = keys.filter((k: ApiKeyInfo) => k.status === 'active');

      if (activeKeys.length === 0) {
        vscode.window.showInformationMessage('No active API keys to revoke.');
        return;
      }

      interface RevokeQuickPickItem extends vscode.QuickPickItem {
        keyId: string;
      }

      const items: RevokeQuickPickItem[] = activeKeys.map((k: ApiKeyInfo) => ({
        label: `${k.prefix}...`,
        description: k.label ?? '',
        detail: `Created: ${k.createdAt}${k.expiresAt ? ` | Expires: ${k.expiresAt}` : ''}`,
        keyId: k.id,
      }));

      const picked = await vscode.window.showQuickPick<RevokeQuickPickItem>(items, {
        placeHolder: 'Select an API key to revoke',
      });
      if (!picked) { return; }

      keyId = picked.keyId;
      keyLabel = picked.label;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Revoke API key ${keyLabel}? This action cannot be undone.`,
      { modal: true },
      'Revoke',
    );
    if (confirm !== 'Revoke') { return; }

    await apiKeyService.revokeKey(keyId);
    vscode.window.showInformationMessage(`API key revoked: ${keyLabel}`);
    ext.outputChannel.appendLine(`API key revoked: ${keyId}`);
    trees.apiKeys.refresh();
  });

  register('memoryBank.apiKeys.refresh', async () => {
    trees.apiKeys.refresh();
  });

  register('memoryBank.apiKeys.toggleRevoked', async () => {
    trees.apiKeys.toggleShowRevoked();
    const state = trees.apiKeys.showRevoked ? 'showing' : 'hiding';
    vscode.window.showInformationMessage(`API Keys: ${state} revoked/expired keys.`);
  });

  register('memoryBank.apiKeys.search', async () => {
    const query = await vscode.window.showInputBox({
      prompt: 'Search API keys by prefix, label, status, or ID',
      placeHolder: 'e.g. live, test, CI/CD...',
    });
    if (query === undefined) { return; }
    trees.apiKeys.setFilter(query);
    if (query) {
      vscode.window.showInformationMessage(`API Keys: filtering by "${query}"`);
    } else {
      vscode.window.showInformationMessage('API Keys: filter cleared.');
    }
  });

  register('memoryBank.apiKeys.rotate', async (...args: unknown[]) => {
    const { ApiKeyService } = await import('../services/ApiKeyService.js');
    const apiKeyService = new ApiKeyService();

    // When invoked from tree context menu, the first arg is the ApiKeyItem
    const treeItem = args[0] instanceof ApiKeyItem ? args[0] : undefined;

    let keyId: string;
    let keyLabel: string | null;
    let keyEnv: string;
    let displayLabel: string;

    if (treeItem) {
      keyId = treeItem.keyInfo.id;
      keyLabel = treeItem.keyInfo.label;
      keyEnv = treeItem.keyInfo.prefix.startsWith('mbmcp_test') ? 'test' : 'live';
      displayLabel = `${treeItem.keyInfo.prefix}...`;
    } else {
      const { keys } = await apiKeyService.listKeys(false);
      const activeKeys = keys.filter((k: ApiKeyInfo) => k.status === 'active');

      if (activeKeys.length === 0) {
        vscode.window.showInformationMessage('No active API keys to rotate.');
        return;
      }

      interface RotateQuickPickItem extends vscode.QuickPickItem {
        keyId: string;
        keyLabel: string | null;
        keyEnv: string;
      }

      const items: RotateQuickPickItem[] = activeKeys.map((k: ApiKeyInfo) => ({
        label: `${k.prefix}...`,
        description: k.label ?? '',
        detail: `Created: ${k.createdAt}`,
        keyId: k.id,
        keyLabel: k.label,
        keyEnv: k.prefix.startsWith('mbmcp_test') ? 'test' : 'live',
      }));

      const picked = await vscode.window.showQuickPick<RotateQuickPickItem>(items, {
        placeHolder: 'Select an API key to rotate (revoke + create new)',
      });
      if (!picked) { return; }

      keyId = picked.keyId;
      keyLabel = picked.keyLabel;
      keyEnv = picked.keyEnv;
      displayLabel = picked.label;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Rotate API key ${displayLabel}? The old key will be revoked immediately.`,
      { modal: true },
      'Rotate',
    );
    if (confirm !== 'Rotate') { return; }

    // Revoke old key
    await apiKeyService.revokeKey(keyId);
    ext.outputChannel.appendLine(`Rotated: old key revoked ${keyId}`);

    // Create new key with same label and environment
    const result = await apiKeyService.createKey({
      label: keyLabel ?? undefined,
      environment: keyEnv as 'live' | 'test',
    });

    // Show the new plaintext key (one-time)
    const doc = await vscode.workspace.openTextDocument({
      content: [
        '# API Key Rotated',
        '',
        '> **Save this NEW key now — it will NOT be shown again.**',
        '',
        `| Field       | Value |`,
        `|-------------|-------|`,
        `| **Key**     | \`${result.key}\` |`,
        `| **ID**      | ${result.id} |`,
        `| **Prefix**  | ${result.prefix} |`,
        `| **Label**   | ${result.label ?? '—'} |`,
        `| **Expires** | ${result.expiresAt ?? 'Never'} |`,
        `| **Created** | ${result.createdAt} |`,
        '',
        `Old key \`${displayLabel}\` has been revoked.`,
      ].join('\n'),
      language: 'markdown',
    });
    await vscode.window.showTextDocument(doc, { preview: true });

    vscode.window.showInformationMessage(`API key rotated: ${result.prefix}...`);
    trees.apiKeys.refresh();
  });

  register('memoryBank.apiKeys.copyMetadata', async (...args: unknown[]) => {
    const { ApiKeyService } = await import('../services/ApiKeyService.js');
    const apiKeyService = new ApiKeyService();

    // When invoked from tree context menu, use the tree item's key info
    const treeItem = args[0] instanceof ApiKeyItem ? args[0] : undefined;

    let targetId: string;
    let targetPrefix: string;
    let targetLabel: string | null;
    let targetScopes: string[];
    let targetRateLimit: number;
    let targetStatus: string;
    let targetCreatedAt: string;
    let targetExpiresAt: string | null;

    if (treeItem) {
      const k = treeItem.keyInfo;
      targetId = k.id;
      targetPrefix = k.prefix;
      targetLabel = k.label;
      targetScopes = k.scopes;
      targetRateLimit = k.rateLimit;
      targetStatus = k.status;
      targetCreatedAt = k.createdAt;
      targetExpiresAt = k.expiresAt;
    } else {
      const { keys } = await apiKeyService.listKeys(true);

      if (keys.length === 0) {
        vscode.window.showInformationMessage('No API keys found.');
        return;
      }

      interface MetaQuickPickItem extends vscode.QuickPickItem {
        keyInfo: ApiKeyInfo;
      }

      const items: MetaQuickPickItem[] = keys.map((k: ApiKeyInfo) => ({
        label: `${k.prefix}...`,
        description: k.label ?? k.status,
        detail: `ID: ${k.id} | Status: ${k.status}`,
        keyInfo: k,
      }));

      const picked = await vscode.window.showQuickPick<MetaQuickPickItem>(items, {
        placeHolder: 'Select a key to copy metadata',
      });
      if (!picked) { return; }

      const k = picked.keyInfo;
      targetId = k.id;
      targetPrefix = k.prefix;
      targetLabel = k.label;
      targetScopes = k.scopes;
      targetRateLimit = k.rateLimit;
      targetStatus = k.status;
      targetCreatedAt = k.createdAt;
      targetExpiresAt = k.expiresAt;
    }

    const fields = [
      { label: 'Key ID', detail: targetId },
      { label: 'Key Prefix', detail: targetPrefix },
      { label: 'Status', detail: targetStatus },
      { label: 'Created', detail: targetCreatedAt },
      ...(targetLabel ? [{ label: 'Label', detail: targetLabel }] : []),
      ...(targetScopes.length > 0 ? [{ label: 'Scopes', detail: targetScopes.join(', ') }] : []),
      { label: 'Rate Limit', detail: `${targetRateLimit}/min` },
      ...(targetExpiresAt ? [{ label: 'Expires', detail: targetExpiresAt }] : []),
    ];

    const fieldChoice = await vscode.window.showQuickPick(fields, {
      placeHolder: 'Which value to copy?',
    });
    if (!fieldChoice) { return; }

    await vscode.env.clipboard.writeText(fieldChoice.detail!);
    vscode.window.showInformationMessage(`Copied ${fieldChoice.label} to clipboard.`);
  });

  // ---------- API Key Export ----------

  register('memoryBank.apiKeys.export', async () => {
    const { ApiKeyService } = await import('../services/ApiKeyService.js');
    const apiKeyService = new ApiKeyService();

    const { keys, total } = await apiKeyService.listKeys(true);

    if (total === 0) {
      vscode.window.showInformationMessage('No API keys to export.');
      return;
    }

    const formatChoice = await vscode.window.showQuickPick(
      [
        { label: 'JSON', description: 'Export as JSON file', detail: 'json' },
        { label: 'CSV', description: 'Export as CSV file', detail: 'csv' },
        { label: 'Markdown', description: 'Export as Markdown table', detail: 'md' },
      ],
      { placeHolder: 'Export format' },
    );
    if (!formatChoice) { return; }

    let content: string;
    let language: string;

    if (formatChoice.detail === 'json') {
      const exportData = keys.map((k: ApiKeyInfo) => ({
        id: k.id,
        prefix: k.prefix,
        label: k.label,
        status: k.status,
        scopes: k.scopes,
        rateLimit: k.rateLimit,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
        expiresAt: k.expiresAt,
        revokedAt: k.revokedAt,
      }));
      content = JSON.stringify({ keys: exportData, total, exportedAt: new Date().toISOString() }, null, 2);
      language = 'json';
    } else if (formatChoice.detail === 'csv') {
      const headers = ['ID', 'Prefix', 'Label', 'Status', 'Scopes', 'Rate Limit', 'Created', 'Last Used', 'Expires', 'Revoked'];
      const rows = keys.map((k: ApiKeyInfo) => [
        k.id,
        k.prefix,
        k.label ?? '',
        k.status,
        k.scopes.join(';'),
        String(k.rateLimit),
        k.createdAt,
        k.lastUsedAt ?? '',
        k.expiresAt ?? '',
        k.revokedAt ?? '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      content = [headers.join(','), ...rows].join('\n');
      language = 'plaintext';
    } else {
      // Markdown table
      const lines = [
        '# API Keys Export',
        '',
        `> Exported ${total} key(s) on ${new Date().toLocaleString()}`,
        '',
        '| Prefix | Label | Status | Scopes | Rate Limit | Created | Expires |',
        '|--------|-------|--------|--------|------------|---------|---------|',
      ];
      for (const k of keys) {
        lines.push(`| ${k.prefix}... | ${k.label ?? '—'} | ${k.status} | ${k.scopes.join(', ') || '—'} | ${k.rateLimit}/min | ${k.createdAt} | ${k.expiresAt ?? 'Never'} |`);
      }
      content = lines.join('\n');
      language = 'markdown';
    }

    // Ask user whether to save to file or open as document
    const saveChoice = await vscode.window.showQuickPick(
      [
        { label: '$(file) Save to File', detail: 'save' },
        { label: '$(preview) Open as Document', detail: 'preview' },
      ],
      { placeHolder: 'How to export?' },
    );

    if (saveChoice?.detail === 'save') {
      const fileExt = formatChoice.detail === 'csv' ? 'csv' : formatChoice.detail === 'json' ? 'json' : 'md';
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`api-keys-export.${fileExt}`),
        filters: {
          [formatChoice.label]: [fileExt],
          'All Files': ['*'],
        },
      });
      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
        vscode.window.showInformationMessage(`Exported ${total} API key(s) to ${uri.fsPath}`);
      }
    } else if (saveChoice?.detail === 'preview') {
      const doc = await vscode.workspace.openTextDocument({ content, language });
      await vscode.window.showTextDocument(doc, { preview: true });
    }
  });

  // ---------- API Key: Edit Label ----------

  register('memoryBank.apiKeys.editLabel', async (...args: unknown[]) => {
    const { ApiKeyService } = await import('../services/ApiKeyService.js');
    const apiKeyService = new ApiKeyService();

    // When invoked from tree context menu, use the tree item's key info
    const treeItemArg = args[0] instanceof ApiKeyItem ? args[0] : undefined;

    let keyId: string;
    let currentLabel: string | null;
    let displayName: string;

    if (treeItemArg) {
      keyId = treeItemArg.keyInfo.id;
      currentLabel = treeItemArg.keyInfo.label;
      displayName = `${treeItemArg.keyInfo.prefix}...`;
    } else {
      const { keys } = await apiKeyService.listKeys(false);
      const activeKeys = keys.filter((k: ApiKeyInfo) => k.status === 'active');

      if (activeKeys.length === 0) {
        vscode.window.showInformationMessage('No active API keys to edit.');
        return;
      }

      interface EditQuickPickItem extends vscode.QuickPickItem {
        keyId: string;
        keyLabel: string | null;
      }

      const items: EditQuickPickItem[] = activeKeys.map((k: ApiKeyInfo) => ({
        label: `${k.prefix}...`,
        description: k.label ?? '',
        detail: `Created: ${k.createdAt}`,
        keyId: k.id,
        keyLabel: k.label,
      }));

      const picked = await vscode.window.showQuickPick<EditQuickPickItem>(items, {
        placeHolder: 'Select an API key to edit its label',
      });
      if (!picked) { return; }

      keyId = picked.keyId;
      currentLabel = picked.keyLabel;
      displayName = picked.label;
    }

    const newLabel = await vscode.window.showInputBox({
      prompt: `New label for ${displayName}`,
      value: currentLabel ?? '',
      placeHolder: 'e.g. CI/CD Pipeline, Dev Workstation',
    });
    if (newLabel === undefined) { return; }

    try {
      await apiKeyService.updateKey(keyId, { label: newLabel || null });
      vscode.window.showInformationMessage(`Label updated for ${displayName}`);
      trees.apiKeys.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to update label: ${msg}`);
    }
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
  trees.remote.refresh();
  trees.apiKeys.refresh();
  trees.help.refresh();
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

    const args: string[] = [...(server.args || [])];
    const modeIdx = args.indexOf('--mode');
    if (modeIdx !== -1 && modeIdx + 1 < args.length) {
      args[modeIdx + 1] = mode;
    } else if (modeIdx !== -1) {
      args.push(mode);
    } else {
      args.push('--mode', mode);
    }

    // Use jsonc.modify to update only the args — preserves comments and formatting
    const formattingOptions: jsonc.FormattingOptions = { tabSize: 4, insertSpaces: true, eol: '\n' };
    const edits = jsonc.modify(raw, ['servers', 'memory-bank-mcp', 'args'], args, { formattingOptions });
    const newText = jsonc.applyEdits(raw, edits);

    await vscode.workspace.fs.writeFile(mcpJsonPath, Buffer.from(newText));
    ext.outputChannel.appendLine(`Synced --mode ${mode} to .vscode/mcp.json`);
  } catch (err) {
    ext.outputChannel.appendLine(`Failed to sync mode to mcp.json: ${err}`);
  }
}

// ---------- Server Installation ----------

async function installMcpServer(): Promise<void> {
  const choice = await vscode.window.showQuickPick(
    [
      { label: '$(terminal) Local Server (npx)', description: 'Install @diazstg/memory-bank-mcp via npx (recommended)', detail: 'default' },
      { label: '$(cloud) Remote HTTP Server', description: 'Connect to a deployed Memory Bank HTTP server (Docker/Supabase)', detail: 'http' },
      { label: '$(settings-gear) Custom Setup', description: 'Configure command, args, and connection manually', detail: 'custom' },
    ],
    { placeHolder: 'How would you like to set up the MCP server?' },
  );

  if (!choice) { return; }

  if (choice.detail === 'default') {
    // Prompt for username (highly recommended)
    const username = await vscode.window.showInputBox({
      prompt: 'Enter your username (recommended for progress tracking)',
      placeHolder: 'your-github-username or "Your Name"',
      value: '',
    });
    // Note: We allow empty username, but it's recommended to provide one
    
    // Default: npx -y @diazstg/memory-bank-mcp --mode code --username <username>
    const args = ['-y', '@diazstg/memory-bank-mcp', '--mode', 'code'];
    if (username) {
      args.push('--username', username);
    }
    
    const config = vscode.workspace.getConfiguration('memoryBank');
    await config.update('connectionMode', 'stdio', vscode.ConfigurationTarget.Workspace);
    await config.update('stdio.command', 'npx', vscode.ConfigurationTarget.Workspace);
    await config.update('stdio.args', args, vscode.ConfigurationTarget.Workspace);
    
    // Also write .vscode/mcp.json for Copilot MCP integration
    await writeMcpJson('npx', args);
    
    vscode.window.showInformationMessage(
      'MCP server configured! Use "Memory Bank: Reconnect" to connect.',
    );
  } else if (choice.detail === 'http') {
    // HTTP remote server setup
    const baseUrl = await vscode.window.showInputBox({
      prompt: 'Server URL (the base URL of your deployed Memory Bank server)',
      placeHolder: 'http://your-server.com or http://10.0.0.5:3000',
      ignoreFocusOut: true,
    });
    if (!baseUrl) { return; }

    const authToken = await vscode.window.showInputBox({
      prompt: 'API key (from deployment, .env, or docker logs)',
      placeHolder: 'mbmcp_live_...',
      password: true,
      ignoreFocusOut: true,
    });

    // Save to VS Code settings
    const config = vscode.workspace.getConfiguration('memoryBank');
    await config.update('connectionMode', 'http', vscode.ConfigurationTarget.Workspace);
    await config.update('http.baseUrl', baseUrl, vscode.ConfigurationTarget.Workspace);
    if (authToken) {
      await config.update('http.authToken', authToken, vscode.ConfigurationTarget.Workspace);
    }

    // Write .vscode/mcp.json with HTTP config (used by Copilot / VS Code MCP)
    const mcpUrl = baseUrl.replace(/\/$/, '') + '/mcp';
    await writeHttpMcpJson(mcpUrl, authToken || '');

    // Save as remote server in workspace state
    const existing = ext.context.workspaceState.get<Array<{
      name: string;
      baseUrl: string;
      authToken?: string;
    }>>('memoryBank.remoteServers') ?? [];

    // Avoid duplicates
    if (!existing.some(s => s.baseUrl === baseUrl)) {
      const serverName = new URL(baseUrl).hostname || 'Remote Server';
      existing.push({
        name: serverName,
        baseUrl,
        authToken: authToken || undefined,
      });
      await ext.context.workspaceState.update('memoryBank.remoteServers', existing);
    }

    vscode.window.showInformationMessage(
      'HTTP server configured! Use "Memory Bank: Reconnect" to connect.',
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
      value: config.get<string[]>('stdio.args', ['-y', '@diazstg/memory-bank-mcp', '--mode', 'code']).join(' '),
      placeHolder: '-y @diazstg/memory-bank-mcp --mode code',
    });
    if (argsStr === undefined) { return; }

    // Prompt for username (highly recommended)
    const username = await vscode.window.showInputBox({
      prompt: 'Enter your username (recommended for progress tracking)',
      placeHolder: 'your-github-username or "Your Name"',
      value: '',
    });

    // Build args array
    const args = argsStr.split(' ').filter(Boolean);
    // Add username if provided and not already in args
    if (username && !args.includes('--username') && !args.includes('-u')) {
      args.push('--username', username);
    }

    await config.update('stdio.command', command, vscode.ConfigurationTarget.Workspace);
    await config.update('stdio.args', args, vscode.ConfigurationTarget.Workspace);

    // Write .vscode/mcp.json
    await writeMcpJson(command, args);

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

    // Also write .vscode/mcp.json for Copilot / VS Code MCP
    const mcpUrl = baseUrl.replace(/\/$/, '') + '/mcp';
    await writeHttpMcpJson(mcpUrl, authToken || '');
  }

  vscode.window.showInformationMessage(
    'MCP server configured. Use "Memory Bank: Reconnect" to connect.',
  );
}

async function writeMcpJson(
  command = 'npx',
  args = ['-y', '@diazstg/memory-bank-mcp', '--mode', 'code'],
): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) { return; }

  const mcpJsonPath = vscode.Uri.joinPath(workspaceFolders[0].uri, '.vscode', 'mcp.json');

  // Read existing content or start fresh
  let text = '{}';
  try {
    const bytes = await vscode.workspace.fs.readFile(mcpJsonPath);
    text = Buffer.from(bytes).toString('utf-8');
    // Validate it's parseable
    const errors: jsonc.ParseError[] = [];
    jsonc.parse(text, errors);
    if (errors.length > 0) {
      vscode.window.showWarningMessage('mcp.json contains JSON syntax errors. Creating fresh config — back up your file if needed.');
      text = '{}';
    }
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code !== 'FileNotFound') {
      ext.outputChannel.appendLine(`Error reading mcp.json: ${err}`);
    }
    // File doesn't exist — will create from scratch
  }

  // Use jsonc.modify to upsert the server entry — preserves comments and formatting
  const formattingOptions: jsonc.FormattingOptions = { tabSize: 4, insertSpaces: true, eol: '\n' };
  const serverConfig = { command, args, type: 'stdio' };
  const edits = jsonc.modify(text, ['servers', 'memory-bank-mcp'], serverConfig, { formattingOptions });
  const newText = jsonc.applyEdits(text, edits);

  // Ensure .vscode directory exists
  const vscodeDir = vscode.Uri.joinPath(workspaceFolders[0].uri, '.vscode');
  await vscode.workspace.fs.createDirectory(vscodeDir);

  await vscode.workspace.fs.writeFile(mcpJsonPath, Buffer.from(newText));
  ext.outputChannel.appendLine('Wrote .vscode/mcp.json with memory-bank-mcp server config (existing entries preserved)');
}

/**
 * Write an HTTP-mode entry into `.vscode/mcp.json`.
 *
 * Format: { "type": "http", "url": "...", "headers": { "Authorization": "Bearer ..." } }
 */
async function writeHttpMcpJson(url: string, authToken: string): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) { return; }

  const mcpJsonPath = vscode.Uri.joinPath(workspaceFolders[0].uri, '.vscode', 'mcp.json');

  let text = '{}';
  try {
    const bytes = await vscode.workspace.fs.readFile(mcpJsonPath);
    text = Buffer.from(bytes).toString('utf-8');
    const errors: jsonc.ParseError[] = [];
    jsonc.parse(text, errors);
    if (errors.length > 0) {
      vscode.window.showWarningMessage('mcp.json contains JSON syntax errors. Creating fresh config.');
      text = '{}';
    }
  } catch {
    // File doesn't exist — will create from scratch
  }

  const serverConfig: Record<string, unknown> = { type: 'http', url };
  if (authToken) {
    serverConfig.headers = { Authorization: `Bearer ${authToken}` };
  }

  const formattingOptions: jsonc.FormattingOptions = { tabSize: 4, insertSpaces: true, eol: '\n' };
  const edits = jsonc.modify(text, ['servers', 'memory-bank-mcp'], serverConfig, { formattingOptions });
  const newText = jsonc.applyEdits(text, edits);

  const vscodeDir = vscode.Uri.joinPath(workspaceFolders[0].uri, '.vscode');
  await vscode.workspace.fs.createDirectory(vscodeDir);

  await vscode.workspace.fs.writeFile(mcpJsonPath, Buffer.from(newText));
  ext.outputChannel.appendLine(`Wrote .vscode/mcp.json with HTTP config: ${url}`);
}

// ---------- Copilot Agent Instructions ----------

// Stdio version (simpler, for local npx setup)
// Stdio version (local npx setup — memory-bank/ stored as local files)
const COPILOT_INSTRUCTIONS_STDIO = `# Memory Bank — Copilot Instructions

> Auto-generated by Memory Bank extension. Edit freely to customize.

This project uses the Memory Bank MCP server to persist context across AI sessions.
You have access to Memory Bank MCP tools. USE THEM — they are not optional.

## Mandatory Workflow (every task, no exceptions)

### START of task
1. ⚠️ CALL THIS FIRST. Call \`get_instructions\` MCP tool to learn the full tool catalog and workflow (once per session)
2. Call \`get_context_digest\` to load current project state (tasks, issues, progress, decisions)
3. Read \`system-patterns.md\` (via \`read_memory_bank_file\`) to understand project conventions, architecture patterns, and coding standards
4. Use \`graph_search\` to find relevant knowledge graph entities

### DURING task
5. Call \`track_progress\` after completing milestones
6. Call \`log_decision\` when making architectural/design choices
7. Call \`add_session_note\` for observations, blockers, or questions

### END of task
8. Call \`update_active_context\` with updated tasks, issues, and next steps
9. Call \`track_progress\` with a final summary of what was accomplished
10. Update knowledge graph entities if project structure changed
11. Update \`system-patterns.md\` if new patterns, architecture, or conventions were introduced

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

## Complete Tool Reference (47 tools)

### 1. Instructions
| Tool | Purpose |
|------|---------|
| \`get_instructions\` | Full tool catalog and workflow guide (call once per session) |

### 2. Context Loading (read-only)
| Tool | Purpose |
|------|---------|
| \`get_context_digest\` | Compact summary: recent progress, tasks, issues, decisions, graph overview |
| \`get_context_bundle\` | Full content of ALL core files in one response (larger payload) |
| \`get_memory_bank_status\` | Status of the Memory Bank (initialized, path, file list) |
| \`list_memory_bank_files\` | List all files in the Memory Bank directory |
| \`search_memory_bank\` | Full-text search across all Memory Bank files |
| \`get_current_mode\` | Current active mode and its guidelines |

### 3. File Operations
| Tool | Purpose |
|------|---------|
| \`read_memory_bank_file\` | Read a single file (returns content + ETag) |
| \`write_memory_bank_file\` | Write a single file (supports optimistic concurrency via ETag) |
| \`batch_read_files\` | Read multiple files in one request |
| \`batch_write_files\` | Write multiple files in one request |

### 4. Progress Tracking
| Tool | Purpose |
|------|---------|
| \`track_progress\` | Record a progress milestone (action + description) |
| \`add_progress_entry\` | Structured progress entry with type, summary, details, files, tags |
| \`update_active_context\` | Update tasks, issues, and next steps in active-context.md |
| \`update_tasks\` | Add, remove, or replace the tasks list |
| \`add_session_note\` | Add a timestamped note (observation, blocker, question, decision, todo) |
| \`log_decision\` | Log an architectural/design decision with context and alternatives |

### 5. Knowledge Graph
| Tool | Purpose |
|------|---------|
| \`get_targeted_context\` | **Preferred.** Budgeted context pack via KG + excerpts. Use before batch_read_files or get_context_bundle |
| \`graph_search\` | Search entities by query string |
| \`graph_open_nodes\` | Expand specific nodes and their neighborhood |
| \`graph_upsert_entity\` | Create or update an entity |
| \`graph_add_observation\` | Add an observation to an entity |
| \`graph_add_doc_pointer\` | Link an entity to a Memory Bank file + optional heading |
| \`graph_link_entities\` | Create a typed relationship between entities |
| \`graph_unlink_entities\` | Remove a relationship between entities |
| \`graph_delete_entity\` | Delete an entity |
| \`graph_delete_observation\` | Delete an observation |
| \`graph_rebuild\` | Rebuild the graph index |
| \`graph_compact\` | Compact the graph storage file |

### 6. Modes
| Tool | Purpose |
|------|---------|
| \`switch_mode\` | Switch to a mode: architect, code, ask, debug, or test |
| \`get_current_mode\` | Get the current mode and its behavioral guidelines |
| \`process_umb_command\` | Process an Update Memory Bank (UMB) command |
| \`complete_umb\` | Complete the UMB process |

### 7. Setup & Administration
| Tool | Purpose |
|------|---------|
| \`initialize_memory_bank\` | Create a new Memory Bank in a directory |
| \`set_memory_bank_path\` | Point to an existing Memory Bank directory |
| \`migrate_file_naming\` | Migrate files from camelCase to kebab-case |
| \`debug_mcp_config\` | Debug the current MCP configuration |

### 8. Backup & Restore
| Tool | Purpose |
|------|---------|
| \`create_backup\` | Create a timestamped backup of the Memory Bank |
| \`list_backups\` | List all available backups |
| \`restore_backup\` | Restore from a backup (auto-creates pre-restore backup) |

### 9. Multi-Store Management
| Tool | Purpose |
|------|---------|
| \`list_stores\` | List all registered Memory Bank stores |
| \`select_store\` | Switch the active store (by path or storeId) |
| \`register_store\` | Add a store to the persistent registry |
| \`unregister_store\` | Remove a store from the registry |

### 10. Sequential Thinking
| Tool | Purpose |
|------|---------|
| \`sequential_thinking\` | Record a numbered thinking step (raw thought NOT returned) |
| \`reset_sequential_thinking\` | Clear thinking session state |
| \`finalize_thinking_session\` | Persist thinking outcomes to Memory Bank (summary, decisions, tasks, progress) |

## Valid Modes
The ONLY valid modes are: **architect**, **code**, **ask**, **debug**, **test**.
There is NO "full" mode. All tools are available in every mode — modes control
behavior guidelines (via .clinerules files), not tool access.

## Important Notes
- Keep your internal thought process private. Do NOT share it in the conversation.

## ⚠️ CRITICAL: Never Access memory-bank/ Directly

AI agents/LLMs must **NEVER** directly edit files in the \`memory-bank/\` folder
using file editing tools (\`replace_string_in_file\`, \`create_file\`, \`write_file\`)
or terminal commands (\`echo\`, \`sed\`, \`cat >\`).

**All interactions with Memory Bank files MUST go through the MCP server tools:**

| Operation | Tool(s) |
|---|---|
| Read files | \`read_memory_bank_file\`, \`batch_read_files\`, \`get_context_bundle\` |
| Write files | \`write_memory_bank_file\`, \`batch_write_files\` |
| Update context | \`update_active_context\`, \`update_tasks\` |
| Track progress | \`track_progress\`, \`add_progress_entry\` |
| Log decisions | \`log_decision\` |
| Session notes | \`add_session_note\` |
| Knowledge graph | \`graph_upsert_entity\`, \`graph_add_observation\`, \`graph_link_entities\`, etc. |
| Search | \`search_memory_bank\`, \`graph_search\` |

**Why?** The MCP server guarantees file integrity via ETag concurrency control,
atomic writes, content validation, and event logging. Direct edits bypass all of
these and can corrupt the Memory Bank state.
`;

// HTTP version (Docker/Postgres/Supabase — memory bank stored in database)
const COPILOT_INSTRUCTIONS_HTTP = `# Memory Bank — Copilot Instructions

> Auto-generated by Memory Bank extension. Edit freely to customize.

This project uses the Memory Bank MCP server (HTTP mode) to persist context across AI sessions.
Data is stored in a remote database, not as local files.
You have access to Memory Bank MCP tools. USE THEM — they are not optional.

## Mandatory Workflow (every task, no exceptions)

### START of task
1. ⚠️ CALL THIS FIRST. Call \`get_instructions\` MCP tool to learn the full tool catalog and workflow (once per session)
2. Call \`get_context_digest\` to load current project state (tasks, issues, progress, decisions)
3. Read \`system-patterns.md\` (via \`read_memory_bank_file\`) to understand project conventions, architecture patterns, and coding standards
4. Use \`graph_search\` to find relevant knowledge graph entities

### DURING task
5. Call \`track_progress\` after completing milestones
6. Call \`log_decision\` when making architectural/design choices
7. Call \`add_session_note\` for observations, blockers, or questions

### END of task
8. Call \`update_active_context\` with updated tasks, issues, and next steps
9. Call \`track_progress\` with a final summary of what was accomplished
10. Update knowledge graph entities if project structure changed
11. Update \`system-patterns.md\` if new patterns, architecture, or conventions were introduced

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

## Complete Tool Reference (47 tools)

### 1. Instructions
| Tool | Purpose |
|------|---------|
| \`get_instructions\` | Full tool catalog and workflow guide (call once per session) |

### 2. Context Loading (read-only)
| Tool | Purpose |
|------|---------|
| \`get_context_digest\` | Compact summary: recent progress, tasks, issues, decisions, graph overview |
| \`get_context_bundle\` | Full content of ALL core files in one response (larger payload) |
| \`get_memory_bank_status\` | Status of the Memory Bank (initialized, path, file list) |
| \`list_memory_bank_files\` | List all files in the Memory Bank directory |
| \`search_memory_bank\` | Full-text search across all Memory Bank files |
| \`get_current_mode\` | Current active mode and its guidelines |

### 3. File Operations
| Tool | Purpose |
|------|---------|
| \`read_memory_bank_file\` | Read a single file (returns content + ETag) |
| \`write_memory_bank_file\` | Write a single file (supports optimistic concurrency via ETag) |
| \`batch_read_files\` | Read multiple files in one request |
| \`batch_write_files\` | Write multiple files in one request |

### 4. Progress Tracking
| Tool | Purpose |
|------|---------|
| \`track_progress\` | Record a progress milestone (action + description) |
| \`add_progress_entry\` | Structured progress entry with type, summary, details, files, tags |
| \`update_active_context\` | Update tasks, issues, and next steps in active-context.md |
| \`update_tasks\` | Add, remove, or replace the tasks list |
| \`add_session_note\` | Add a timestamped note (observation, blocker, question, decision, todo) |
| \`log_decision\` | Log an architectural/design decision with context and alternatives |

### 5. Knowledge Graph
| Tool | Purpose |
|------|---------|
| \`get_targeted_context\` | **Preferred.** Budgeted context pack via KG + excerpts. Use before batch_read_files or get_context_bundle |
| \`graph_search\` | Search entities by query string |
| \`graph_open_nodes\` | Expand specific nodes and their neighborhood |
| \`graph_upsert_entity\` | Create or update an entity |
| \`graph_add_observation\` | Add an observation to an entity |
| \`graph_add_doc_pointer\` | Link an entity to a Memory Bank file + optional heading |
| \`graph_link_entities\` | Create a typed relationship between entities |
| \`graph_unlink_entities\` | Remove a relationship between entities |
| \`graph_delete_entity\` | Delete an entity |
| \`graph_delete_observation\` | Delete an observation |
| \`graph_rebuild\` | Rebuild the graph index |
| \`graph_compact\` | Compact the graph storage file |

### 6. Modes
| Tool | Purpose |
|------|---------|
| \`switch_mode\` | Switch to a mode: architect, code, ask, debug, or test |
| \`get_current_mode\` | Get the current mode and its behavioral guidelines |
| \`process_umb_command\` | Process an Update Memory Bank (UMB) command |
| \`complete_umb\` | Complete the UMB process |

### 7. Setup & Administration
| Tool | Purpose |
|------|---------|
| \`initialize_memory_bank\` | Create a new Memory Bank in a directory |
| \`set_memory_bank_path\` | Point to an existing Memory Bank directory |
| \`migrate_file_naming\` | Migrate files from camelCase to kebab-case |
| \`debug_mcp_config\` | Debug the current MCP configuration |

### 8. Backup & Restore
| Tool | Purpose |
|------|---------|
| \`create_backup\` | Create a timestamped backup of the Memory Bank |
| \`list_backups\` | List all available backups |
| \`restore_backup\` | Restore from a backup (auto-creates pre-restore backup) |

### 9. Multi-Store Management
| Tool | Purpose |
|------|---------|
| \`list_stores\` | List all registered Memory Bank stores |
| \`select_store\` | Switch the active store (by path or storeId) |
| \`register_store\` | Add a store to the persistent registry |
| \`unregister_store\` | Remove a store from the registry |

### 10. Sequential Thinking
| Tool | Purpose |
|------|---------|
| \`sequential_thinking\` | Record a numbered thinking step (raw thought NOT returned) |
| \`reset_sequential_thinking\` | Clear thinking session state |
| \`finalize_thinking_session\` | Persist thinking outcomes to Memory Bank (summary, decisions, tasks, progress) |

## Valid Modes
The ONLY valid modes are: **architect**, **code**, **ask**, **debug**, **test**.
There is NO "full" mode. All tools are available in every mode — modes control
behavior guidelines (via .clinerules files), not tool access.

## Important Notes
- Keep your internal thought process private. Do NOT share it in the conversation.

## ⚠️ CRITICAL: Never Access memory-bank/ Directly

AI agents/LLMs must **NEVER** directly edit files in the \`memory-bank/\` folder
using file editing tools (\`replace_string_in_file\`, \`create_file\`, \`write_file\`)
or terminal commands (\`echo\`, \`sed\`, \`cat >\`).

**All interactions with Memory Bank files MUST go through the MCP server tools:**

| Operation | Tool(s) |
|---|---|
| Read files | \`read_memory_bank_file\`, \`batch_read_files\`, \`get_context_bundle\` |
| Write files | \`write_memory_bank_file\`, \`batch_write_files\` |
| Update context | \`update_active_context\`, \`update_tasks\` |
| Track progress | \`track_progress\`, \`add_progress_entry\` |
| Log decisions | \`log_decision\` |
| Session notes | \`add_session_note\` |
| Knowledge graph | \`graph_upsert_entity\`, \`graph_add_observation\`, \`graph_link_entities\`, etc. |
| Search | \`search_memory_bank\`, \`graph_search\` |

**Why?** The MCP server guarantees file integrity via ETag concurrency control,
atomic writes, content validation, and event logging. Direct edits bypass all of
these and can corrupt the Memory Bank state.
`;

async function createCopilotAgentInstructions(version: 'stdio' | 'http'): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage('Open a folder first.');
    return;
  }

  const githubDir = vscode.Uri.joinPath(workspaceFolders[0].uri, '.github');
  const instructionsPath = vscode.Uri.joinPath(githubDir, 'copilot-instructions.md');

  // Ensure .github directory exists
  await vscode.workspace.fs.createDirectory(githubDir);

  // Select the appropriate content based on version
  const content = version === 'stdio' ? COPILOT_INSTRUCTIONS_STDIO : COPILOT_INSTRUCTIONS_HTTP;
  const versionLabel = version === 'stdio' ? 'stdio (local npx)' : 'HTTP (Docker/Postgres)';

  // Check if file already exists
  let existingContent = '';
  try {
    const bytes = await vscode.workspace.fs.readFile(instructionsPath);
    existingContent = Buffer.from(bytes).toString('utf-8');
  } catch {
    // Doesn't exist yet — will create fresh
  }

  if (existingContent) {
    // Check if memory bank section is already present
    if (existingContent.includes('Memory Bank')) {
      const choice = await vscode.window.showWarningMessage(
        '.github/copilot-instructions.md already contains Memory Bank instructions.',
        `Replace with ${versionLabel} Version`,
        'Open File',
        'Cancel',
      );
      if (choice === 'Open File') {
        const doc = await vscode.workspace.openTextDocument(instructionsPath);
        await vscode.window.showTextDocument(doc);
        return;
      }
      if (choice !== `Replace with ${versionLabel} Version`) {
        return;
      }
      // Remove existing Memory Bank section (from header to end or next top-level heading)
      const mbStart = existingContent.indexOf('# Memory Bank');
      if (mbStart !== -1) {
        // Find the next top-level heading after the Memory Bank section
        const afterMbStart = existingContent.slice(mbStart + 1);
        const nextH1 = afterMbStart.search(/^# (?!Memory Bank)/m);
        if (nextH1 !== -1) {
          // Another top-level section follows — remove only the Memory Bank part
          existingContent = existingContent.slice(0, mbStart).trimEnd() + '\n\n' + afterMbStart.slice(nextH1);
        } else {
          // Memory Bank section goes to the end of file
          existingContent = existingContent.slice(0, mbStart).trimEnd();
        }
      }
    }

    // Append Memory Bank instructions to existing content
    const separator = existingContent.length > 0 ? '\n\n' : '';
    const finalContent = existingContent + separator + content;
    await vscode.workspace.fs.writeFile(instructionsPath, Buffer.from(finalContent));

    ext.outputChannel.appendLine(`Appended Memory Bank instructions (${versionLabel}) to existing .github/copilot-instructions.md`);
  } else {
    // No existing file — write fresh
    await vscode.workspace.fs.writeFile(instructionsPath, Buffer.from(content));
    ext.outputChannel.appendLine(`Created .github/copilot-instructions.md (${versionLabel})`);
  }

  // Open the file
  const doc = await vscode.workspace.openTextDocument(instructionsPath);
  await vscode.window.showTextDocument(doc);

  vscode.window.showInformationMessage(
    `Copilot agent instructions ready (${versionLabel})! GitHub Copilot will now use Memory Bank MCP in every conversation.`,
  );
}
