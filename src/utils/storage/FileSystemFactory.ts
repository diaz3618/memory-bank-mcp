import { FileSystemInterface } from './FileSystemInterface.js';
import { LocalFileSystem } from './LocalFileSystem.js';
import { PostgresFileSystem } from './PostgresFileSystem.js';
import type { DatabaseManager } from '../DatabaseManager.js';
import { logger } from '../LogManager.js';

/**
 * Factory for creating file system implementations
 * 
 * Provides factory methods for creating local or Postgres-backed file system implementations.
 */
export class FileSystemFactory {
  /**
   * Creates a local file system implementation
   * 
   * @param baseDir - Base directory for file operations
   * @returns A LocalFileSystem instance
   */
  static createLocalFileSystem(baseDir: string): FileSystemInterface {
    logger.debug('FileSystemFactory', `Creating local file system with base directory: ${baseDir}`);
    return new LocalFileSystem(baseDir);
  }

  /**
   * Creates a Postgres-backed file system implementation
   *
   * @param db - DatabaseManager instance
   * @param projectId - Project UUID for scoping documents
   * @param userId - User UUID for RLS context
   * @param baseDir - Virtual base directory (optional)
   * @returns A PostgresFileSystem instance
   */
  static createPostgresFileSystem(
    db: DatabaseManager,
    projectId: string,
    userId: string,
    baseDir: string = '',
  ): FileSystemInterface {
    logger.debug(
      'FileSystemFactory',
      `Creating Postgres file system for project: ${projectId}, user: ${userId}`,
    );
    return new PostgresFileSystem(db, projectId, userId, baseDir);
  }
}