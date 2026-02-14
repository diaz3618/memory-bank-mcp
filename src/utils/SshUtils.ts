import * as fs from 'fs';
import { execFile as execFileCallback, ExecException } from 'child_process';
import * as util from 'util';
import { logger } from './LogManager.js';

// Type for the exec callback function
type ExecCallback = (error: ExecException | null, stdout: string, stderr: string) => void;

/**
 * Escapes a string for safe use inside single quotes in a POSIX shell.
 * The approach: replace every `'` with `'\''` (end quote, escaped quote, start quote),
 * then wrap the whole thing in single quotes.
 */
function shellEscapeSingleQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

/**
 * Utility class for SSH operations
 * 
 * Provides methods for interacting with remote servers via SSH.
 */
export class SshUtils {
  private sshKeyPath: string;
  private remoteUser: string;
  private remoteHost: string;
  private remotePath: string;
  private debugMode: boolean;
  private strictHostKeyChecking: boolean;

  /**
   * Creates a new SshUtils instance
   * 
   * @param sshKeyPath - Path to the SSH private key file
   * @param remoteUser - Username for the remote server
   * @param remoteHost - Hostname or IP address of the remote server
   * @param remotePath - Base path on the remote server for memory bank storage
   * @param options - Optional configuration (debugMode, strictHostKeyChecking)
   */
  constructor(
    sshKeyPath: string, 
    remoteUser: string, 
    remoteHost: string, 
    remotePath: string,
    options?: { debugMode?: boolean; strictHostKeyChecking?: boolean }
  ) {
    // Validate remoteUser and remoteHost to prevent SSH option injection
    SshUtils.validateSshIdentifier(remoteUser, 'remoteUser');
    SshUtils.validateSshIdentifier(remoteHost, 'remoteHost');

    this.sshKeyPath = sshKeyPath;
    this.remoteUser = remoteUser;
    this.remoteHost = remoteHost;
    this.remotePath = remotePath;
    this.debugMode = options?.debugMode ?? false;
    // Default to strict host key checking for security, but allow opt-out
    this.strictHostKeyChecking = options?.strictHostKeyChecking ?? true;
  }

  /**
   * Validates an SSH identifier (user or host) to prevent option injection.
   * Rejects values that start with `-` or contain whitespace/control characters.
   */
  private static validateSshIdentifier(value: string, label: string): void {
    if (!value || value.length === 0) {
      throw new Error(`${label} must not be empty`);
    }
    if (value.startsWith('-')) {
      throw new Error(`${label} must not start with '-' (potential SSH option injection)`);
    }
    // eslint-disable-next-line no-control-regex
    if (/[\s\x00-\x1f\x7f]/.test(value)) {
      throw new Error(`${label} must not contain whitespace or control characters`);
    }
  }

  /**
   * Executes an SSH command on the remote server.
   *
   * Uses `execFile` with an argv array so the local shell is never invoked,
   * preventing command-injection via user-controlled values (key path, host,
   * user, remote command). The *remote* command is passed as a single SSH
   * positional argument and interpreted by the remote shell.
   *
   * @param command - Command to execute on the remote side
   * @returns Promise that resolves with command output
   */
  private async executeCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Build SSH args as an array – no shell interpolation on the local side
      const args: string[] = [];

      if (this.debugMode) {
        args.push('-v');
      }

      args.push('-i', this.sshKeyPath);

      const hostKeyOption = this.strictHostKeyChecking
        ? 'accept-new'
        : 'no';
      args.push('-o', `StrictHostKeyChecking=${hostKeyOption}`);
      args.push('-o', 'ConnectTimeout=10');
      args.push('-o', 'ServerAliveInterval=30');
      args.push('-o', 'ServerAliveCountMax=3');
      // Use '--' to stop option parsing and prevent option injection via
      // remoteUser/remoteHost values (defense in depth alongside constructor validation)
      args.push('--');
      args.push(`${this.remoteUser}@${this.remoteHost}`);
      // The remote command is a single positional arg; ssh sends it to the
      // remote shell for interpretation.
      args.push(command);

