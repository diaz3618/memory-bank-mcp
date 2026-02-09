/**
 * Type definitions for Memory Bank MCP
 * 
 * This file exports all the interfaces, types, constants, and type guards used in the Memory Bank MCP project.
 */

// Re-export interfaces from progress.ts
export * from './progress.js';

// Re-export interfaces from rules.ts
export * from './rules.js';

// Re-export utility types
export * from './utils.js';

// Re-export constants
export * from './constants.js';

// Re-export type guards
export * from './guards.js';

// Re-export graph types
export * from './graph.js';

/**
 * Interface for Memory Bank status
 */
export interface MemoryBankStatus {
  /** Path to the Memory Bank directory */
  path: string;
  /** List of files in the Memory Bank */
  files: string[];
  /** List of core files present in the Memory Bank */
  coreFilesPresent: string[];
  /** List of core files missing from the Memory Bank */
  missingCoreFiles: string[];
  /** Whether the Memory Bank is complete (all core files present) */
  isComplete: boolean;
  /** Language of the Memory Bank (always 'en' for English) */
  language: string;
  /** Last update time of the Memory Bank */
  lastUpdated?: Date;
}

/**
 * Interface for validation result
 */
export interface ValidationResult {
  /** Whether the validation passed */
  valid: boolean;
  /** List of missing files */
  missingFiles: string[];
  /** List of existing files */
  existingFiles: string[];
} 