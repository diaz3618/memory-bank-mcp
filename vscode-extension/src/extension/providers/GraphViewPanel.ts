/**
 * Graph View Panel - STUB
 * 
 * Graph visualization removed in v1.1.0.
 * Server v0.5.0 has no graph tools.
 */

import * as vscode from 'vscode';
import { MemoryBankService } from '../services/MemoryBankService';

export class GraphViewPanel {
  public static currentPanel: GraphViewPanel | undefined;
  public static readonly viewType = 'memoryBank.graphView';

  public static createOrShow(extensionUri: vscode.Uri, memoryBankService: MemoryBankService) {
    vscode.window.showInformationMessage('Graph view is not available in this server version.');
  }
}
