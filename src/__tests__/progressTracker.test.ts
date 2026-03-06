import { test, expect, describe, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProgressTracker } from '../core/ProgressTracker.js';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ProgressTracker Tests', () => {
  const tempDir = path.join(__dirname, 'temp-progress-test-dir');
  const memoryBankDir = path.join(tempDir, 'memory-bank');
  const testUserId = 'test-user';
  let progressTracker: ProgressTracker;
  
  beforeEach(async () => {
    // Create temporary directory and Memory Bank directory
    await fs.ensureDir(memoryBankDir);
    
    // Create core files
    await fs.writeFile(path.join(memoryBankDir, 'product-context.md'), '# Product Context');
    await fs.writeFile(path.join(memoryBankDir, 'active-context.md'), '# Active Context\n\n## Current Session Notes\n');
    await fs.writeFile(path.join(memoryBankDir, 'progress.md'), '# Progress');
    await fs.writeFile(path.join(memoryBankDir, 'decision-log.md'), '# Decision Log');
    await fs.writeFile(path.join(memoryBankDir, 'system-patterns.md'), '# System Patterns');
    
    // Create a new ProgressTracker for each test
    progressTracker = new ProgressTracker(memoryBankDir, testUserId);
  });
  
  afterEach(async () => {
    // Clean up
    await fs.remove(tempDir);
  });
  
  test('Should track progress', async () => {
    // Track progress
    const action = 'test-action';
    const details = { description: 'Test description' };
    await progressTracker.trackProgress(action, details);
    
    // Verify progress.md was updated
    const progressContent = await fs.readFile(path.join(memoryBankDir, 'progress.md'), 'utf8');
    
    // Check if progress.md contains the action and description
    expect(progressContent.includes(action)).toBe(true);
    expect(progressContent.includes(details.description)).toBe(true);
    expect(progressContent.includes(testUserId)).toBe(true);
  });
  
  test('Should update active context', async () => {
    // Update active context
    const context = {
      tasks: ['Task 1', 'Task 2'],
      issues: ['Issue 1'],
      nextSteps: ['Next step 1', 'Next step 2'],
    };
    await progressTracker.updateActiveContext(context);
    
    // Verify active-context.md was updated
    const activeContextContent = await fs.readFile(path.join(memoryBankDir, 'active-context.md'), 'utf8');
    
    // Check if active-context.md contains the tasks, issues, and next steps
    expect(activeContextContent.includes('Task 1')).toBe(true);
    expect(activeContextContent.includes('Task 2')).toBe(true);
    expect(activeContextContent.includes('Issue 1')).toBe(true);
    expect(activeContextContent.includes('Next step 1')).toBe(true);
    expect(activeContextContent.includes('Next step 2')).toBe(true);
  });
  
  test('Should log decision', async () => {
    // Log decision
    const decision = {
      title: 'Test Decision',
      context: 'Test Context',
      decision: 'Test Decision Content',
      alternatives: ['Alternative 1', 'Alternative 2'],
      consequences: ['Consequence 1', 'Consequence 2'],
    };
    await progressTracker.logDecision(decision);
    
    // Verify decision-log.md was updated
    const decisionLogContent = await fs.readFile(path.join(memoryBankDir, 'decision-log.md'), 'utf8');
    
    // Check if decision-log.md contains the decision details
    expect(decisionLogContent.includes('Test Decision')).toBe(true);
    expect(decisionLogContent.includes('Test Context')).toBe(true);
    expect(decisionLogContent.includes('Test Decision Content')).toBe(true);
    expect(decisionLogContent.includes('Alternative 1')).toBe(true);
    expect(decisionLogContent.includes('Alternative 2')).toBe(true);
    expect(decisionLogContent.includes('Consequence 1')).toBe(true);
    expect(decisionLogContent.includes('Consequence 2')).toBe(true);
  });
  
  test('Should clear session notes', async () => {
    // Create active context with session notes
    const activeContextContent = `# Active Context

## Current Project State
Test project state

## Current Session Notes
- [12:00:00] Note 1
- [12:30:00] Note 2

## Ongoing Tasks
- Task 1
- Task 2
`;
    
    await fs.writeFile(path.join(memoryBankDir, 'active-context.md'), activeContextContent);
    
    // Clear session notes
    await progressTracker.clearSessionNotes();
    
    // Verify active-context.md was updated
    const updatedContent = await fs.readFile(path.join(memoryBankDir, 'active-context.md'), 'utf8');
    
    // Check if session notes were cleared
    expect(updatedContent.includes('## Current Session Notes')).toBe(true);
    expect(updatedContent.includes('[12:00:00] Note 1')).toBe(false);
    expect(updatedContent.includes('[12:30:00] Note 2')).toBe(false);
    
    // Check if other sections were preserved
    expect(updatedContent.includes('Test project state')).toBe(true);
    expect(updatedContent.includes('Task 1')).toBe(true);
    expect(updatedContent.includes('Task 2')).toBe(true);
  });
  
  test('Should format GitHub profile URL correctly', async () => {
    // Create a ProgressTracker with a GitHub URL
    const githubUrl = 'https://github.com/username';
    const progressTrackerWithGithub = new ProgressTracker(memoryBankDir, githubUrl);
    
    // Track progress
    const action = 'test-action';
    const details = { description: 'Test description' };
    await progressTrackerWithGithub.trackProgress(action, details);
    
    // Verify progress.md was updated with formatted GitHub URL
    const progressContent = await fs.readFile(path.join(memoryBankDir, 'progress.md'), 'utf8');
    
    // Check if progress.md contains the formatted GitHub URL
    expect(progressContent.includes('[@username](https://github.com/username)')).toBe(true);
    
    // Log a decision
    const decision = {
      title: 'Test Decision',
      context: 'Test Context',
      decision: 'Test Decision Content',
    };
    await progressTrackerWithGithub.logDecision(decision);
    
    // Verify decision-log.md was updated with formatted GitHub URL
    const decisionLogContent = await fs.readFile(path.join(memoryBankDir, 'decision-log.md'), 'utf8');
    
    // Check if decision-log.md contains the formatted GitHub URL
    expect(decisionLogContent.includes('[@username](https://github.com/username)')).toBe(true);
  });
}); 