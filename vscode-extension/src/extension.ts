/**
 * Memory Bank MCP VS Code Extension
 * 
 * Provides file management and status display for the memory-bank-mcp server.
 * Features:
 * - Sidebar with file tree and status
 * - Commands for managing files and settings
 * - Status bar showing connection info
 * 
 * Matched to memory-bank-mcp server v0.5.0:
 * - No graph tools (no entities, relations, etc.)
 * - Must call initialize_memory_bank(path) before any other tool
 * - Status uses isComplete (not initialized)
 */

import * as vscode from 'vscode';
import { SidebarProvider } from './extension/providers/SidebarProvider';
import { MemoryBankService } from './extension/services/MemoryBankService';
import { StatusBarManager } from './extension/services/StatusBarManager';
import { mcpClientManager, ConnectionConfig, StdioConnectionConfig, HttpConnectionConfig } from './extension/mcp';

let statusBarManager: StatusBarManager | undefined;

export async function activate(context: vscode.ExtensionContext) {
	console.log('Memory Bank MCP extension is now active!');

	// Create output channel for debugging
	const outputChannel = vscode.window.createOutputChannel('Memory Bank');
	context.subscriptions.push(outputChannel);
	outputChannel.appendLine('Memory Bank MCP extension activated');

	// Initialize MCP connection based on settings
	const config = vscode.workspace.getConfiguration('memoryBank');
	const connectionMode = config.get<'stdio' | 'http'>('connectionMode', 'stdio');
	
	let connectionConfig: ConnectionConfig;
	
	if (connectionMode === 'stdio') {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		const cwd = config.get<string>('stdio.cwd') || 
			(workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : undefined);
		
		// Get memory bank path from settings or default to workspace root
		// NOTE: Server needs the PROJECT ROOT, it auto-detects memory-bank subfolder
		const memoryBankPath = config.get<string>('path') || 
			(workspaceFolders && workspaceFolders.length > 0 
				? workspaceFolders[0].uri.fsPath
				: undefined);
		
		connectionConfig = {
			mode: 'stdio',
			command: config.get<string>('stdio.command', 'npx'),
			args: config.get<string[]>('stdio.args', ['memory-bank-mcp']),
			cwd,
			env: memoryBankPath ? { MEMORY_BANK_ROOT: memoryBankPath } : undefined,
		} as StdioConnectionConfig;
		
		outputChannel.appendLine(`Memory Bank path: ${memoryBankPath}`);
	} else {
		connectionConfig = {
			mode: 'http',
			baseUrl: config.get<string>('http.baseUrl', 'http://localhost:3000'),
			authToken: config.get<string>('http.authToken'),
		} as HttpConnectionConfig;
	}

	// Initialize services
	const memoryBankService = new MemoryBankService(outputChannel);
	statusBarManager = new StatusBarManager(context);

	// Create the sidebar provider
	const sidebarProvider = new SidebarProvider(context.extensionUri, memoryBankService, context, outputChannel);

	// Register the webview provider
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			SidebarProvider.viewType,
			sidebarProvider,
			{
				webviewOptions: {
					retainContextWhenHidden: true
				}
			}
		)
	);

	// Register all commands
	registerCommands(context, memoryBankService, sidebarProvider, outputChannel);

	// Connect to MCP server
	try {
		outputChannel.appendLine(`Connecting to MCP server (${connectionMode} mode)...`);
		await mcpClientManager.connect(connectionConfig);
		outputChannel.appendLine('Connected to MCP server');
		statusBarManager.updateConnectionStatus(true);
		
		// Initialize memory bank service
		await memoryBankService.initialize();
		
		// Update status bar
		const status = await memoryBankService.getStatus();
		statusBarManager.updateStoreInfo(status.isComplete ? 'ready' : 'incomplete');
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		outputChannel.appendLine(`Failed to connect to MCP server: ${errorMessage}`);
		statusBarManager.updateConnectionStatus(false, errorMessage);
		
		// Show error but don't fail activation
		vscode.window.showWarningMessage(
			`Memory Bank: Could not connect to MCP server. ${errorMessage}`,
			'Retry',
			'Configure'
		).then(selection => {
			if (selection === 'Retry') {
				vscode.commands.executeCommand('memoryBank.reconnect');
			} else if (selection === 'Configure') {
				vscode.commands.executeCommand('workbench.action.openSettings', 'memoryBank');
			}
		});
	}

	// Listen for MCP status changes
	mcpClientManager.onStatusChange((status) => {
		statusBarManager?.updateConnectionStatus(status.connected, status.error);
		if (status.connected) {
			memoryBankService.initialize().catch(console.error);
		}
	});

	// Watch for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(async (e) => {
			if (e.affectsConfiguration('memoryBank.connectionMode') ||
				e.affectsConfiguration('memoryBank.stdio') ||
				e.affectsConfiguration('memoryBank.http') ||
				e.affectsConfiguration('memoryBank.path')) {
				// Reconnect with new settings
				await vscode.commands.executeCommand('memoryBank.reconnect');
			}
		})
	);

	// Store workspace root for quick access
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (workspaceFolders && workspaceFolders.length > 0) {
		context.workspaceState.update('workspaceRoot', workspaceFolders[0].uri.fsPath);
	}

	// Listen for workspace folder changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			const folders = vscode.workspace.workspaceFolders;
			if (folders && folders.length > 0) {
				context.workspaceState.update('workspaceRoot', folders[0].uri.fsPath);
			}
		})
	);

	// Register disposables
	context.subscriptions.push(memoryBankService);
	context.subscriptions.push(statusBarManager);
}

