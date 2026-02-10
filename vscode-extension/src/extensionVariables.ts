/**
 * Extension Variables
 * 
 * Central namespace for shared extension state, following the Docker extension pattern.
 * All tree views, services, and managers are stored here for cross-module access.
 */

import * as vscode from 'vscode';
import type { MemoryBankService } from './services/MemoryBankService';
import type { McpClientManager } from './mcp/McpClientManager';

export namespace ext {
  export let context: vscode.ExtensionContext;
  export let outputChannel: vscode.OutputChannel;

  // Services
  export let memoryBankService: MemoryBankService;
  export let mcpClientManager: McpClientManager;

  // Tree views
  export let statusTreeView: vscode.TreeView<vscode.TreeItem>;
  export let filesTreeView: vscode.TreeView<vscode.TreeItem>;
  export let actionsTreeView: vscode.TreeView<vscode.TreeItem>;
  export let modeTreeView: vscode.TreeView<vscode.TreeItem>;
  export let graphTreeView: vscode.TreeView<vscode.TreeItem>;
  export let storesTreeView: vscode.TreeView<vscode.TreeItem>;
  export let helpTreeView: vscode.TreeView<vscode.TreeItem>;

  // State
  export let initialized: boolean = false;
}
