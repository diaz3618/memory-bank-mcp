import * as crypto from 'crypto';

/**
 * Utilities for ETag-based optimistic concurrency control
 * 
 * ETags allow agents to safely read-modify-write Memory Bank files
 * by detecting concurrent modifications. This prevents data loss
 * when multiple agents work on the same files.
 */
export class ETagUtils {
  /**
   * Calculates an ETag for the given content
   * 
   * Uses SHA-256 hash of the content, truncated to 16 characters
   * for a practical balance between collision resistance and readability.
   * 
   * @param content - Content to calculate ETag for
   * @returns ETag string (16-character hex string)
   */
  static calculateETag(content: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(content);
    return hash.digest('hex').substring(0, 16);
  }

  /**
   * Validates that the given content matches the expected ETag
   * 
   * @param content - Content to validate
   * @param expectedETag - Expected ETag value
   * @returns True if the ETag matches, false otherwise
   */
  static validateETag(content: string, expectedETag: string): boolean {
    const actualETag = this.calculateETag(content);
    return actualETag === expectedETag;
  }

  /**
   * Creates a response object with content and ETag
   * 
   * @param content - File content
   * @returns Object with content and etag properties
   */
  static withETag(content: string): { content: string; etag: string } {
    return {
      content,
      etag: this.calculateETag(content),
    };
  }
}

/**
 * Error thrown when an ETag mismatch occurs during a write operation
 */
export class ETagMismatchError extends Error {
  public readonly expectedETag: string;
  public readonly actualETag: string;

  constructor(expectedETag: string, actualETag: string) {
    super(`ETag mismatch: expected ${expectedETag}, but file has ${actualETag}. The file was modified by another process.`);
    this.name = 'ETagMismatchError';
    this.expectedETag = expectedETag;
    this.actualETag = actualETag;
  }
}
