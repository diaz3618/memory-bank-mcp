/**
 * Minimal vscode module mock for vitest.
 *
 * Only stubs the APIs that our testable modules actually import.
 * This file is loaded as a setupFile so `vi.mock` is applied before any import.
 */

import { vi } from 'vitest';

/* ---------- Stub classes / enums ---------- */

class MockEventEmitter {
  private listeners: Array<(...args: unknown[]) => void> = [];
  event = (cb: (...args: unknown[]) => void) => {
    this.listeners.push(cb);
    return { dispose: () => {} };
  };
  fire(...args: unknown[]) {
    this.listeners.forEach(cb => cb(...args));
  }
  dispose() {
    this.listeners = [];
  }
}

class MockTreeItem {
  label: string;
  constructor(label: string) {
    this.label = label;
  }
}

class MockThemeIcon {
  id: string;
  constructor(id: string) {
    this.id = id;
  }
}

class MockThemeColor {
  id: string;
  constructor(id: string) {
    this.id = id;
  }
}

class MockUri {
  scheme: string;
  path: string;
  constructor(scheme: string, path: string) {
    this.scheme = scheme;
    this.path = path;
  }
  static file(path: string) {
    return new MockUri('file', path);
  }
  static joinPath(base: MockUri, ...segments: string[]) {
    return new MockUri(base.scheme, [base.path, ...segments].join('/'));
  }
}

const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };

/* ---------- Module mock ---------- */

const configValues: Record<string, unknown> = {};

vi.mock('vscode', () => ({
  EventEmitter: MockEventEmitter,
  TreeItem: MockTreeItem,
  ThemeIcon: MockThemeIcon,
  ThemeColor: MockThemeColor,
  Uri: MockUri,
  TreeItemCollapsibleState,
  StatusBarAlignment: { Left: 1, Right: 2 },
  workspace: {
    name: 'test-workspace',
    getConfiguration: vi.fn((_section?: string) => ({
      get: vi.fn((key: string, defaultValue?: unknown) => configValues[key] ?? defaultValue),
      has: vi.fn(() => false),
      inspect: vi.fn(),
      update: vi.fn(),
    })),
    workspaceFolders: [{ uri: MockUri.file('/test/workspace'), name: 'test-workspace', index: 0 }],
    fs: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
  },
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      append: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    })),
    createStatusBarItem: vi.fn(() => ({
      text: '',
      tooltip: '',
      command: undefined,
      backgroundColor: undefined,
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    })),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showInputBox: vi.fn(),
    showQuickPick: vi.fn(),
    createTreeView: vi.fn(() => ({
      onDidChangeVisibility: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  commands: {
    registerCommand: vi.fn(),
    executeCommand: vi.fn(),
  },
}));

/* ---------- ext namespace mock ---------- */

vi.mock('../../extensionVariables', () => ({
  ext: {
    outputChannel: {
      appendLine: vi.fn(),
      append: vi.fn(),
      show: vi.fn(),
    },
    memoryBankService: {
      onDidRefresh: vi.fn(),
    },
    mcpClientManager: {
      isConnected: vi.fn(() => false),
      getConnectionStatus: vi.fn(() => ({ connected: false, mode: null })),
      onStatusChange: vi.fn(),
    },
  },
}));

/** Helper: set a config value that `workspace.getConfiguration().get()` returns. */
export function setMockConfig(key: string, value: unknown): void {
  configValues[key] = value;
}

/** Helper: reset all mock config values. */
export function clearMockConfig(): void {
  for (const key in configValues) {
    delete configValues[key];
  }
}
