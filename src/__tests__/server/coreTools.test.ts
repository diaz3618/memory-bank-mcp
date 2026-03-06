import { test, expect, describe, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { MemoryBankManager } from '../../core/MemoryBankManager.js';
import { handleSetMemoryBankPath, handleInitializeMemoryBank } from '../../server/tools/CoreTools.js';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('CoreTools Tests', () => {
  let tempDir: string;
  let projectPath: string;
  const testUserId = 'test-user';
  let memoryBankManager: MemoryBankManager;
  
  beforeEach(async () => {
    tempDir = path.join(__dirname, `temp-coretools-test-dir-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    projectPath = path.join(tempDir, 'project');
    await fs.ensureDir(tempDir);
    await fs.ensureDir(projectPath);
    memoryBankManager = new MemoryBankManager(projectPath, testUserId);
  });
  
  afterEach(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Ignore cleanup errors
    }
  });
  
  test('handleSetMemoryBankPath should use project path when no custom path is provided', async () => {
    // Call handleSetMemoryBankPath without a custom path
    const result = await handleSetMemoryBankPath(memoryBankManager);
    
    // Verify the result
    expect(typeof result).toBe('object');
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('Memory Bank not found');
    
    // Verify the custom path was set in the manager
    expect(memoryBankManager.getCustomPath()).toBe(projectPath);
  });
  
  test('handleSetMemoryBankPath should use custom path when provided', async () => {
    // Create a custom path
    const customPath = path.join(tempDir, 'custom');
    await fs.ensureDir(customPath);
    
    // Call handleSetMemoryBankPath with a custom path
    const result = await handleSetMemoryBankPath(memoryBankManager, customPath);
    
    // Verify the result
    expect(typeof result).toBe('object');
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('Memory Bank not found');
    
    // Verify the custom path was set in the manager
    expect(memoryBankManager.getCustomPath()).toBe(customPath);
  });
  
  test('handleInitializeMemoryBank should use project path when no directory path is provided', async () => {
    // Call handleInitializeMemoryBank with an empty string (should use project path)
    const result = await handleInitializeMemoryBank(memoryBankManager, '');
    
    // Verify the result
    expect(typeof result).toBe('object');
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('Memory Bank initialized at');
    
    // Verify the memory bank directory was created
    const memoryBankExists = await fs.pathExists(path.join(projectPath, 'memory-bank'));
    expect(memoryBankExists).toBe(true);
    
    // Verify core files were created
    const productContextExists = await fs.pathExists(path.join(projectPath, 'memory-bank', 'product-context.md'));
    expect(productContextExists).toBe(true);
  });
  
  test('handleInitializeMemoryBank should use provided directory path', async () => {
    // Create a custom directory
    const customDir = path.join(tempDir, 'custom-dir');
    await fs.ensureDir(customDir);
    
    // Call handleInitializeMemoryBank with a custom directory
    const result = await handleInitializeMemoryBank(memoryBankManager, customDir);
    
    // Verify the result
    expect(typeof result).toBe('object');
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('Memory Bank initialized at');
    
    // Verify the memory bank directory was created
    const memoryBankExists = await fs.pathExists(path.join(customDir, 'memory-bank'));
    expect(memoryBankExists).toBe(true);
    
    // Verify core files were created
    const productContextExists = await fs.pathExists(path.join(customDir, 'memory-bank', 'product-context.md'));
    expect(productContextExists).toBe(true);
  });
}); 