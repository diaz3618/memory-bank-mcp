/**
 * VS Code API Wrapper for Webview
 * Safely acquires and wraps the VS Code API so it can only be called once.
 * Based on NetSmith/kudosflow patterns for reliable VS Code webview integration.
 */

import type { WebviewMessage } from './types';

/** VS Code webview API interface */
interface VSCodeAPI {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

/**
 * Wrapper class that safely handles VS Code API acquisition.
 * The API can only be acquired once per webview, so we use a singleton pattern.
 */
class VSCodeAPIWrapper {
  private readonly api: VSCodeAPI | undefined;

  constructor() {
    // Check if running inside VS Code webview context
    // acquireVsCodeApi is provided by VS Code's webview runtime
    if (typeof acquireVsCodeApi === 'function') {
      this.api = acquireVsCodeApi();
    }
  }

  /**
   * Send a message to the extension host
   */
  postMessage(message: WebviewMessage): void {
    if (this.api) {
      this.api.postMessage(message);
    } else {
      console.warn('VSCode API not available - postMessage ignored:', message);
    }
  }

  /**
   * Get persisted state from the webview
   */
  getState(): unknown {
    return this.api?.getState();
  }

  /**
   * Persist state in the webview
   */
  setState(state: unknown): void {
    this.api?.setState(state);
  }

  /**
   * Check if running in VS Code webview context
   */
  isAvailable(): boolean {
    return this.api !== undefined;
  }
}

// Singleton instance - acquired once on module load
export const vscode = new VSCodeAPIWrapper();

// Type declaration for the global acquireVsCodeApi function
declare function acquireVsCodeApi(): VSCodeAPI;
