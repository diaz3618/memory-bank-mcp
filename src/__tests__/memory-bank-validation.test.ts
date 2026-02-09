import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { MemoryBankManager } from '../core/MemoryBankManager.js';
import { ExternalRulesLoader } from '../utils/ExternalRulesLoader.js';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Memory Bank Validation Tests', () => {
  const tempDir = path.join(__dirname, 'temp-validation-test-dir');
  const testUserId = 'test-user';
  let memoryBankManager: MemoryBankManager;
  let rulesLoader: ExternalRulesLoader;
  
  beforeEach(async () => {
    // Create temporary directory
    await fs.ensureDir(tempDir);
    
    // Create test .clinerules files
    const modes = ['architect', 'ask', 'code', 'debug', 'test'];
    for (const mode of modes) {
      await fs.writeFile(
        path.join(tempDir, `.clinerules-${mode}`),
        JSON.stringify({
          mode: mode,
          instructions: {
            general: [
              'Status Prefix: Begin EVERY response with either [MEMORY BANK: ACTIVE] or [MEMORY BANK: INACTIVE]',
              'Test instruction'
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
          }
        })
      );
    }
    
    // Create a new MemoryBankManager for each test with tempDir as project path
    memoryBankManager = new MemoryBankManager(tempDir, testUserId);
    rulesLoader = new ExternalRulesLoader(tempDir);
    
    // Wait a tick for any async constructor operations to complete
    await new Promise(resolve => setTimeout(resolve, 10));
  });
  
  afterEach(async () => {
    // Clean up temporary directory
    await fs.remove(tempDir);
  });
  
  test('validateClinerules should detect all required files', async () => {
    const validation = await memoryBankManager.validateClinerules(tempDir);
    expect(validation.valid).toBe(true);
    expect(validation.missingFiles.length).toBe(0);
    expect(validation.existingFiles.length).toBe(5);
  });
  
  test('validateClinerules should detect missing files', async () => {
    // Remove one of the files
    await fs.remove(path.join(tempDir, '.clinerules-architect'));
    
    const validation = await memoryBankManager.validateClinerules(tempDir);
    expect(validation.valid).toBe(false);
    expect(validation.missingFiles).toContain('.clinerules-architect');
    expect(validation.existingFiles.length).toBe(4);
  });
  
  test('findMemoryBankDir should only look in the current directory', async () => {
    // Create a memory-bank directory in the temp directory
    const mbDir = path.join(tempDir, 'memory-bank');
    await fs.ensureDir(mbDir);
    
    // Create a core file to make it a valid memory bank
    await fs.writeFile(
      path.join(mbDir, 'active-context.md'),
      '# Active Context\n\nThis is a test file.'
    );
    
    // Should find the memory-bank directory
    const foundDir = await memoryBankManager.findMemoryBankDir(tempDir);
    expect(foundDir).toBe(mbDir);
    
    // Create a subdirectory with a memory-bank
    const subDir = path.join(tempDir, 'subdir');
    await fs.ensureDir(subDir);
    const subMbDir = path.join(subDir, 'memory-bank');
    await fs.ensureDir(subMbDir);
    await fs.writeFile(
      path.join(subMbDir, 'active-context.md'),
      '# Active Context\n\nThis is a test file.'
    );
    
    // Should still find the original memory-bank, not the one in the subdirectory
    const foundDir2 = await memoryBankManager.findMemoryBankDir(tempDir);
    expect(foundDir2).toBe(mbDir);
    
    // If we pass the subdirectory as the start directory, it should find the memory-bank in that directory
    const foundDir3 = await memoryBankManager.findMemoryBankDir(subDir);
    expect(foundDir3).toBe(subMbDir);
  });
  
  test('initializeMemoryBank should create memory-bank in the current directory', async () => {
    // Initialize memory bank
    await memoryBankManager.initializeMemoryBank(tempDir);
    
    // Check if memory-bank directory was created in the specified directory (tempDir)
    const mbDir = path.join(tempDir, 'memory-bank');
    expect(await fs.pathExists(mbDir)).toBe(true);
    
    // Check if core files were created
    const coreFiles = [
      'active-context.md',
      'product-context.md',
      'progress.md',
      'decision-log.md',
      'system-patterns.md'
    ];
    
    for (const file of coreFiles) {
      expect(await fs.pathExists(path.join(mbDir, file))).toBe(true);
    }
    
    // Clean up the memory-bank directory in the current directory
    await fs.remove(mbDir);
  });
  
  test('initializeMemoryBank should fail if .clinerules files are missing', async () => {
    // Remove one of the files
    await fs.remove(path.join(tempDir, '.clinerules-architect'));
    
    // Try to initialize memory bank
    try {
      await memoryBankManager.initializeMemoryBank(tempDir);
      // Should not reach here
      expect(false).toBe(true);
    } catch (error) {
      // Should throw an error
      expect(error instanceof Error).toBe(true);
    }
  });
}); 