import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { MemoryBankManager } from '../core/MemoryBankManager.js';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('MemoryBankManager Tests', () => {
  const tempDir = path.join(__dirname, 'temp-test-dir');
  const testUserId = 'test-user';
  const memoryBankDir = path.join(tempDir, 'memory-bank');
  let memoryBankManager: MemoryBankManager;
  
  beforeEach(async () => {
    // Create temporary directory
    await fs.ensureDir(tempDir);
    
    // Create a new MemoryBankManager for each test with tempDir as project path
    // This prevents the manager from auto-discovering the project root's memory-bank
    memoryBankManager = new MemoryBankManager(tempDir, testUserId);
    
    // Wait a tick for any async constructor operations to complete
    await new Promise(resolve => setTimeout(resolve, 10));
  });
  
  afterEach(async () => {
    // Clean up
    await fs.remove(tempDir);
  });
  
  test('Should set and get project path', () => {
    // Set a custom project path
    const customProjectPath = '/custom/project/path';
    
    // Create a new MemoryBankManager with a custom project path
    const managerWithPath = new MemoryBankManager(customProjectPath, testUserId);
    
    // Get the project path
    const projectPath = managerWithPath.getProjectPath();
    
    // Verify the project path
    expect(projectPath).toBe(customProjectPath);
  });
  
  test('Should use current directory if no project path is provided', () => {
    // Create a new MemoryBankManager without a custom project path
    const managerWithoutPath = new MemoryBankManager(undefined, testUserId);
    
    // Get the project path
    const projectPath = managerWithoutPath.getProjectPath();
    
    // Verify the project path is the current directory
    expect(projectPath).toBe(process.cwd());
  });
  
  test('Should set and get Memory Bank directory', () => {
    // Set Memory Bank directory
    memoryBankManager.setMemoryBankDir(memoryBankDir);
    
    // Get Memory Bank directory
    const dir = memoryBankManager.getMemoryBankDir();
    
    // Verify
    expect(dir).toBe(memoryBankDir);
  });
  
  test('Should set and get custom path', () => {
    // Set custom path
    const customPath = path.join(tempDir, 'custom-path');
    memoryBankManager.setCustomPath(customPath);
    
    // Get custom path
    const customPathResult = memoryBankManager.getCustomPath();
    
    // Verify
    expect(customPathResult).toBe(customPath);
  });
  
  test('Should check if directory is a Memory Bank', async () => {
    // Create Memory Bank directory
    await fs.ensureDir(memoryBankDir);
    
    // Create core files
    await fs.writeFile(path.join(memoryBankDir, 'product-context.md'), '# Product Context');
    await fs.writeFile(path.join(memoryBankDir, 'active-context.md'), '# Active Context');
    await fs.writeFile(path.join(memoryBankDir, 'progress.md'), '# Progress');
    await fs.writeFile(path.join(memoryBankDir, 'decision-log.md'), '# Decision Log');
    await fs.writeFile(path.join(memoryBankDir, 'system-patterns.md'), '# System Patterns');
    
    // Check if directory is a Memory Bank
    const isMemoryBank = await memoryBankManager.isMemoryBank(memoryBankDir);
    
    // Verify
    expect(isMemoryBank).toBe(true);
    
    // Check if non-Memory Bank directory is not a Memory Bank
    const nonMemoryBankDir = path.join(tempDir, 'non-memory-bank');
    await fs.ensureDir(nonMemoryBankDir);
    
    const isNonMemoryBank = await memoryBankManager.isMemoryBank(nonMemoryBankDir);
    
    // Verify
    expect(isNonMemoryBank).toBe(false);
  });
  
  test('Should find Memory Bank directory', async () => {
    // Create Memory Bank directory
    await fs.ensureDir(memoryBankDir);
    
    // Create core files
    await fs.writeFile(path.join(memoryBankDir, 'product-context.md'), '# Product Context');
    await fs.writeFile(path.join(memoryBankDir, 'active-context.md'), '# Active Context');
    await fs.writeFile(path.join(memoryBankDir, 'progress.md'), '# Progress');
    await fs.writeFile(path.join(memoryBankDir, 'decision-log.md'), '# Decision Log');
    await fs.writeFile(path.join(memoryBankDir, 'system-patterns.md'), '# System Patterns');
    
    // Find Memory Bank directory
    const foundDir = await memoryBankManager.findMemoryBankDir(tempDir);
    
    // Verify
    expect(foundDir).toBe(memoryBankDir);
    
    // Try to find Memory Bank directory in a directory without a Memory Bank
    const nonMemoryBankDir = path.join(tempDir, 'non-memory-bank');
    await fs.ensureDir(nonMemoryBankDir);
    
    const notFoundDir = await memoryBankManager.findMemoryBankDir(nonMemoryBankDir);
    
    // Verify
    expect(notFoundDir).toBeNull();
  });
  
  test('Should initialize Memory Bank', async () => {
    // Create a temporary directory for testing
    const tempDir = path.join(__dirname, 'temp-test-dir');
    await fs.ensureDir(tempDir);
    
    try {
      // Initialize a new MemoryBankManager with the temporary directory
      const memoryBankManager = new MemoryBankManager(tempDir);
      
      // Initialize the Memory Bank
      await memoryBankManager.initializeMemoryBank(tempDir);
      
      // Get the Memory Bank directory
      const memoryBankDir = memoryBankManager.getMemoryBankDir();
      
      // Verify Memory Bank directory was created
      expect(memoryBankDir).not.toBeNull();
      
      if (memoryBankDir) {
        const dirExists = await fs.pathExists(memoryBankDir);
        expect(dirExists).toBe(true);
        
        // Verify core files were created
        const productContextExists = await fs.pathExists(path.join(memoryBankDir, 'product-context.md'));
        expect(productContextExists).toBe(true);
        
        const activeContextExists = await fs.pathExists(path.join(memoryBankDir, 'active-context.md'));
        expect(activeContextExists).toBe(true);
      }
    } finally {
      // Clean up
      await fs.remove(tempDir);
    }
  });
  
  test('Should read file from Memory Bank', async () => {
    // Create Memory Bank directory
    await fs.ensureDir(memoryBankDir);
    
    // Set Memory Bank directory
    memoryBankManager.setMemoryBankDir(memoryBankDir);
    
    // Create a test file
    const testContent = '# Test Content';
    const testFileName = 'test-file.md';
    await fs.writeFile(path.join(memoryBankDir, testFileName), testContent);
    
    // Read file
    const content = await memoryBankManager.readFile(testFileName);
    
    // Verify
    expect(content).toBe(testContent);
  });
  
  test('Should write file to Memory Bank', async () => {
    // Create Memory Bank directory with required files
    await fs.ensureDir(memoryBankDir);
    await fs.writeFile(path.join(memoryBankDir, 'progress.md'), '# Progress');
    await fs.writeFile(path.join(memoryBankDir, 'active-context.md'), '# Active Context');
    
    // Set Memory Bank directory
    memoryBankManager.setMemoryBankDir(memoryBankDir);
    
    // Write file
    const testContent = '# Test Content';
    const testFileName = 'test-file.md';
    await memoryBankManager.writeFile(testFileName, testContent);
    
    // Verify file was written
    const filePath = path.join(memoryBankDir, testFileName);
    const exists = await fs.pathExists(filePath);
    expect(exists).toBe(true);
    
    // Verify content
    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toBe(testContent);
  });
  
  test('Should list files in Memory Bank', async () => {
    // Create Memory Bank directory with core files first
    await fs.ensureDir(memoryBankDir);
    await fs.writeFile(path.join(memoryBankDir, 'product-context.md'), '# Product Context');
    await fs.writeFile(path.join(memoryBankDir, 'active-context.md'), '# Active Context');
    
    // Set Memory Bank directory
    memoryBankManager.setMemoryBankDir(memoryBankDir);
    
    // Create test files
    await memoryBankManager.writeFile('file1.md', 'Test content 1');
    await memoryBankManager.writeFile('file2.md', 'Test content 2');
    await memoryBankManager.writeFile('file3.md', 'Test content 3');
    
    // List files
    const files = await memoryBankManager.listFiles();
    
    // Verify files exist
    expect(files).toContain('file1.md');
    expect(files).toContain('file2.md');
    expect(files).toContain('file3.md');
    
    // Core files should also be present
    expect(files).toContain('product-context.md');
    expect(files).toContain('active-context.md');
  });
  
  test('Should get Memory Bank status', async () => {
    // Create Memory Bank directory
    await fs.ensureDir(memoryBankDir);
    
    // Create core files
    await fs.writeFile(path.join(memoryBankDir, 'product-context.md'), '# Product Context');
    await fs.writeFile(path.join(memoryBankDir, 'active-context.md'), '# Active Context');
    await fs.writeFile(path.join(memoryBankDir, 'progress.md'), '# Progress');
    await fs.writeFile(path.join(memoryBankDir, 'decision-log.md'), '# Decision Log');
    await fs.writeFile(path.join(memoryBankDir, 'system-patterns.md'), '# System Patterns');
    
    // Set Memory Bank directory
    memoryBankManager.setMemoryBankDir(memoryBankDir);
    
    // Get status
    const status = await memoryBankManager.getStatus();
    
    // Verify
    expect(status.path).toBe(memoryBankDir);
    expect(status.files.length).toBeGreaterThanOrEqual(4);
    expect(status.coreFilesPresent.length).toBeGreaterThanOrEqual(4);
    // The missing core files might vary depending on the implementation
    // so we don't make assumptions about it
    expect(status.isComplete).toBe(true);
  });
  
  test('Should create backup of Memory Bank', async () => {
    // Create Memory Bank directory
    await fs.ensureDir(memoryBankDir);
    
    // Create test files
    await fs.writeFile(path.join(memoryBankDir, 'file1.md'), 'Content 1');
    await fs.writeFile(path.join(memoryBankDir, 'file2.md'), 'Content 2');
    
    // Set Memory Bank directory
    memoryBankManager.setMemoryBankDir(memoryBankDir);
    
    // Create backup
    const backupDir = path.join(tempDir, 'backup');
    const backupPath = await memoryBankManager.createBackup(backupDir);
    
    // Verify backup directory exists
    const backupExists = await fs.pathExists(backupPath);
    expect(backupExists).toBe(true);
    
    // Verify files were copied
    const file1Exists = await fs.pathExists(path.join(backupPath, 'file1.md'));
    expect(file1Exists).toBe(true);
    
    const file2Exists = await fs.pathExists(path.join(backupPath, 'file2.md'));
    expect(file2Exists).toBe(true);
  });
}); 