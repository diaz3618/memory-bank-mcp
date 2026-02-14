/**
 * Type definitions for rules in Memory Bank MCP
 * 
 * This file contains interfaces related to MCP rules and mode management.
 * Note: These were previously called "clinerules" but renamed for MCP-server independence.
 */

/**
 * Interface for Memory Bank configuration in MCP rules
 */
export interface MemoryBankConfig {
  /** Files to read from the Memory Bank */
  files_to_read?: string[];
  /** Files to update in the Memory Bank */
  files_to_update?: string[];
  /** Custom templates for Memory Bank files */
  templates?: Record<string, string>;
  /** Additional configuration options */
  options?: {
    /** Whether to auto-initialize the Memory Bank if not found */
    auto_initialize?: boolean;
    /** Whether to create missing files */
    create_missing_files?: boolean;
    /** Whether to backup before updates */
    backup_before_update?: boolean;
  };
}

/**
 * Interface to represent the basic structure of MCP rules
 */
export interface McpRuleBase {
  /** Mode identifier (architect, ask, code, debug, test) */
  mode: string;
  /** Instructions for the mode */
  instructions: {
    /** General instructions for the mode */
    general: string[];
    /** Update Memory Bank (UMB) configuration */
    umb?: {
      /** Mode that triggers UMB */
      trigger: string;
      /** Instructions for UMB */
      instructions: string[];
      /** Whether to override file restrictions */
      override_file_restrictions: boolean;
    };
    /** Memory Bank configuration */
    memory_bank?: MemoryBankConfig;
  };
  /** Mode triggers configuration */
  mode_triggers?: Record<string, Array<{ condition: string }>>;
}

// Backward compatibility alias
export type ClineruleBase = McpRuleBase;

/**
 * Interface for mode state
 */
export interface ModeState {
  /** Name of the current mode */
  name: string;
  /** Status of the Memory Bank */
  memoryBankStatus: 'ACTIVE' | 'INACTIVE';
  /** Whether UMB mode is active */
  isUmbActive?: boolean;
  /** Rules for the current mode */
  rules?: McpRuleBase | null;
} 