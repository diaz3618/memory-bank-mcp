/**
 * Memory Bank MCP Extension — Entry Point
 *
 * Follows the Docker extension activation pattern:
 * 1. Set up ext namespace (output channel, context)
 * 2. Create services & managers
 * 3. Register trees, commands, copilot integration
 * 4. Connect to MCP server
 */

import * as vscode from 'vscode';
import { ext } from './extensionVariables';
import { McpClientManager } from './mcp/McpClientManager';
import { MemoryBankService } from './services/MemoryBankService';
import { registerTrees } from './tree/registerTrees';
import { registerCommands } from './commands/registerCommands';
import { registerChatParticipant, registerInstructionsTool } from './copilot';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // 1. Initialize ext namespace
  ext.context = context;
  ext.outputChannel = vscode.window.createOutputChannel('Memory Bank');
  context.subscriptions.push(ext.outputChannel);

  ext.outputChannel.appendLine('Memory Bank extension activating...');

  // 2. Create core services
  ext.mcpClientManager = new McpClientManager();
  ext.memoryBankService = new MemoryBankService();
  context.subscriptions.push(ext.mcpClientManager);
  context.subscriptions.push(ext.memoryBankService);

  // 3. Register tree views
  const trees = registerTrees(context);

  // 4. Register commands
  registerCommands(context, trees);

  // 5. Register Copilot integration
  try {
    registerChatParticipant(context);
    registerInstructionsTool(context);
    ext.outputChannel.appendLine('Copilot chat participant and instructions tool registered.');
  } catch (error) {
    ext.outputChannel.appendLine(`Copilot integration unavailable: ${error}`);
  }

  // 6. Wire service refresh to tree updates
  ext.memoryBankService.onDidRefresh(() => {
    trees.status.refresh();
    trees.files.refresh();
    trees.mode.refresh();
  });

  // 7. Connect to MCP server
  try {
    const config = ext.mcpClientManager.getConnectionConfig();
    await ext.mcpClientManager.connect(config);
    ext.outputChannel.appendLine('Connected to MCP server.');

    // Auto-initialize if configured
    const autoInit = vscode.workspace.getConfiguration('memoryBank').get<boolean>('autoInitialize', false);
    if (autoInit) {
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspacePath) {
        const mbConfig = vscode.workspace.getConfiguration('memoryBank');
        const configuredPath = mbConfig.get<string>('path');
        try {
          await ext.memoryBankService.initialize(configuredPath || workspacePath);
          ext.outputChannel.appendLine('Auto-initialized memory bank.');
        } catch (err) {
          ext.outputChannel.appendLine(`Auto-initialize failed: ${err}`);
        }
      }
    }

    // Initial refresh
    try {
      await ext.memoryBankService.refresh();
    } catch {
      ext.outputChannel.appendLine('Initial refresh skipped (memory bank may not be initialized yet).');
    }

    ext.initialized = true;
  } catch (error) {
    ext.outputChannel.appendLine(`MCP connection failed: ${error}`);
    ext.outputChannel.appendLine('Use "Memory Bank: Install Server" or "Memory Bank: Reconnect" to connect.');
  }

  // 8. Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('memoryBank')) {
        ext.outputChannel.appendLine('Configuration changed, reconnecting...');
        try {
          ext.memoryBankService.clearCache();
          const config = ext.mcpClientManager.getConnectionConfig();
          await ext.mcpClientManager.connect(config);
          await ext.memoryBankService.refresh();
          trees.status.refresh();
          trees.files.refresh();
          trees.mode.refresh();
          ext.outputChannel.appendLine('Reconnected after config change.');
        } catch (err) {
          ext.outputChannel.appendLine(`Reconnect after config change failed: ${err}`);
        }
      }
    }),
  );

  // 9. Status bar item
  const statusBarEnabled = vscode.workspace.getConfiguration('memoryBank').get<boolean>('statusBar.enabled', true);
  if (statusBarEnabled) {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    statusBarItem.command = 'memoryBank.showLogs';
    context.subscriptions.push(statusBarItem);

    const updateStatusBar = (connected: boolean) => {
      if (connected) {
        statusBarItem.text = '$(check) Memory Bank';
        statusBarItem.tooltip = 'Memory Bank: Connected';
        statusBarItem.backgroundColor = undefined;
      } else {
        statusBarItem.text = '$(error) Memory Bank';
        statusBarItem.tooltip = 'Memory Bank: Disconnected — click to view logs';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      }
      statusBarItem.show();
    };

    updateStatusBar(ext.mcpClientManager.isConnected());
    ext.mcpClientManager.onStatusChange((status) => {
      updateStatusBar(status.connected);
    });
  }

  // 10. Monitor connection status for tree updates
  ext.mcpClientManager.onStatusChange((status) => {
    ext.outputChannel.appendLine(`Connection status: ${status.connected ? 'connected' : 'disconnected'}`);
    trees.status.refresh();
  });

  ext.outputChannel.appendLine('Memory Bank extension activated.');
}

export function deactivate(): void {
  // Disposables are cleaned up via context.subscriptions
}