function registerCommands(
	context: vscode.ExtensionContext,
	memoryBankService: MemoryBankService,
	sidebarProvider: SidebarProvider,
	outputChannel: vscode.OutputChannel
): void {
	// Open sidebar
	context.subscriptions.push(
		vscode.commands.registerCommand('memoryBank.openSidebar', () => {
			vscode.commands.executeCommand('workbench.view.extension.memory-bank');
		})
	);

	// Refresh data
	context.subscriptions.push(
		vscode.commands.registerCommand('memoryBank.refreshData', async () => {
			try {
				await memoryBankService.refresh();
				sidebarProvider.refresh();
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to refresh: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}
		})
	);

	// Open file commands - open ACTUAL files on disk, not untitled docs
	context.subscriptions.push(
		vscode.commands.registerCommand('memoryBank.openFile', async (file: string) => {
			try {
				const mbPath = await memoryBankService.getMemoryBankPath();
				if (mbPath) {
					const filePath = vscode.Uri.file(`${mbPath}/${file}`);
					try {
						await vscode.workspace.fs.stat(filePath);
						const doc = await vscode.workspace.openTextDocument(filePath);
						await vscode.window.showTextDocument(doc);
					} catch {
						// File doesn't exist on disk, fall back to MCP read
						outputChannel.appendLine(`File not found on disk: ${filePath.fsPath}, reading via MCP`);
						const content = await memoryBankService.readFile(file);
						const doc = await vscode.workspace.openTextDocument({
							content,
							language: 'markdown',
						});
						await vscode.window.showTextDocument(doc);
					}
				} else {
					// No path, fall back to MCP read
					const content = await memoryBankService.readFile(file);
					const doc = await vscode.workspace.openTextDocument({
						content,
						language: 'markdown',
					});
					await vscode.window.showTextDocument(doc);
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to open file: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('memoryBank.openActiveContext', () => {
			vscode.commands.executeCommand('memoryBank.openFile', 'active-context.md');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('memoryBank.openProgress', () => {
			vscode.commands.executeCommand('memoryBank.openFile', 'progress.md');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('memoryBank.openDecisionLog', () => {
			vscode.commands.executeCommand('memoryBank.openFile', 'decision-log.md');
		})
	);

	// Connection status
	context.subscriptions.push(
		vscode.commands.registerCommand('memoryBank.showConnectionStatus', () => {
			const status = mcpClientManager.getStatus();
			if (status.connected) {
				vscode.window.showInformationMessage(
					`Memory Bank: Connected (${status.mode} mode)${status.serverVersion ? ` - Server v${status.serverVersion}` : ''}`
				);
			} else {
				vscode.window.showWarningMessage(
					`Memory Bank: Disconnected${status.error ? ` - ${status.error}` : ''}`
				);
			}
		})
	);

	// Reconnect
	context.subscriptions.push(
		vscode.commands.registerCommand('memoryBank.reconnect', async () => {
			try {
				await mcpClientManager.disconnect();
				
				const config = vscode.workspace.getConfiguration('memoryBank');
				const connectionMode = config.get<'stdio' | 'http'>('connectionMode', 'stdio');
				
				let connectionConfig: ConnectionConfig;
				
				if (connectionMode === 'stdio') {
					const workspaceFolders = vscode.workspace.workspaceFolders;
					const cwd = config.get<string>('stdio.cwd') || 
						(workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : undefined);
					
					// NOTE: Server needs PROJECT ROOT, auto-detects memory-bank subfolder
					const memoryBankPath = config.get<string>('path') || 
						(workspaceFolders && workspaceFolders.length > 0 
							? workspaceFolders[0].uri.fsPath
							: undefined);
					
					connectionConfig = {
						mode: 'stdio',
						command: config.get<string>('stdio.command', 'npx'),
						args: config.get<string[]>('stdio.args', ['memory-bank-mcp']),
						cwd,
						env: memoryBankPath ? { MEMORY_BANK_ROOT: memoryBankPath } : undefined,
					} as StdioConnectionConfig;
					
					outputChannel.appendLine(`Connecting with MEMORY_BANK_ROOT=${memoryBankPath}`);
				} else {
					connectionConfig = {
						mode: 'http',
						baseUrl: config.get<string>('http.baseUrl', 'http://localhost:3000'),
						authToken: config.get<string>('http.authToken'),
					} as HttpConnectionConfig;
				}
				
				await mcpClientManager.connect(connectionConfig);
				await memoryBankService.initialize();
				sidebarProvider.refresh();
				vscode.window.showInformationMessage('Memory Bank: Reconnected successfully');
			} catch (error) {
				const msg = error instanceof Error ? error.message : 'Unknown error';
				outputChannel.appendLine(`Reconnect failed: ${msg}`);
				vscode.window.showErrorMessage(`Memory Bank: Failed to reconnect - ${msg}`);
			}
		})
	);

	// Show Logs
	context.subscriptions.push(
		vscode.commands.registerCommand('memoryBank.showLogs', () => {
			outputChannel.show();
		})
	);

	// Set Memory Bank Path
	context.subscriptions.push(
		vscode.commands.registerCommand('memoryBank.setPath', async () => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			const defaultPath = workspaceFolders && workspaceFolders.length > 0 
				? workspaceFolders[0].uri.fsPath
				: '';

			const options: vscode.OpenDialogOptions = {
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				openLabel: 'Select Project Root (contains memory-bank folder)',
				defaultUri: defaultPath ? vscode.Uri.file(defaultPath) : undefined,
			};

			const result = await vscode.window.showOpenDialog(options);
			if (result && result.length > 0) {
				const selectedPath = result[0].fsPath;
				await vscode.workspace.getConfiguration('memoryBank').update('path', selectedPath, vscode.ConfigurationTarget.Workspace);
				outputChannel.appendLine(`Memory bank path set to: ${selectedPath}`);
				vscode.window.showInformationMessage(`Memory Bank path set to: ${selectedPath}. Reconnecting...`);
				await vscode.commands.executeCommand('memoryBank.reconnect');
			}
		})
	);
}

export async function deactivate() {
	console.log('Memory Bank MCP extension deactivated');
	await mcpClientManager.disconnect();
}
