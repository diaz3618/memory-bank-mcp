import { test, expect, describe, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { MigrationUtils } from '../utils/MigrationUtils.js';
import { FileUtils } from '../utils/FileUtils.js';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('MigrationUtils Tests', () => {
  const tempDir = path.join(__dirname, 'temp-migration-test-dir');
  const memoryBankDir = path.join(tempDir, 'memory-bank');
  
  beforeEach(async () => {
    // Create temporary directory and Memory Bank directory
    await fs.ensureDir(memoryBankDir);
    
    // Create core files with old naming convention
    await fs.writeFile(path.join(memoryBankDir, 'productContext.md'), '# Product Context');
    await fs.writeFile(path.join(memoryBankDir, 'activeContext.md'), '# Active Context');
    await fs.writeFile(path.join(memoryBankDir, 'progress.md'), '# Progress');
    await fs.writeFile(path.join(memoryBankDir, 'decisionLog.md'), '# Decision Log');
    await fs.writeFile(path.join(memoryBankDir, 'systemPatterns.md'), '# System Patterns');
  });
  
  afterEach(async () => {
    // Clean up
    await fs.remove(tempDir);
  });
  
  test('Should migrate file naming convention', async () => {
    // Migrate file naming convention
    const result = await MigrationUtils.migrateFileNamingConvention(memoryBankDir);
    
    // Verify migration was successful
    expect(result.success).toBe(true);
    expect(result.migratedFiles.length).toBe(4);
    expect(result.errors.length).toBe(0);
    
    // Verify old files were deleted
    const oldFiles = [
      'productContext.md',
      'activeContext.md',
      'decisionLog.md',
      'systemPatterns.md'
    ];
    
    for (const oldFile of oldFiles) {
      const oldFilePath = path.join(memoryBankDir, oldFile);
      const oldFileExists = await fs.pathExists(oldFilePath);
      expect(oldFileExists).toBe(false);
    }
    
    // Verify new files were created
    const newFiles = [
      'product-context.md',
      'active-context.md',
      'decision-log.md',
      'system-patterns.md'
    ];
    
    for (const newFile of newFiles) {
      const newFilePath = path.join(memoryBankDir, newFile);
      const newFileExists = await fs.pathExists(newFilePath);
      expect(newFileExists).toBe(true);
    }
    
    // Verify progress.md was not affected (already had correct naming)
    const progressPath = path.join(memoryBankDir, 'progress.md');
    const progressExists = await fs.pathExists(progressPath);
    expect(progressExists).toBe(true);
  });
  
  test('Should handle errors when target file already exists', async () => {
    // Create a file with the new naming convention
    await fs.writeFile(path.join(memoryBankDir, 'product-context.md'), '# New Product Context');
    
    // Migrate file naming convention
    const result = await MigrationUtils.migrateFileNamingConvention(memoryBankDir);
    
    // Verify migration had errors
    expect(result.success).toBe(true); // Overall success is still true
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('Target file already exists');
    expect(result.migratedFiles.length).toBe(3);
    
    // Verify the existing new file was not overwritten
    const newFileContent = await fs.readFile(path.join(memoryBankDir, 'product-context.md'), 'utf8');
    expect(newFileContent).toBe('# New Product Context');
  });
  
  test('Should handle non-existent directory', async () => {
    // Try to migrate files in a non-existent directory
    const nonExistentDir = path.join(tempDir, 'non-existent');
    const result = await MigrationUtils.migrateFileNamingConvention(nonExistentDir);
    
    // Verify migration failed
    expect(result.success).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('Memory Bank directory not found');
    expect(result.migratedFiles.length).toBe(0);
  });
  
  test('Should handle errors during file operations', async () => {
    // Mock FileUtils.readFile to throw an error
    const originalReadFile = FileUtils.readFile;
    FileUtils.readFile = vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath.includes('productContext.md')) {
        throw new Error('Mock read error');
      }
      return originalReadFile(filePath);
    });
    
    try {
      // Migrate file naming convention
      const result = await MigrationUtils.migrateFileNamingConvention(memoryBankDir);
      
      // Verify migration had errors
      expect(result.success).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Error migrating productContext.md');
      expect(result.errors[0]).toContain('Mock read error');
      
      // Verify other files were still migrated
      expect(result.migratedFiles.length).toBe(3);
      
      // Verify the file with error was not migrated
      const oldFilePath = path.join(memoryBankDir, 'productContext.md');
      const oldFileExists = await fs.pathExists(oldFilePath);
      expect(oldFileExists).toBe(true);
      
      const newFilePath = path.join(memoryBankDir, 'product-context.md');
      const newFileExists = await fs.pathExists(newFilePath);
      expect(newFileExists).toBe(false);
    } finally {
      // Restore original function
      FileUtils.readFile = originalReadFile;
    }
  });
}); 