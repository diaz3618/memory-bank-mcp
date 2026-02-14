import fs from 'fs-extra';
import path from 'path';
import { EventEmitter } from 'events';
import yaml from 'js-yaml';
import { mcpRulesTemplates } from './McpRulesTemplates.js';
import os from 'os';
import { ValidationResult } from '../types/index.js';
import { McpRuleBase, MemoryBankConfig } from '../types/rules.js';
import { logger } from './LogManager.js';

/**
 * Class responsible for loading and monitoring external .mcprules files
 * (previously called .clinerules files, renamed for MCP-server independence)
 */
export class ExternalRulesLoader extends EventEmitter {
  private projectDir: string;
  private rules: Map<string, McpRuleBase> = new Map();
  private watchers: fs.FSWatcher[] = [];
  
  /**
   * Creates a new instance of the external rules loader
   * @param projectDir Project directory (default: current directory)
   */
  constructor(projectDir?: string) {
    super();
    this.projectDir = projectDir || process.cwd();
    logger.debug('ExternalRulesLoader', `Initialized with project directory: ${this.projectDir}`);
  }

  /**
   * Gets a writable directory for storing .mcprules files
   * Uses only the specified project directory without fallbacks
   * @returns A writable directory path
   */
  private async getWritableDirectory(): Promise<string> {
    // Use only the project directory
    const targetDir = this.projectDir;
    
    try {
      await fs.access(targetDir, fs.constants.W_OK);
      return targetDir;
    } catch (error) {
      logger.error('ExternalRulesLoader', `Project directory ${targetDir} is not writable`);
      throw new Error(`Project directory ${targetDir} is not writable`);
    }
  }

  /**
   * Validates that all required .mcprules files exist.
   * Does NOT auto-create missing files — use createMissingMcpRules() explicitly.
   * Also checks for legacy .clinerules files for backward compatibility.
   * @returns Validation result with missing and existing files
   */
  async validateRequiredFiles(): Promise<ValidationResult> {
    const modes = ['architect', 'ask', 'code', 'debug', 'test'];
    const missingFiles: string[] = [];
    const existingFiles: string[] = [];
    
    // Get a writable directory for .mcprules files
    let targetDir: string;
    try {
      targetDir = await this.getWritableDirectory();
    } catch {
      // If not writable, just check project dir
      targetDir = this.projectDir;
    }
    
    // Check for files in both project directory and fallback directory
    // Also check for legacy .clinerules files
    for (const mode of modes) {
      const mcpRulesFilename = `.mcprules-${mode}`;
      const legacyFilename = `.clinerules-${mode}`;
      const projectMcpRulesPath = path.join(this.projectDir, mcpRulesFilename);
      const projectLegacyPath = path.join(this.projectDir, legacyFilename);
      const fallbackMcpRulesPath = path.join(targetDir, mcpRulesFilename);
      const fallbackLegacyPath = path.join(targetDir, legacyFilename);
      
      if (await fs.pathExists(projectMcpRulesPath) || 
          await fs.pathExists(projectLegacyPath) ||
          await fs.pathExists(fallbackMcpRulesPath) ||
          await fs.pathExists(fallbackLegacyPath)) {
        existingFiles.push(mcpRulesFilename);
      } else {
        missingFiles.push(mcpRulesFilename);
      }
    }
    
    if (missingFiles.length > 0) {
      logger.debug('ExternalRulesLoader', `Missing .mcprules files (will not auto-create): ${missingFiles.join(', ')}`);
    }
    
    return {
      valid: missingFiles.length === 0,
      missingFiles,
      existingFiles
    };
  }

