import { test, expect, describe, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { FileUtils } from '../utils/FileUtils.js';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('FileUtils Tests', () => {
  const tempDir = path.join(__dirname, 'temp-fileutils-test-dir');
  const testFilePath = path.join(tempDir, 'test-file.txt');
  const testContent = 'This is a test file content';
  const testDirPath = path.join(tempDir, 'test-dir');
  
  beforeEach(async () => {
    // Create temporary directory
    await fs.ensureDir(tempDir);
  });
  
  afterEach(async () => {
    // Clean up
    await fs.remove(tempDir);
  });
  
  test('Should check if file exists', async () => {
    // Create a test file
    await fs.writeFile(testFilePath, testContent);
    
    // Check if file exists
    const exists = await FileUtils.fileExists(testFilePath);
    expect(exists).toBe(true);
    
    // Check if non-existent file exists
    const nonExistentPath = path.join(tempDir, 'non-existent.txt');
    const nonExistentExists = await FileUtils.fileExists(nonExistentPath);
    expect(nonExistentExists).toBe(false);
  });
  
  test('Should check if path is a directory', async () => {
    // Create a test directory
    await fs.ensureDir(testDirPath);
    
    // Check if path is a directory
    const isDir = await FileUtils.isDirectory(testDirPath);
    expect(isDir).toBe(true);
    
    // Check if file is not a directory
    await fs.writeFile(testFilePath, testContent);
    const isFileDir = await FileUtils.isDirectory(testFilePath);
    expect(isFileDir).toBe(false);
  });
  
  test('Should read file content', async () => {
    // Create a test file
    await fs.writeFile(testFilePath, testContent);
    
    // Read file content
    const content = await FileUtils.readFile(testFilePath);
    expect(content).toBe(testContent);
  });
  
  test('Should handle read file errors', async () => {
    // Try to read non-existent file
    const nonExistentPath = path.join(tempDir, 'non-existent.txt');
    
    try {
      await FileUtils.readFile(nonExistentPath);
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeTruthy();
    }
  });
  
  test('Should write file content', async () => {
    // Write file content
    await FileUtils.writeFile(testFilePath, testContent);
    
    // Verify file was written
    const exists = await fs.pathExists(testFilePath);
    expect(exists).toBe(true);
    
    // Verify content
    const content = await fs.readFile(testFilePath, 'utf8');
    expect(content).toBe(testContent);
  });
  
  test('Should handle write file errors', async () => {
    // Create a directory with the same name as the file we want to write
    const invalidPath = path.join(tempDir, 'invalid-path');
    await fs.ensureDir(invalidPath);
    
    try {
      // Try to write to a path that is a directory
      await FileUtils.writeFile(invalidPath, testContent);
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeTruthy();
    }
  });
  
  test('Should ensure directory exists', async () => {
    // Ensure directory
    await FileUtils.ensureDirectory(testDirPath);
    
    // Verify directory was created
    const exists = await fs.pathExists(testDirPath);
    expect(exists).toBe(true);
    
    // Verify it's a directory
    const stats = await fs.stat(testDirPath);
    expect(stats.isDirectory()).toBe(true);
  });
  
  test('Should list files in directory', async () => {
    // Create test files and directories
    await fs.ensureDir(testDirPath);
    await fs.writeFile(testFilePath, testContent);
    await fs.writeFile(path.join(tempDir, 'another-file.txt'), 'Another file');
    
    // List files in directory
    const files = await FileUtils.listFiles(tempDir);
    
    // Verify files
    expect(files.length).toBeGreaterThanOrEqual(2);
    expect(files).toContain('test-file.txt');
    expect(files).toContain('another-file.txt');
  });
  
  test('Should handle list files errors', async () => {
    // Try to list files in non-existent directory
    const nonExistentPath = path.join(tempDir, 'non-existent-dir');
    
    try {
      await FileUtils.listFiles(nonExistentPath);
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeTruthy();
    }
  });
  
  test('Should get file stats', async () => {
    // Create a test file
    await fs.writeFile(testFilePath, testContent);
    
    // Get file stats
    const stats = await FileUtils.getFileStats(testFilePath);
    
    // Verify stats
    expect(stats.isFile()).toBe(true);
    expect(stats.isDirectory()).toBe(false);
    expect(stats.size).toBe(testContent.length);
  });
  
  test('Should handle get file stats errors', async () => {
    // Try to get stats for non-existent file
    const nonExistentPath = path.join(tempDir, 'non-existent.txt');
    
    try {
      await FileUtils.getFileStats(nonExistentPath);
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeTruthy();
    }
  });
  
  test('Should delete file or directory', async () => {
    // Create a test file
    await fs.writeFile(testFilePath, testContent);
    
    // Verify file exists
    const existsBefore = await fs.pathExists(testFilePath);
    expect(existsBefore).toBe(true);
    
    // Delete file
    await FileUtils.delete(testFilePath);
    
    // Verify file was deleted
    const existsAfter = await fs.pathExists(testFilePath);
    expect(existsAfter).toBe(false);
  });
  
  test('Should copy file', async () => {
    // Create a test file
    await fs.writeFile(testFilePath, testContent);
    
    // Copy file
    const destPath = path.join(tempDir, 'copied-file.txt');
    await FileUtils.copy(testFilePath, destPath);
    
    // Verify file was copied
    const exists = await fs.pathExists(destPath);
    expect(exists).toBe(true);
    
    // Verify content
    const content = await fs.readFile(destPath, 'utf8');
    expect(content).toBe(testContent);
  });
  
  test('Should join paths', () => {
    // Join paths
    const joined = FileUtils.joinPath('path', 'to', 'file.txt');
    
    // Verify joined path
    expect(joined).toBe(path.join('path', 'to', 'file.txt'));
  });
  
  test('Should delete file', async () => {
    // Create a test file
    await fs.writeFile(testFilePath, testContent);
    
    // Verify file exists
    const existsBefore = await fs.pathExists(testFilePath);
    expect(existsBefore).toBe(true);
    
    // Delete file
    await FileUtils.deleteFile(testFilePath);
    
    // Verify file was deleted
    const existsAfter = await fs.pathExists(testFilePath);
    expect(existsAfter).toBe(false);
  });
  
  test('Should handle deleteFile errors', async () => {
    // Try to delete non-existent file
    const nonExistentPath = path.join(tempDir, 'non-existent.txt');
    
    try {
      await FileUtils.deleteFile(nonExistentPath);
      // This should not throw an error as fs.remove doesn't throw if file doesn't exist
      const exists = await fs.pathExists(nonExistentPath);
      expect(exists).toBe(false);
    } catch (error) {
      // Should not reach here
      expect(true).toBe(false);
    }
  });
}); 