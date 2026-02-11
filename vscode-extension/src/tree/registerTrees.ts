/**
 * Register all tree views — Docker extension pattern.
 */

import * as vscode from 'vscode';
import { ext } from '../extensionVariables';
import { StatusTreeProvider } from './StatusTreeProvider';
import { FilesTreeProvider } from './FilesTreeProvider';
import { ActionsTreeProvider } from './ActionsTreeProvider';
import { ModeTreeProvider } from './ModeTreeProvider';
import { GraphTreeProvider } from './GraphTreeProvider';
import { StoresTreeProvider } from './StoresTreeProvider';
import { RemoteServersTreeProvider } from './RemoteServersTreeProvider';
import { HelpTreeProvider } from './HelpTreeProvider';

export interface TreeProviders {
  status: StatusTreeProvider;
  files: FilesTreeProvider;
  actions: ActionsTreeProvider;
  mode: ModeTreeProvider;
  graph: GraphTreeProvider;
  stores: StoresTreeProvider;
  remote: RemoteServersTreeProvider;
  help: HelpTreeProvider;
}

export function registerTrees(context: vscode.ExtensionContext): TreeProviders {
  const status = new StatusTreeProvider();
  const files = new FilesTreeProvider();
  const actions = new ActionsTreeProvider();
  const mode = new ModeTreeProvider();
  const graph = new GraphTreeProvider();
  const stores = new StoresTreeProvider();
  const remote = new RemoteServersTreeProvider();
  const help = new HelpTreeProvider();

  ext.statusTreeView = vscode.window.createTreeView('memoryBank.views.status', {
    treeDataProvider: status,
  });

  ext.filesTreeView = vscode.window.createTreeView('memoryBank.views.files', {
    treeDataProvider: files,
  });

  ext.actionsTreeView = vscode.window.createTreeView('memoryBank.views.actions', {
    treeDataProvider: actions,
  });

  ext.modeTreeView = vscode.window.createTreeView('memoryBank.views.mode', {
    treeDataProvider: mode,
  });

  ext.graphTreeView = vscode.window.createTreeView('memoryBank.views.graph', {
    treeDataProvider: graph,
  });

  ext.storesTreeView = vscode.window.createTreeView('memoryBank.views.stores', {
    treeDataProvider: stores,
  });

  ext.remoteTreeView = vscode.window.createTreeView('memoryBank.views.remote', {
    treeDataProvider: remote,
  });

  ext.helpTreeView = vscode.window.createTreeView('memoryBank.views.help', {
    treeDataProvider: help,
  });

  // Register disposables
  context.subscriptions.push(
    ext.statusTreeView,
    ext.filesTreeView,
    ext.actionsTreeView,
    ext.modeTreeView,
    ext.graphTreeView,
    ext.storesTreeView,
    ext.remoteTreeView,
    ext.helpTreeView,
  );

  return { status, files, actions, mode, graph, stores, remote, help };
}
