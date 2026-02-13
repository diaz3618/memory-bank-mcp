import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { ExternalRulesLoader } from '../utils/ExternalRulesLoader.js';
import { ModeManager, ModeManagerEvent } from '../utils/ModeManager.js';
import { MemoryBankManager } from '../core/MemoryBankManager.js';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Clinerules Integration Tests', () => {
  const tempDir = path.join(__dirname, 'temp-test-dir');
  let rulesLoader: ExternalRulesLoader;
  let modeManager: ModeManager;
  
  beforeEach(async () => {
    // Create temporary directory
    await fs.ensureDir(tempDir);
    
    // Create test .clinerules files
    await fs.writeFile(
      path.join(tempDir, '.clinerules-code'),
      JSON.stringify({
        mode: 'code',
        instructions: {
          general: [
            'Status Prefix: Begin EVERY response with either [MEMORY BANK: ACTIVE] or [MEMORY BANK: INACTIVE]',
            'Implement features and maintain code quality'
          ],
          umb: {
            trigger: '^(Update Memory Bank|UMB)$',
            instructions: [
              'Halt Current Task: Stop current activity',
              'Acknowledge Command: [MEMORY BANK: UPDATING]'
            ],
            override_file_restrictions: true
          },
          memory_bank: {}
        },
        mode_triggers: {
          architect: [
            { condition: 'needs_architectural_changes' },
            { condition: 'design_clarification_needed' }
          ]
        }
      })
    );
    
    await fs.writeFile(
      path.join(tempDir, '.clinerules-architect'),
      JSON.stringify({
        mode: 'architect',
        instructions: {
          general: [
            'Status Prefix: Begin EVERY response with either [MEMORY BANK: ACTIVE] or [MEMORY BANK: INACTIVE]',
            'Design and document architecture'
          ],
          umb: {
            trigger: '^(Update Memory Bank|UMB)$',
            instructions: [
              'Halt Current Task: Stop current activity',
              'Acknowledge Command: [MEMORY BANK: UPDATING]'
            ],
            override_file_restrictions: true
          },
          memory_bank: {}
        },
        mode_triggers: {
          code: [
            { condition: 'implementation_needed' },
            { condition: 'code_modification_needed' }
          ]
        }
      })
    );
    
    // Initialize test objects
    rulesLoader = new ExternalRulesLoader(tempDir);
    modeManager = new ModeManager(rulesLoader);
    await modeManager.initialize();
  });
  
  afterEach(async () => {
    // Clean up
    modeManager.dispose();
    if (rulesLoader) {
      rulesLoader.dispose();
    }
    await fs.remove(tempDir);
  });
  
  test('Should detect and load .clinerules files', async () => {
    const rules = await rulesLoader.detectAndLoadRules();
    expect(rules.size).toBeGreaterThanOrEqual(2);
    expect(rules.has('code')).toBe(true);
    expect(rules.has('architect')).toBe(true);
  });
  
  test('Should get available modes', () => {
    const modes = rulesLoader.getAvailableModes();
    expect(modes).toContain('code');
    expect(modes).toContain('architect');
    expect(modes.length).toBeGreaterThanOrEqual(2);
  });
  
  test('Should get rules for specific mode', () => {
    const codeRules = rulesLoader.getRulesForMode('code');
    expect(codeRules).not.toBeNull();
    expect(codeRules?.mode).toBe('code');
    
    const architectRules = rulesLoader.getRulesForMode('architect');
    expect(architectRules).not.toBeNull();
    expect(architectRules?.mode).toBe('architect');
    
    const nonExistentRules = rulesLoader.getRulesForMode('nonexistent');
    expect(nonExistentRules).toBeNull();
  });
  
  test('Should check if mode rules exist', () => {
    expect(rulesLoader.hasModeRules('code')).toBe(true);
    expect(rulesLoader.hasModeRules('architect')).toBe(true);
    expect(rulesLoader.hasModeRules('nonexistent')).toBe(false);
  });
  
  test('Should initialize with a mode', async () => {
    const state = modeManager.getCurrentModeState();
    // The default mode could be either 'code' or 'architect' depending on which one is loaded first
    expect(['code', 'architect']).toContain(state.name);
  });
  
  test('Should initialize with specified mode', async () => {
    // Create a new mode manager with initial mode
    const newModeManager = new ModeManager(rulesLoader);
    await newModeManager.initialize('architect');
    
    const state = newModeManager.getCurrentModeState();
    expect(state.name).toBe('architect');
    
    // Clean up
    newModeManager.dispose();
  });
  
  test('Should switch modes correctly', async () => {
    // Get current mode
    let state = modeManager.getCurrentModeState();
    const initialMode = state.name;
    
    // Switch to the other mode
    const targetMode = initialMode === 'code' ? 'architect' : 'code';
    const result = await modeManager.switchMode(targetMode);
    expect(result).toBe(true);
    
    state = modeManager.getCurrentModeState();
    expect(state.name).toBe(targetMode);
    
    // Try to switch to non-existent mode
    const failResult = await modeManager.switchMode('nonexistent');
    expect(failResult).toBe(false);
    
    // Mode should remain unchanged
    state = modeManager.getCurrentModeState();
    expect(state.name).toBe(targetMode);
  });
  
  test('Should detect UMB trigger', () => {
    expect(modeManager.checkUmbTrigger('Update Memory Bank')).toBe(true);
    expect(modeManager.checkUmbTrigger('UMB')).toBe(true);
    expect(modeManager.checkUmbTrigger('Not a trigger')).toBe(false);
  });
  
  test('Should activate and deactivate UMB mode', () => {
    // Initially UMB mode should be inactive
    expect(modeManager.isUmbModeActive()).toBe(false);
    
    // Activate UMB mode
    const result = modeManager.activateUmb();
    expect(result).toBe(true);
    expect(modeManager.isUmbModeActive()).toBe(true);
    
    // Deactivate UMB mode
    modeManager.deactivateUmb();
    expect(modeManager.isUmbModeActive()).toBe(false);
  });
  
  test('Should detect mode triggers', async () => {
    // Get current mode
    let state = modeManager.getCurrentModeState();
    const initialMode = state.name;
    
    // Ensure we're in code mode for this test
    if (initialMode !== 'code') {
      await modeManager.switchMode('code');
      state = modeManager.getCurrentModeState();
      expect(state.name).toBe('code');
    }
    
    // Check for architect mode triggers
    const architectTriggers = modeManager.checkModeTriggers('We need to make needs_architectural_changes to the system');
    expect(architectTriggers).toContain('architect');
    expect(architectTriggers.length).toBe(1);
    
    // Switch to architect mode
    await modeManager.switchMode('architect');
    state = modeManager.getCurrentModeState();
    expect(state.name).toBe('architect');
    
    // Check for code mode triggers
    const codeTriggers = modeManager.checkModeTriggers('This implementation_needed to be done');
    expect(codeTriggers).toContain('code');
    expect(codeTriggers.length).toBe(1);
    
    // Check for non-existent triggers
    const noTriggers = modeManager.checkModeTriggers('This text has no triggers');
    expect(noTriggers.length).toBe(0);
  });
  
  test('Should set and get Memory Bank status', () => {
    // Default status is INACTIVE
    expect(modeManager.getStatusPrefix()).toBe('[MEMORY BANK: INACTIVE]');
    
    // Set status to ACTIVE
    modeManager.setMemoryBankStatus('ACTIVE');
    expect(modeManager.getStatusPrefix()).toBe('[MEMORY BANK: ACTIVE]');
    
    // Set status back to INACTIVE
    modeManager.setMemoryBankStatus('INACTIVE');
    expect(modeManager.getStatusPrefix()).toBe('[MEMORY BANK: INACTIVE]');
  });
  
  test('Should emit events on mode changes', async () => {
    // Get current mode
    const state = modeManager.getCurrentModeState();
    const initialMode = state.name;
    
    // Switch to the other mode
    const targetMode = initialMode === 'code' ? 'architect' : 'code';
    
    const eventPromise = new Promise<void>((resolve) => {
      // Listen for mode changed event
      modeManager.on(ModeManagerEvent.MODE_CHANGED, (state) => {
        expect(state.name).toBe(targetMode);
        resolve();
      });
    });
    
    // Switch mode to trigger event
    await modeManager.switchMode(targetMode);
    await eventPromise;
  });
  
  test('Should emit events on UMB activation', async () => {
    return new Promise<void>((resolve) => {
      // Listen for UMB triggered event
      modeManager.on(ModeManagerEvent.UMB_TRIGGERED, (state) => {
        expect(state.isUmbActive).toBe(true);
        resolve();
      });
      
      // Activate UMB to trigger event
      modeManager.activateUmb();
    });
  });
  
  test('Should emit events on UMB completion', async () => {
    // First activate UMB
    modeManager.activateUmb();
    
    return new Promise<void>((resolve) => {
      // Listen for UMB completed event
      modeManager.on(ModeManagerEvent.UMB_COMPLETED, (state) => {
        expect(state.isUmbActive).toBe(false);
        resolve();
      });
      
      // Deactivate UMB to trigger event
      modeManager.deactivateUmb();
    });
  });
  
  test('Should emit events on mode trigger detection', async () => {
    // Ensure we're in code mode for this test
    await modeManager.switchMode('code');
    
    return new Promise<void>((resolve) => {
      // Listen for mode trigger detected event
      modeManager.on(ModeManagerEvent.MODE_TRIGGER_DETECTED, (triggeredModes) => {
        expect(triggeredModes).toContain('architect');
        expect(triggeredModes.length).toBe(1);
        resolve();
      });
      
      // Check for triggers to trigger event
      modeManager.checkModeTriggers('We need to make needs_architectural_changes to the system');
    });
  });
  
  test('Should integrate with MemoryBankManager', async () => {
    // Create a memory bank directory
    const memoryBankDir = path.join(tempDir, 'memory-bank');
    await fs.ensureDir(memoryBankDir);
    
    // Create a MemoryBankManager
    const memoryBankManager = new MemoryBankManager(undefined, 'test-user');
    memoryBankManager.setMemoryBankDir(memoryBankDir);
    
    // Check if memory bank status was updated
    expect(memoryBankManager.getStatusPrefix()).toBe('[MEMORY BANK: ACTIVE]');
  });
  
  test('Should detect mode triggers in message', async () => {
    // Create a temporary directory for the test
    const tempDir = path.join(__dirname, 'temp-mode-triggers-test');
    await fs.ensureDir(tempDir);
    
    try {
      // Create .clinerules files with mode_triggers that we can test
      const modeClinerules = {
        mode: 'code',
        instructions: {
          general: ['Test instruction'],
          umb: {
            trigger: '^(Update Memory Bank|UMB)$',
            instructions: ['Test UMB instruction'],
          },
        },
        mode_triggers: {
          test: [{ condition: "run tests" }, { condition: "test this" }],
          architect: [{ condition: "design this" }],
        }
      };
      
      // Write clinerules files for all modes
      for (const mode of ['architect', 'ask', 'code', 'debug', 'test']) {
        await fs.writeFile(
          path.join(tempDir, `.clinerules-${mode}`),
          JSON.stringify({ ...modeClinerules, mode })
        );
      }
      
      // Create a new MemoryBankManager
      const memoryBankManager = new MemoryBankManager(tempDir, 'test-user');
      
      // Initialize the Memory Bank
      await memoryBankManager.initializeMemoryBank(tempDir);
      
      // Wait for mode manager to initialize
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Test messages with mode triggers based on the conditions we set up
      const messages = [
        { text: 'No triggers here', expectedTriggers: [] },
        { text: 'please run tests now', expectedTriggers: ['test'] },
        { text: 'can you design this for me', expectedTriggers: ['architect'] },
      ];
      
      for (const message of messages) {
        const triggers = memoryBankManager.detectModeTriggers(message.text);
        expect(triggers).toEqual(message.expectedTriggers);
      }
    } finally {
      // Clean up
      await fs.remove(tempDir);
    }
  });
}); 