  /**
   * Detects and loads all .mcprules files in the project directory
   * Also supports legacy .clinerules files for backward compatibility
   */
  async detectAndLoadRules(): Promise<Map<string, McpRuleBase>> {
    const modes = ['architect', 'ask', 'code', 'debug', 'test'];
    
    // Validate required files and create missing ones
    const validation = await this.validateRequiredFiles();
    if (!validation.valid) {
      logger.debug('ExternalRulesLoader', `Some .mcprules files not found (optional): ${validation.missingFiles.join(', ')}`);
    }
    
    // Clear existing watchers
    this.stopWatching();
    
    // Clear existing rules
    this.rules.clear();
    
    // Get the fallback directory
    const fallbackDir = await this.getWritableDirectory();
    
    for (const mode of modes) {
      const mcpRulesFilename = `.mcprules-${mode}`;
      const legacyFilename = `.clinerules-${mode}`;
      const projectMcpRulesPath = path.join(this.projectDir, mcpRulesFilename);
      const projectLegacyPath = path.join(this.projectDir, legacyFilename);
      const fallbackMcpRulesPath = path.join(fallbackDir, mcpRulesFilename);
      const fallbackLegacyPath = path.join(fallbackDir, legacyFilename);
      
      try {
        // First try to load from project directory (.mcprules)
        if (await fs.pathExists(projectMcpRulesPath)) {
          const content = await fs.readFile(projectMcpRulesPath, 'utf8');
          const rule = this.parseRuleContent(content);
          
          if (rule && rule.mode === mode) {
            this.rules.set(mode, rule);
            logger.debug('ExternalRulesLoader', `Loaded ${mcpRulesFilename} rules from project directory`);
            
            // Set up watcher for this file
            this.watchRuleFile(projectMcpRulesPath, mode);
          } else {
            logger.warn('ExternalRulesLoader', `Invalid rule format in ${mcpRulesFilename} (project directory)`);
          }
        }
        // Try legacy .clinerules in project directory
        else if (await fs.pathExists(projectLegacyPath)) {
          const content = await fs.readFile(projectLegacyPath, 'utf8');
          const rule = this.parseRuleContent(content);
          
          if (rule && rule.mode === mode) {
            this.rules.set(mode, rule);
            logger.debug('ExternalRulesLoader', `Loaded legacy ${legacyFilename} rules (consider renaming to ${mcpRulesFilename})`);
            
            // Set up watcher for this file
            this.watchRuleFile(projectLegacyPath, mode);
          } else {
            logger.warn('ExternalRulesLoader', `Invalid rule format in ${legacyFilename} (project directory)`);
          }
        }
        // If not found in project directory, try fallback directory (.mcprules)
        else if (await fs.pathExists(fallbackMcpRulesPath)) {
          const content = await fs.readFile(fallbackMcpRulesPath, 'utf8');
          const rule = this.parseRuleContent(content);
          
          if (rule && rule.mode === mode) {
            this.rules.set(mode, rule);
            logger.debug('ExternalRulesLoader', `Loaded ${mcpRulesFilename} rules from fallback directory`);
            
            // Set up watcher for this file
            this.watchRuleFile(fallbackMcpRulesPath, mode);
          } else {
            logger.warn('ExternalRulesLoader', `Invalid rule format in ${mcpRulesFilename} (fallback directory)`);
          }
        }
        // Finally try legacy .clinerules in fallback directory
        else if (await fs.pathExists(fallbackLegacyPath)) {
          const content = await fs.readFile(fallbackLegacyPath, 'utf8');
          const rule = this.parseRuleContent(content);
          
          if (rule && rule.mode === mode) {
            this.rules.set(mode, rule);
            logger.debug('ExternalRulesLoader', `Loaded legacy ${legacyFilename} from fallback (consider renaming to ${mcpRulesFilename})`);
            
            // Set up watcher for this file
            this.watchRuleFile(fallbackLegacyPath, mode);
          } else {
            logger.warn('ExternalRulesLoader', `Invalid rule format in ${legacyFilename} (fallback directory)`);
          }
        }
      } catch (error) {
        logger.warn('ExternalRulesLoader', `Error loading rules for mode '${mode}': ${error}`);
      }
    }
    
    return this.rules;
  }
  
