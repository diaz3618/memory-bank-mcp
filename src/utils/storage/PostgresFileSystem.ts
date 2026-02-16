/**
 * PostgresFileSystem — FileSystemInterface backed by the `documents` table
 *
 * Maps the file-based abstraction to Postgres rows:
 *   path  → documents.path
 *   content → documents.content
 *
 * Directories are virtual — determined by path prefix queries.
 * RLS context is set per-transaction via DatabaseManager.queryWithContext().
 */

import type { FileSystemInterface } from './FileSystemInterface.js';
import type { DatabaseManager } from '../DatabaseManager.js';
import { LogManager } from '../LogManager.js';

const logger = LogManager.getInstance();

export class PostgresFileSystem implements FileSystemInterface {
  private readonly db: DatabaseManager;
  private readonly projectId: string;
  private readonly userId: string;
  private readonly baseDir: string;

  constructor(
    db: DatabaseManager,
    projectId: string,
    userId: string,
    baseDir: string = '',
  ) {
    this.db = db;
    this.projectId = projectId;
    this.userId = userId;
    this.baseDir = baseDir;
  }

  getBaseDir(): string {
    return this.baseDir;
  }

  private resolvePath(path: string): string {
    if (this.baseDir && !path.startsWith(this.baseDir)) {
      return `${this.baseDir}/${path}`.replace(/\/+/g, '/');
    }
    return path;
  }

  async fileExists(path: string): Promise<boolean> {
    const resolved = this.resolvePath(path);
    const result = await this.db.queryWithContext(
      this.userId,
      this.projectId,
      'SELECT 1 FROM documents WHERE project_id = $1 AND path = $2',
      [this.projectId, resolved],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async isDirectory(path: string): Promise<boolean> {
    // Directories are virtual — check if any document has this as a prefix
    const resolved = this.resolvePath(path);
    const prefix = resolved.endsWith('/') ? resolved : `${resolved}/`;
    const result = await this.db.queryWithContext(
      this.userId,
      this.projectId,
      'SELECT 1 FROM documents WHERE project_id = $1 AND path LIKE $2 LIMIT 1',
      [this.projectId, `${prefix}%`],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async ensureDirectory(_path: string): Promise<void> {
    // Directories are virtual in Postgres — no-op
  }

  async readFile(path: string): Promise<string> {
    const resolved = this.resolvePath(path);
    const result = await this.db.queryWithContext<{ content: string }>(
      this.userId,
      this.projectId,
      'SELECT content FROM documents WHERE project_id = $1 AND path = $2',
      [this.projectId, resolved],
    );
    if (!result.rows[0]) {
      throw new Error(`File not found: ${resolved}`);
    }
    return result.rows[0].content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    const resolved = this.resolvePath(path);
    await this.db.queryWithContext(
      this.userId,
      this.projectId,
      `INSERT INTO documents (project_id, path, content)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, path)
       DO UPDATE SET content = $3, version = documents.version + 1`,
      [this.projectId, resolved, content],
    );
  }

  async appendFile(path: string, content: string): Promise<void> {
    const resolved = this.resolvePath(path);
    // First try to append (update existing)
    const result = await this.db.queryWithContext(
      this.userId,
      this.projectId,
      `UPDATE documents
       SET content = content || $3, version = version + 1
       WHERE project_id = $1 AND path = $2`,
      [this.projectId, resolved, content],
    );
    // If no row was updated, create it
    if ((result.rowCount ?? 0) === 0) {
      await this.writeFile(path, content);
    }
  }

  async listFiles(path: string): Promise<string[]> {
    const resolved = this.resolvePath(path);
    const prefix = resolved ? (resolved.endsWith('/') ? resolved : `${resolved}/`) : '';

    const result = await this.db.queryWithContext<{ path: string }>(
      this.userId,
      this.projectId,
      `SELECT path FROM documents
       WHERE project_id = $1 AND path LIKE $2
       ORDER BY path`,
      [this.projectId, prefix ? `${prefix}%` : '%'],
    );

    // Return relative paths (strip prefix)
    return result.rows.map((row) => {
      if (prefix && row.path.startsWith(prefix)) {
        const relative = row.path.slice(prefix.length);
        // Only return immediate children (no deeper nesting)
        const slashIdx = relative.indexOf('/');
        return slashIdx === -1 ? relative : relative.slice(0, slashIdx + 1);
      }
      return row.path;
    }).filter((v, i, arr) => arr.indexOf(v) === i); // deduplicate directory entries
  }

  async delete(path: string): Promise<void> {
    const resolved = this.resolvePath(path);
    // Delete exact match and any children (if it's a "directory")
    await this.db.queryWithContext(
      this.userId,
      this.projectId,
      `DELETE FROM documents
       WHERE project_id = $1 AND (path = $2 OR path LIKE $3)`,
      [this.projectId, resolved, `${resolved}/%`],
    );
  }

  async copy(sourcePath: string, destPath: string): Promise<void> {
    const resolvedSrc = this.resolvePath(sourcePath);
    const resolvedDst = this.resolvePath(destPath);

    const content = await this.readFile(resolvedSrc);
    await this.writeFile(resolvedDst, content);
  }
}
