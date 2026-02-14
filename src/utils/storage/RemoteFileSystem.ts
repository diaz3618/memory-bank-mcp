import { FileSystemInterface } from './FileSystemInterface.js';
import { logger } from '../LogManager.js';
import { SshUtils } from '../SshUtils.js';
import * as path from 'path';

/**
 * Remote file system implementation
 * 
 * This class implements the FileSystemInterface using SSH to communicate with a remote server.
 */
export class RemoteFileSystem implements FileSystemInterface {
  private baseDir: string;
  private sshUtils: SshUtils;

  /**
   * Creates a new RemoteFileSystem instance
   * 
   * @param baseDir - Base directory for file operations on the remote server
   * @param sshKeyPath - Path to the SSH private key file
   * @param remoteUser - Username for the remote server
   * @param remoteHost - Hostname or IP address of the remote server
   * @param options - Optional SSH configuration (debugMode, strictHostKeyChecking)
   */
  constructor(
    baseDir: string, 
    sshKeyPath: string, 
    remoteUser: string, 
    remoteHost: string,
    options?: { debugMode?: boolean; strictHostKeyChecking?: boolean }
  ) {
    this.baseDir = baseDir;
    this.sshUtils = new SshUtils(sshKeyPath, remoteUser, remoteHost, baseDir, options);
  }

  /**
   * Gets the full POSIX path for a relative path
   * Uses POSIX path joining regardless of host OS to ensure remote paths are correct
   * 
   * @param relativePath - Relative path
   * @returns Full POSIX path
   */
  private getFullPath(relativePath: string): string {
    // Always use POSIX path joining for remote paths (Unix-style forward slashes)
    return path.posix.join(this.baseDir, relativePath);
  }

  /**
   * Checks if a file or directory exists
   * 
   * @param relativePath - Relative path to check
   * @returns True if the path exists, false otherwise
   */
  async fileExists(relativePath: string): Promise<boolean> {
    return this.sshUtils.exists(relativePath);
  }

  /**
   * Checks if a path is a directory
   * 
   * @param relativePath - Relative path to check
   * @returns True if the path is a directory, false otherwise
   */
  async isDirectory(relativePath: string): Promise<boolean> {
    return this.sshUtils.isDirectory(relativePath);
  }

  /**
   * Checks if a path is a file
   * 
   * @param relativePath - Relative path to check
   * @returns True if the path is a file, false otherwise
   */
  async isFile(relativePath: string): Promise<boolean> {
    return this.sshUtils.isFile(relativePath);
  }

  /**
   * Ensures a directory exists, creating it if necessary
   * 
   * @param relativePath - Relative path to the directory
   */
  async ensureDirectory(relativePath: string): Promise<void> {
    return this.sshUtils.createDirectory(relativePath);
  }

  /**
   * Reads a file's contents
   * 
   * @param relativePath - Relative path to the file
   * @returns The file contents as a string
   */
  async readFile(relativePath: string): Promise<string> {
    return this.sshUtils.readFile(relativePath);
  }

  /**
   * Writes content to a file
   * 
   * @param relativePath - Relative path to the file
   * @param content - Content to write
   */
  async writeFile(relativePath: string, content: string): Promise<void> {
    return this.sshUtils.writeFile(relativePath, content);
  }

  /**
   * Appends content to a file over SSH
   * 
   * Falls back to read + writeFile when native append is not available.
   * 
   * @param relativePath - Relative path to the file
   * @param content - Content to append
   */
  async appendFile(relativePath: string, content: string): Promise<void> {
    // SshUtils has no dedicated appendFile — fall back to read-modify-write.
    // The in-process write lock in GraphStore already serializes callers,
    // so this is safe for our single-process use-case.
    const existing = await this.sshUtils.readFile(relativePath);
    const newContent = existing.endsWith('\n') ? existing + content : existing + '\n' + content;
    return this.sshUtils.writeFile(relativePath, newContent);
  }

  /**
   * Lists files in a directory
   * 
   * @param relativePath - Relative path to the directory
   * @returns Array of file names
   */
  async listFiles(relativePath: string): Promise<string[]> {
    return this.sshUtils.listFiles(relativePath);
  }

  /**
   * Deletes a file or directory
   * 
   * @param relativePath - Relative path to delete
   */
  async delete(relativePath: string): Promise<void> {
    return this.sshUtils.deleteFile(relativePath);
  }

  /**
   * Copies a file or directory
   * 
   * @param sourceRelativePath - Relative source path
   * @param destRelativePath - Relative destination path
   */
  async copy(sourceRelativePath: string, destRelativePath: string): Promise<void> {
    return this.sshUtils.copy(sourceRelativePath, destRelativePath);
  }

  /**
   * Gets the base directory for file operations
   * 
   * @returns The base directory path
   */
  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Tests the SSH connection to the remote server
   * 
   * @returns True if connection is successful, false otherwise
   */
  async testConnection(): Promise<boolean> {
    return this.sshUtils.testConnection();
  }
} 