  /**
   * Parses the content of a rule file
   * @param content File content
   * @returns Parsed rule object or null if invalid
   */
  private parseRuleContent(content: string): McpRuleBase | null {
    try {
      // First try to parse as JSON
      const rule = JSON.parse(content);
      
      // Basic validation
      if (!rule.mode || !rule.instructions || !Array.isArray(rule.instructions.general)) {
        return null;
      }
      
      return rule;
    } catch (jsonError) {
      // If not valid JSON, try to parse as YAML
      try {
        const rule = yaml.load(content) as McpRuleBase;
        
        // Basic validation
        if (!rule.mode || !rule.instructions || !Array.isArray(rule.instructions.general)) {
          return null;
        }
        
        return rule;
      } catch (yamlError) {
        console.error('Failed to parse rule content as JSON or YAML:', yamlError);
        return null;
      }
    }
  }
  
  /**
   * Sets up a watcher for a rule file
   * @param filePath File path
   * @param mode Mode associated with the file
   */
  private watchRuleFile(filePath: string, mode: string): void {
    const watcher = fs.watch(filePath, async (eventType) => {
      if (eventType === 'change') {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          const rule = this.parseRuleContent(content);
          
          if (rule && rule.mode === mode) {
            this.rules.set(mode, rule);
            this.emit('ruleChanged', mode, rule);
            logger.debug('ExternalRulesLoader', `Updated ${path.basename(filePath)} rules`);
          }
        } catch (error) {
          logger.error('ExternalRulesLoader', `Error updating ${path.basename(filePath)}: ${error}`);
        }
      }
    });
    
    this.watchers.push(watcher);
  }
  
  /**
   * Stops watching all rule files
   */
  stopWatching(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
  }
  
  /**
   * Gets the rules for a specific mode
   * @param mode Mode name
   * @returns Rules for the specified mode or null if not found
   */
  getRulesForMode(mode: string): McpRuleBase | null {
    return this.rules.get(mode) || null;
  }
  
  /**
   * Checks if a specific mode is available
   * @param mode Mode name
   * @returns true if the mode is available, false otherwise
   */
  hasModeRules(mode: string): boolean {
    return this.rules.has(mode);
  }
  
  /**
   * Gets all available modes
   * @returns Array with the names of available modes
   */
  getAvailableModes(): string[] {
    return Array.from(this.rules.keys());
  }
  
  /**
   * Cleans up all resources
   */
  dispose(): void {
    this.stopWatching();
    this.removeAllListeners();
    this.rules.clear();
  }

  /**
   * Creates missing .mcprules files
   * @param missingFiles Array of missing file names
   * @returns Array of created file names
   */
  async createMissingMcpRules(missingFiles: string[]): Promise<string[]> {
    const createdFiles: string[] = [];
    
    // Get a writable directory for .mcprules files
    const targetDir = await this.getWritableDirectory();
    
    for (const filename of missingFiles) {
      const mode = filename.replace('.mcprules-', '');
      const template = mcpRulesTemplates[mode];
      
      if (template) {
        // Use only the path received via argument, without adding a folder
        const filePath = path.join(targetDir, filename);
        
        try {
          await fs.writeFile(filePath, template);
          createdFiles.push(filename);
          logger.debug('ExternalRulesLoader', `Created ${filename} in ${targetDir}`);
        } catch (error) {
          logger.error('ExternalRulesLoader', `Failed to create ${filename}: ${error}`);
        }
      } else {
        logger.warn('ExternalRulesLoader', `No template available for ${filename}`);
      }
    }
    
    return createdFiles;
  }

  /**
   * @deprecated Use createMissingMcpRules instead
   */
  async createMissingClinerules(missingFiles: string[]): Promise<string[]> {
    return this.createMissingMcpRules(missingFiles);
  }
}