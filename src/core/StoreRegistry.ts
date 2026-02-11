/**
 * StoreRegistry — persistent multi-store registry backed by stores.json
 *
 * Implements knowledge-graph-plans.md Phase 2:
 * - Persistent store registry file (`stores.json`)
 * - Store discovery, registration, and lookup by storeId
 * - Thread-safe read/write with atomic file operations
 *
 * The registry lives at `<config-dir>/stores.json` where config-dir
 * defaults to the server's CWD. Each entry maps a storeId to its
 * filesystem path and metadata.
 */

import path from 'path';
import { FileUtils } from '../utils/FileUtils.js';
import { logger } from '../utils/LogManager.js';

// ============================================================================
// Types
// ============================================================================

export interface StoreRegistryEntry {
  /** Stable identifier (e.g., "my-project", "default") */
  storeId: string;
  /** Absolute path to the project root containing a memory-bank/ folder */
  projectPath: string;
  /** Kind of store */
  kind: 'local' | 'remote';
  /** ISO timestamp of last access */
  lastUsedAt: string;
  /** ISO timestamp of registration */
  registeredAt: string;
}

export interface StoreRegistryFile {
  /** Schema version for forward compat */
  version: 1;
  /** Currently selected storeId (null = use default) */
  selectedStoreId: string | null;
  /** Registered stores */
  stores: StoreRegistryEntry[];
}

const REGISTRY_FILENAME = 'stores.json';

const EMPTY_REGISTRY: StoreRegistryFile = {
  version: 1,
  selectedStoreId: null,
  stores: [],
};

// ============================================================================
// StoreRegistry
// ============================================================================

export class StoreRegistry {
  private readonly registryPath: string;
  private cache: StoreRegistryFile | null = null;

  /**
   * @param configDir Directory where stores.json will be stored (default: CWD)
   */
  constructor(configDir?: string) {
    const dir = configDir ?? process.cwd();
    this.registryPath = path.join(dir, REGISTRY_FILENAME);
  }

  // ---------- Read operations ----------

  /** Load the registry from disk (cached after first load within a session). */
  async load(): Promise<StoreRegistryFile> {
    if (this.cache) {
      return this.cache;
    }

    try {
      const exists = await FileUtils.fileExists(this.registryPath);
      if (!exists) {
        this.cache = { ...EMPTY_REGISTRY, stores: [] };
        return this.cache;
      }

      const raw = await FileUtils.readFile(this.registryPath);
      const parsed = JSON.parse(raw) as StoreRegistryFile;

      // Basic validation
      if (parsed.version !== 1 || !Array.isArray(parsed.stores)) {
        logger.warn('StoreRegistry', `Invalid stores.json format, starting fresh`);
        this.cache = { ...EMPTY_REGISTRY, stores: [] };
        return this.cache;
      }

      this.cache = parsed;
      return this.cache;
    } catch (error) {
      logger.error('StoreRegistry', `Failed to read stores.json: ${error}`);
      this.cache = { ...EMPTY_REGISTRY, stores: [] };
      return this.cache;
    }
  }

  /** Get all registered stores. */
  async listStores(): Promise<StoreRegistryEntry[]> {
    const registry = await this.load();
    return registry.stores;
  }

  /** Get a store by its storeId. Returns null if not found. */
  async getStore(storeId: string): Promise<StoreRegistryEntry | null> {
    const registry = await this.load();
    return registry.stores.find(s => s.storeId === storeId) ?? null;
  }

  /** Get the currently selected storeId. */
  async getSelectedStoreId(): Promise<string | null> {
    const registry = await this.load();
    return registry.selectedStoreId;
  }

  /** Resolve a storeId to its project path. Returns null if not registered. */
  async resolveStorePath(storeId: string): Promise<string | null> {
    const entry = await this.getStore(storeId);
    return entry?.projectPath ?? null;
  }

  // ---------- Write operations ----------

  /**
   * Register or update a store in the registry.
   * Upserts by storeId — if the storeId already exists, updates its fields.
   */
  async registerStore(entry: Omit<StoreRegistryEntry, 'registeredAt' | 'lastUsedAt'>): Promise<StoreRegistryEntry> {
    const registry = await this.load();
    const now = new Date().toISOString();
    const existing = registry.stores.findIndex(s => s.storeId === entry.storeId);

    const full: StoreRegistryEntry = {
      ...entry,
      registeredAt: existing >= 0 ? registry.stores[existing].registeredAt : now,
      lastUsedAt: now,
    };

    if (existing >= 0) {
      registry.stores[existing] = full;
    } else {
      registry.stores.push(full);
    }

    await this.save(registry);
    return full;
  }

  /** Remove a store from the registry by storeId. */
  async unregisterStore(storeId: string): Promise<boolean> {
    const registry = await this.load();
    const before = registry.stores.length;
    registry.stores = registry.stores.filter(s => s.storeId !== storeId);

    if (registry.stores.length === before) {
      return false; // Nothing removed
    }

    // Clear selection if it was the removed store
    if (registry.selectedStoreId === storeId) {
      registry.selectedStoreId = null;
    }

    await this.save(registry);
    return true;
  }

  /** Set the selected store. Pass null to clear selection (use default). */
  async selectStore(storeId: string | null): Promise<void> {
    const registry = await this.load();

    if (storeId !== null) {
      const entry = registry.stores.find(s => s.storeId === storeId);
      if (!entry) {
        throw new Error(`Store "${storeId}" not found in registry`);
      }
      entry.lastUsedAt = new Date().toISOString();
    }

    registry.selectedStoreId = storeId;
    await this.save(registry);
  }

  /** Touch a store's lastUsedAt timestamp. */
  async touchStore(storeId: string): Promise<void> {
    const registry = await this.load();
    const entry = registry.stores.find(s => s.storeId === storeId);
    if (entry) {
      entry.lastUsedAt = new Date().toISOString();
      await this.save(registry);
    }
  }

  // ---------- Persistence ----------

  /** Invalidate the in-memory cache (forces re-read on next access). */
  invalidateCache(): void {
    this.cache = null;
  }

  /** Write the registry to disk and update cache. */
  private async save(registry: StoreRegistryFile): Promise<void> {
    try {
      const dir = path.dirname(this.registryPath);
      await FileUtils.ensureDirectory(dir);
      await FileUtils.writeFile(this.registryPath, JSON.stringify(registry, null, 2));
      this.cache = registry;
    } catch (error) {
      logger.error('StoreRegistry', `Failed to write stores.json: ${error}`);
      throw error;
    }
  }
}
