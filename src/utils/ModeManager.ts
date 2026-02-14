import { EventEmitter } from 'events';
import { ExternalRulesLoader } from './ExternalRulesLoader.js';
import type { McpRuleBase } from '../types/rules.js';

/**
 * Events emitted by ModeManager
 */
export enum ModeManagerEvent {
  MODE_CHANGED = 'modeChanged',
  MODE_TRIGGER_DETECTED = 'modeTriggerDetected',
  UMB_TRIGGERED = 'umbTriggered',
  UMB_COMPLETED = 'umbCompleted',
}

/**
 * Interface to represent the current mode state
 */
export interface ModeState {
  name: string;
  rules: McpRuleBase | null;
  isUmbActive: boolean;
  memoryBankStatus: 'ACTIVE' | 'INACTIVE';
}

/**
 * Class responsible for managing modes based on loaded rules
 */
export class ModeManager extends EventEmitter {
  private rulesLoader: ExternalRulesLoader;
  private currentMode: string = 'code'; // Default mode
  private isUmbActive: boolean = false;
  private memoryBankStatus: 'ACTIVE' | 'INACTIVE' = 'INACTIVE';
  
  /**
   * Creates a new instance of the mode manager
   * @param rulesLoader External rules loader
   */
  constructor(rulesLoader: ExternalRulesLoader) {
    super();
    this.rulesLoader = rulesLoader;
    
    // Set up listener for rule changes
    this.rulesLoader.on('ruleChanged', (mode, rule) => {
      if (mode === this.currentMode) {
        this.emit(ModeManagerEvent.MODE_CHANGED, this.getCurrentModeState());
      }
    });
  }
  
  /**
   * Initializes the mode manager
   * @param initialMode Initial mode (optional)
   */
  async initialize(initialMode?: string): Promise<void> {
    await this.rulesLoader.detectAndLoadRules();
    
    if (initialMode && this.rulesLoader.hasModeRules(initialMode)) {
      this.currentMode = initialMode;
    } else {
      // Use the first available mode or keep the default
      const availableModes = this.rulesLoader.getAvailableModes();
      if (availableModes.length > 0) {
        this.currentMode = availableModes[0];
      }
    }
    
    this.emit(ModeManagerEvent.MODE_CHANGED, this.getCurrentModeState());
  }
  
  /**
   * Gets the current mode state
   * @returns Current mode state
   */
  getCurrentModeState(): ModeState {
    return {
      name: this.currentMode,
      rules: this.rulesLoader.getRulesForMode(this.currentMode),
      isUmbActive: this.isUmbActive,
      memoryBankStatus: this.memoryBankStatus,
    };
  }
  
  /**
   * Switches to a specific mode
   * @param mode Mode name
   * @returns true if the switch was successful, false otherwise
   */
  async switchMode(mode: string): Promise<boolean> {
    if (!this.rulesLoader.hasModeRules(mode)) {
      // Try to create the missing mcprules file before giving up
      const filename = `.mcprules-${mode}`;
      const created = await this.rulesLoader.createMissingMcpRules([filename]);
      if (created.length > 0) {
        // Reload rules after creating the file
        await this.rulesLoader.detectAndLoadRules();
      }
      if (!this.rulesLoader.hasModeRules(mode)) {
        return false;
      }
    }
    
    this.currentMode = mode;
    this.emit(ModeManagerEvent.MODE_CHANGED, this.getCurrentModeState());
    return true;
  }
  
  /**
   * Checks if a text matches the UMB trigger
   * @param text Text to check
   * @returns true if the text matches the UMB trigger, false otherwise
   */
  checkUmbTrigger(text: string): boolean {
    const currentRules = this.rulesLoader.getRulesForMode(this.currentMode);
    if (!currentRules || !currentRules.instructions.umb || !currentRules.instructions.umb.trigger) {
      return false;
    }
    
    const triggerRegex = new RegExp(currentRules.instructions.umb.trigger, 'i');
    return triggerRegex.test(text);
  }
  
  /**
   * Activates the UMB mode
   * @returns true if the activation was successful, false otherwise
   */
  activateUmb(): boolean {
    const currentRules = this.rulesLoader.getRulesForMode(this.currentMode);
    if (!currentRules || !currentRules.instructions.umb) {
      return false;
    }
    
    this.isUmbActive = true;
    this.emit(ModeManagerEvent.UMB_TRIGGERED, this.getCurrentModeState());
    return true;
  }
  
  /**
   * Deactivates the UMB mode
   */
  deactivateUmb(): void {
    this.isUmbActive = false;
    this.emit(ModeManagerEvent.UMB_COMPLETED, this.getCurrentModeState());
  }
  
  /**
   * Checks if a text matches any mode trigger
   * @param text Text to check
   * @returns Array with the modes corresponding to the found triggers
   */
  checkModeTriggers(text: string): string[] {
    const triggeredModes: string[] = [];
    const currentRules = this.rulesLoader.getRulesForMode(this.currentMode);
    
    if (!currentRules || !currentRules.mode_triggers) {
      return triggeredModes;
    }
    
    // Check triggers for each mode
    for (const [mode, triggers] of Object.entries(currentRules.mode_triggers)) {
      if (this.rulesLoader.hasModeRules(mode)) {
        for (const trigger of triggers) {
          if (text.includes(trigger.condition)) {
            triggeredModes.push(mode);
            break; // One trigger is enough for each mode
          }
        }
      }
    }
    
    if (triggeredModes.length > 0) {
      this.emit(ModeManagerEvent.MODE_TRIGGER_DETECTED, triggeredModes);
    }
    
    return triggeredModes;
  }
  
  /**
   * Sets the Memory Bank status
   * @param status New status
   */
  setMemoryBankStatus(status: 'ACTIVE' | 'INACTIVE'): void {
    this.memoryBankStatus = status;
    this.emit(ModeManagerEvent.MODE_CHANGED, this.getCurrentModeState());
  }
  
  /**
   * Gets the status prefix for responses
   * @returns Status prefix
   */
  getStatusPrefix(): string {
    return `[MEMORY BANK: ${this.memoryBankStatus}]`;
  }
  
  /**
   * Checks if the UMB mode is active
   * @returns true if the UMB mode is active, false otherwise
   */
  isUmbModeActive(): boolean {
    return this.isUmbActive;
  }
  
  /**
   * Cleans up all resources
   */
  dispose(): void {
    this.removeAllListeners();
  }
} 