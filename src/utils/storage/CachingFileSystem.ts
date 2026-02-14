import { FileSystemInterface } from './FileSystemInterface.js';
import { ETagUtils } from '../ETagUtils.js';
import { logger } from '../LogManager.js';

/**
 * Cache entry for a file
 */
interface CacheEntry {
  /** Cached file content */
  content: string;
  /** ETag for cache validation */
  etag: string;
  /** Timestamp when cached */
  cachedAt: number;
  /** Size in bytes for memory tracking */
  size: number;
}

/**
 * Configuration options for CachingFileSystem
 */
export interface CacheConfig {
  /** Maximum number of entries to cache (default: 100) */
  maxEntries?: number;
  /** Maximum total cache size in bytes (default: 10MB) */
  maxSize?: number;
  /** Time-to-live for cache entries in ms (default: 5 minutes) */
  ttlMs?: number;
  /** Whether to enable caching (default: true) */
  enabled?: boolean;
}

const DEFAULT_CONFIG: Required<CacheConfig> = {
  maxEntries: 100,
  maxSize: 10 * 1024 * 1024, // 10MB
  ttlMs: 5 * 60 * 1000, // 5 minutes
  enabled: true,
};

/**
 * Caching wrapper for FileSystemInterface
 * 
 * Provides read caching with configurable TTL, size limits, and LRU eviction.
 * Automatically invalidates cache on writes and deletes.
 * 
 * @example
 * ```typescript
 * const fs = new LocalFileSystem('/path/to/dir');
 * const cached = new CachingFileSystem(fs, { ttlMs: 60000 });
 * 
 * // First read fetches from disk
 * const content = await cached.readFile('file.md');
 * 
 * // Second read returns cached content
 * const content2 = await cached.readFile('file.md');
 * 
 * // Write invalidates cache
 * await cached.writeFile('file.md', 'new content');
 * ```
 */
export class CachingFileSystem implements FileSystemInterface {
  private cache: Map<string, CacheEntry> = new Map();
  private config: Required<CacheConfig>;
  private currentSize: number = 0;
  private accessOrder: string[] = [];

  /**
   * Creates a new CachingFileSystem
   * 
   * @param delegate - The underlying FileSystemInterface to wrap
   * @param config - Cache configuration options
   */
  constructor(
    private delegate: FileSystemInterface,
    config: CacheConfig = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.debug('CachingFileSystem', `Initialized with config: ${JSON.stringify(this.config)}`);
  }

  /**
   * Gets cache statistics
   */
  getCacheStats(): {
    entries: number;
    size: number;
    maxEntries: number;
    maxSize: number;
    enabled: boolean;
  } {
    return {
      entries: this.cache.size,
      size: this.currentSize,
      maxEntries: this.config.maxEntries,
      maxSize: this.config.maxSize,
      enabled: this.config.enabled,
    };
  }

  /**
   * Clears the entire cache
   */
  clearCache(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.currentSize = 0;
    logger.debug('CachingFileSystem', 'Cache cleared');
  }

  /**
   * Invalidates a specific cache entry
   */
  invalidate(path: string): void {
    const normalizedPath = this.normalizePath(path);
    const entry = this.cache.get(normalizedPath);
    if (entry) {
      this.currentSize -= entry.size;
      this.cache.delete(normalizedPath);
      this.accessOrder = this.accessOrder.filter(p => p !== normalizedPath);
      logger.debug('CachingFileSystem', `Invalidated cache for: ${normalizedPath}`);
    }
  }