      logger.debug('SshUtils', `Executing SSH command: ssh ${args.join(' ')}`);

      // Set a timeout for the command execution (30 seconds)
      const timeoutMs = 30000;
      let timeoutId: NodeJS.Timeout | null = null;

      // Execute SSH command via execFile (no local shell)
      const childProcess = execFileCallback('ssh', args, (error, stdout, stderr) => {
        // Clear the timeout if it was set
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        if (error) {
          logger.error('SshUtils', `SSH command error: ${error.message}`);
          logger.error('SshUtils', `SSH command stderr: ${stderr}`);
          logger.error('SshUtils', `SSH command stdout: ${stdout}`);
          logger.error('SshUtils', `SSH args: ${JSON.stringify(args)}`);
          logger.error('SshUtils', `Error details: ${JSON.stringify(error)}`);
          reject(error);
          return;
        }

        if (stderr) {
          logger.warn('SshUtils', `SSH command stderr: ${stderr}`);
        }

        logger.debug('SshUtils', `SSH command stdout: ${stdout}`);
        resolve(stdout);
      });

      // Set up the timeout
      timeoutId = setTimeout(() => {
        if (childProcess) {
          childProcess.kill();
        }
        logger.error('SshUtils', `SSH command timed out after ${timeoutMs}ms`);
        reject(new Error(`SSH command timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Checks if a remote path exists (file or directory)
   * 
   * @param remotePath - Path to check (relative to base remote path)
   * @returns True if the path exists, false otherwise
   */
  async exists(remotePath: string): Promise<boolean> {
    try {
      const fullRemotePath = `${this.remotePath}/${remotePath}`;
      const escaped = shellEscapeSingleQuote(fullRemotePath);
      const command = `[ -e ${escaped} ] && echo "EXISTS" || echo "NOT_EXISTS"`;
      const result = await this.executeCommand(command);
      return result.trim() === 'EXISTS';
    } catch (error) {
      logger.error('SshUtils', `Error checking if remote path exists: ${error}`);
      return false;
    }
  }

  /**
   * Checks if a remote directory exists
   * 
   * @param dirPath - Path to check
   * @returns True if the directory exists, false otherwise
   */
  async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const remoteDirPath = `${this.remotePath}/${dirPath}`;
      const escaped = shellEscapeSingleQuote(remoteDirPath);
      const command = `[ -d ${escaped} ] && echo "EXISTS" || echo "NOT_EXISTS"`;
      const result = await this.executeCommand(command);
      return result.trim() === 'EXISTS';
    } catch (error) {
      logger.error('SshUtils', `Error checking if remote directory exists: ${error}`);
      return false;
    }
  }

  /**
   * Checks if a remote path is a file
   * 
   * @param filePath - Path to check
   * @returns True if the path is a file, false otherwise
   */
  async isFile(filePath: string): Promise<boolean> {
    try {
      const remoteFilePath = `${this.remotePath}/${filePath}`;
      const escaped = shellEscapeSingleQuote(remoteFilePath);
      const command = `[ -f ${escaped} ] && echo "IS_FILE" || echo "NOT_FILE"`;
      const result = await this.executeCommand(command);
      return result.trim() === 'IS_FILE';
    } catch (error) {
      logger.error('SshUtils', `Error checking if remote path is a file: ${error}`);
      return false;
    }
  }

  /**
   * Checks if a remote path is a directory
   * 
   * @param dirPath - Path to check
   * @returns True if the path is a directory, false otherwise
   */
  async isDirectory(dirPath: string): Promise<boolean> {
    return this.directoryExists(dirPath);
  }

  /**
   * Creates a directory on the remote server
   * 
   * @param dirPath - Path to create
   * @throws Error if directory creation fails
   */
  async createDirectory(dirPath: string): Promise<void> {
    try {
      const remoteDirPath = `${this.remotePath}/${dirPath}`;
      const escaped = shellEscapeSingleQuote(remoteDirPath);
      const command = `mkdir -p ${escaped}`;
      await this.executeCommand(command);
    } catch (error) {
      logger.error('SshUtils', `Failed to create remote directory: ${error}`);
      throw new Error(`Failed to create remote directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Reads a file from the remote server
   * 
   * @param filePath - Path to the file
   * @returns The file contents as a string
   * @throws Error if file reading fails
   */
  async readFile(filePath: string): Promise<string> {
    try {
      const remoteFilePath = `${this.remotePath}/${filePath}`;
      const escaped = shellEscapeSingleQuote(remoteFilePath);
      const command = `cat ${escaped}`;
      return await this.executeCommand(command);
    } catch (error) {
      logger.error('SshUtils', `Failed to read remote file: ${error}`);
      throw new Error(`Failed to read remote file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Writes content to a file on the remote server atomically
   * 
   * Uses a write-to-temp-then-mv pattern for atomic writes.
   * This prevents file corruption if the connection drops during write.
   * 
   * @param filePath - Path to the file (relative to remotePath)
   * @param content - Content to write
   * @throws Error if file writing fails
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      const remoteFilePath = `${this.remotePath}/${filePath}`;
      const timestamp = Date.now();
      const tempFilePath = `${remoteFilePath}.${timestamp}.tmp`;
      
      // Ensure the directory exists first
      const dirPath = remoteFilePath.substring(0, remoteFilePath.lastIndexOf('/'));
      const escapedDir = shellEscapeSingleQuote(dirPath);
      const mkdirCommand = `mkdir -p ${escapedDir}`;
      await this.executeCommand(mkdirCommand);
      
      // Use base64 encoding to safely transfer the content
      // This avoids issues with shell interpretation of special characters
      const contentBuffer = Buffer.from(content);
      const base64Content = contentBuffer.toString('base64');
      
      // Write to temp file first — base64 payload is safe ASCII, so single-quote
      // escaping the file path is sufficient.
      const escapedTemp = shellEscapeSingleQuote(tempFilePath);
      const escapedFinal = shellEscapeSingleQuote(remoteFilePath);
      const writeCommand = `echo '${base64Content}' | base64 -d > ${escapedTemp}`;
      await this.executeCommand(writeCommand);
      
      // Verify temp file was written successfully
      const checkTempCommand = `[ -f ${escapedTemp} ] && echo "FILE_EXISTS" || echo "FILE_NOT_EXISTS"`;
      const checkTempResult = await this.executeCommand(checkTempCommand);
      
      if (checkTempResult.trim() !== "FILE_EXISTS") {
        throw new Error(`Failed to write temp file: ${tempFilePath}`);
      }
      
      // Atomically move temp file to final location
      const mvCommand = `mv ${escapedTemp} ${escapedFinal}`;
      await this.executeCommand(mvCommand);
      
      // Verify final file exists
      const checkCommand = `[ -f ${escapedFinal} ] && echo "FILE_EXISTS" || echo "FILE_NOT_EXISTS"`;
      const checkResult = await this.executeCommand(checkCommand);
      
      if (checkResult.trim() !== "FILE_EXISTS") {
        throw new Error(`Failed to verify file was created: ${remoteFilePath}`);
      }
    } catch (error) {
      logger.error('SshUtils', `Failed to write to remote file: ${error}`);
      throw new Error(`Failed to write to remote file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Lists files in a remote directory
   * 
   * @param dirPath - Path to the directory
   * @returns Array of file names
   * @throws Error if directory reading fails
   */
  async listFiles(dirPath: string): Promise<string[]> {
    try {
      const remoteDirPath = `${this.remotePath}/${dirPath}`;
      const escaped = shellEscapeSingleQuote(remoteDirPath);
      const command = `ls -A ${escaped} | tr '\n' ' '`;
      const result = await this.executeCommand(command);
      return result ? result.split(' ').filter(Boolean) : [];
    } catch (error) {
      logger.error('SshUtils', `Failed to list files in remote directory: ${error}`);
      throw new Error(`Failed to list files in remote directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Deletes a file on the remote server
   * 
   * @param filePath - Path to the file
   * @throws Error if file deletion fails
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      const remoteFilePath = `${this.remotePath}/${filePath}`;
      const escaped = shellEscapeSingleQuote(remoteFilePath);
      const command = `rm ${escaped}`;
      await this.executeCommand(command);
    } catch (error) {
      logger.error('SshUtils', `Failed to delete remote file: ${error}`);
      throw new Error(`Failed to delete remote file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Copies a file or directory on the remote server
   * 
   * @param sourcePath - Source path
   * @param destPath - Destination path
   * @throws Error if copy operation fails
   */
  async copy(sourcePath: string, destPath: string): Promise<void> {
    try {
      const remoteSourcePath = `${this.remotePath}/${sourcePath}`;
      const remoteDestPath = `${this.remotePath}/${destPath}`;
      const escapedSource = shellEscapeSingleQuote(remoteSourcePath);
      const escapedDest = shellEscapeSingleQuote(remoteDestPath);
      const command = `cp -r ${escapedSource} ${escapedDest}`;
      await this.executeCommand(command);
    } catch (error) {
      logger.error('SshUtils', `Failed to copy from ${sourcePath} to ${destPath}: ${error}`);
      throw new Error(`Failed to copy from ${sourcePath} to ${destPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Tests the SSH connection to the remote server
   * 
   * @returns True if connection is successful, false otherwise
   */
  async testConnection(): Promise<boolean> {
    try {
      // First check if the SSH key file exists
      try {
        const fsPromises = require('fs').promises;
        const stats = await fsPromises.stat(this.sshKeyPath);
        if (!stats.isFile()) {
          logger.error('SshUtils', `SSH key is not a file: ${this.sshKeyPath}`);
          return false;
        }
      } catch (fileError) {
        logger.error('SshUtils', `SSH key file does not exist or cannot be accessed: ${this.sshKeyPath}`);
        logger.error('SshUtils', `Error details: ${fileError}`);
        return false;
      }
      
      const command = 'echo "Connection successful"';
      logger.info('SshUtils', `Testing SSH connection to ${this.remoteUser}@${this.remoteHost} using key ${this.sshKeyPath}`);
      logger.info('SshUtils', `Remote path: ${this.remotePath}`);
      
      const result = await this.executeCommand(command);
      logger.info('SshUtils', `SSH test result: "${result}"`);
      
      // Check if the remote path exists
      try {
        const escapedRemotePath = shellEscapeSingleQuote(this.remotePath);
        const pathCheckCommand = `[ -d ${escapedRemotePath} ] && echo "PATH_EXISTS" || echo "PATH_NOT_EXISTS"`;
        const pathResult = await this.executeCommand(pathCheckCommand);
        logger.info('SshUtils', `Remote path check result: "${pathResult}"`);
        
        if (pathResult.trim() !== "PATH_EXISTS") {
          logger.info('SshUtils', `Warning: Remote path ${this.remotePath} does not exist. Attempting to create it...`);
          const mkdirCommand = `mkdir -p ${escapedRemotePath}`;
          await this.executeCommand(mkdirCommand);
          logger.info('SshUtils', `Created remote path ${this.remotePath}`);
        }
      } catch (pathError) {
        logger.error('SshUtils', `Error checking remote path: ${pathError}`);
      }
      
      // The connection test is successful if we received any response
      return result.includes('Connection successful');
    } catch (error) {
      logger.error('SshUtils', `Failed to connect to remote server: ${error}`);
      if (error instanceof Error) {
        logger.error('SshUtils', `Error stack: ${error.stack}`);
      }
      return false;
    }
  }
} 