  /**
   * Enables or disables caching
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (!enabled) {
      this.clearCache();
    }
  }

  private normalizePath(path: string): string {
    // Normalize path for consistent cache keys
    return path.replace(/\\/g, '/').replace(/\/+/g, '/');
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.cachedAt > this.config.ttlMs;
  }

  private updateAccessOrder(path: string): void {
    // Move to end (most recently used)
    this.accessOrder = this.accessOrder.filter(p => p !== path);
    this.accessOrder.push(path);
  }

  private evictIfNeeded(): void {
    // Evict expired entries first
    for (const [path, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.invalidate(path);
      }
    }

    // Evict LRU entries if still over limits
    while (
      (this.cache.size > this.config.maxEntries || this.currentSize > this.config.maxSize) &&
      this.accessOrder.length > 0
    ) {
      const lruPath = this.accessOrder[0];
      this.invalidate(lruPath);
    }
  }

  private cacheContent(path: string, content: string): void {
    if (!this.config.enabled) return;

    const normalizedPath = this.normalizePath(path);
    const size = Buffer.byteLength(content, 'utf-8');

    // Don't cache if single entry exceeds max size
    if (size > this.config.maxSize * 0.5) {
      logger.debug('CachingFileSystem', `Skipping cache for large file: ${normalizedPath} (${size} bytes)`);
      return;
    }

    // Evict to make room
    this.evictIfNeeded();

    const entry: CacheEntry = {
      content,
      etag: ETagUtils.calculateETag(content),
      cachedAt: Date.now(),
      size,
    };

    // Remove old entry if exists
    const oldEntry = this.cache.get(normalizedPath);
    if (oldEntry) {
      this.currentSize -= oldEntry.size;
    }

    this.cache.set(normalizedPath, entry);
    this.currentSize += size;
    this.updateAccessOrder(normalizedPath);

    logger.debug('CachingFileSystem', `Cached: ${normalizedPath} (${size} bytes)`);
  }

  private getCachedContent(path: string): string | null {
    if (!this.config.enabled) return null;

    const normalizedPath = this.normalizePath(path);
    const entry = this.cache.get(normalizedPath);

    if (!entry) return null;

    if (this.isExpired(entry)) {
      this.invalidate(normalizedPath);
      return null;
    }

    this.updateAccessOrder(normalizedPath);
    logger.debug('CachingFileSystem', `Cache hit: ${normalizedPath}`);
    return entry.content;
  }

  // FileSystemInterface implementation

  async fileExists(path: string): Promise<boolean> {
    return this.delegate.fileExists(path);
  }

  async isDirectory(path: string): Promise<boolean> {
    return this.delegate.isDirectory(path);
  }

  async ensureDirectory(path: string): Promise<void> {
    return this.delegate.ensureDirectory(path);
  }

  async readFile(path: string): Promise<string> {
    // Check cache first
    const cached = this.getCachedContent(path);
    if (cached !== null) {
      return cached;
    }

    // Fetch from delegate and cache
    const content = await this.delegate.readFile(path);
    this.cacheContent(path, content);
    return content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    // Write through to delegate
    await this.delegate.writeFile(path, content);

    // Invalidate and optionally re-cache
    this.invalidate(path);
    
    // Re-cache the new content
    this.cacheContent(path, content);
  }

  async appendFile(path: string, content: string): Promise<void> {
    // Delegate the append
    await this.delegate.appendFile(path, content);

    // Invalidate the cache for this path — the cached value is now stale
    // and the full content is unknown without a read.
    this.invalidate(path);
  }

  async listFiles(path: string): Promise<string[]> {
    // Directory listings are not cached (could change frequently)
    return this.delegate.listFiles(path);
  }

  async delete(path: string): Promise<void> {
    await this.delegate.delete(path);
    
    // Invalidate the specific path and any child paths
    const normalizedPath = this.normalizePath(path);
    for (const cachedPath of Array.from(this.cache.keys())) {
      if (cachedPath === normalizedPath || cachedPath.startsWith(normalizedPath + '/')) {
        this.invalidate(cachedPath);
      }
    }
  }

  async copy(sourcePath: string, destPath: string): Promise<void> {
    await this.delegate.copy(sourcePath, destPath);
    
    // Invalidate destination
    this.invalidate(destPath);
  }

  getBaseDir(): string {
    return this.delegate.getBaseDir();
  }

  /**
   * Gets the full path for a relative path
   */
  getFullPath(relativePath: string): string {
    if ('getFullPath' in this.delegate && typeof this.delegate.getFullPath === 'function') {
      return (this.delegate as { getFullPath(path: string): string }).getFullPath(relativePath);
    }
    // Fallback: join with base dir
    const baseDir = this.getBaseDir();
    return `${baseDir}/${relativePath}`.replace(/\/+/g, '/');
  }
}
