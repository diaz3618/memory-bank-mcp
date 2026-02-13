import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { ExternalRulesLoader } from '../utils/ExternalRulesLoader.js';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ExternalRulesLoader Tests', () => {
  const tempDir = path.join(__dirname, 'temp-rulesloader-test-dir');
  const projectDir = path.join(tempDir, 'project');
  let rulesLoader: ExternalRulesLoader;
  
  beforeEach(async () => {
    // Create temporary directories
    await fs.ensureDir(tempDir);
    await fs.ensureDir(projectDir);
    
    // Create a new ExternalRulesLoader with the project directory
    rulesLoader = new ExternalRulesLoader(projectDir);
  });
  
  afterEach(async () => {
    // Clean up
    rulesLoader.dispose();
    await fs.remove(tempDir);
  });
  
  test('Should use provided project directory', async () => {
    // Create all required .mcprules-* files so detectAndLoadRules can find them
    const modes = ['architect', 'ask', 'code', 'debug', 'test'];
    for (const mode of modes) {
      const content = `mode: ${mode}\ninstructions:\n  general:\n    - "Rule for ${mode}"`;
      await fs.writeFile(path.join(projectDir, `.mcprules-${mode}`), content);
    }
    
    // Load rules
    const rules = await rulesLoader.detectAndLoadRules();
    
    // Verify rules were loaded from the project directory
    expect(rules.size).toBeGreaterThan(0);
    expect(rules.has('test')).toBe(true);
    
    // Verify the rule has instructions
    const rule = rules.get('test');
    expect(rule).not.toBeNull();
    expect(rule?.instructions).not.toBeNull();
    expect(Array.isArray(rule?.instructions.general)).toBe(true);
    expect(rule?.instructions.general.length).toBeGreaterThan(0);
  });
  
  test('Should use default directory when not provided', async () => {
    // Create a new ExternalRulesLoader without a project directory
    const defaultLoader = new ExternalRulesLoader();
    
    // Create a temporary .mcprules file in the current directory
    const currentDir = process.cwd();
    const tempMcpRulesPath = path.join(currentDir, '.temp-test-mcprules');
    
    const mcpRulesContent = `
mode: default-test
instructions:
  general:
    - "This is a default test rule"
`;
    
    try {
      // Write temporary file
      await fs.writeFile(tempMcpRulesPath, mcpRulesContent);
      
      // Load rules
      const rules = await defaultLoader.detectAndLoadRules();
      
      // Verify the loader is using the current directory
      // Note: This test might be flaky if there are existing .mcprules files
      // in the current directory, so we're just checking basic functionality
      expect(rules.size).toBeGreaterThanOrEqual(1);
      
    } finally {
      // Clean up
      defaultLoader.dispose();
      await fs.remove(tempMcpRulesPath);
    }
  });
  
  test('Should NOT auto-create missing .mcprules files', async () => {
    // Validate required files — should report missing, NOT create them
    const result = await rulesLoader.validateRequiredFiles();
    
    // All files should be reported as missing (nothing auto-created)
    expect(result.valid).toBe(false);
    expect(result.missingFiles.length).toBe(5);
    expect(result.existingFiles.length).toBe(0);
    
    // Verify files were NOT created in the project directory
    const codeRuleExists = await fs.pathExists(path.join(projectDir, '.mcprules-code'));
    expect(codeRuleExists).toBe(false);
    
    const askRuleExists = await fs.pathExists(path.join(projectDir, '.mcprules-ask'));
    expect(askRuleExists).toBe(false);
  });

  test('Should create mcprules files when explicitly asked', async () => {
    // Explicitly create missing files
    const created = await rulesLoader.createMissingMcpRules([
      '.mcprules-code',
      '.mcprules-ask',
    ]);
    
    expect(created.length).toBe(2);
    
    const codeRuleExists = await fs.pathExists(path.join(projectDir, '.mcprules-code'));
    expect(codeRuleExists).toBe(true);
    
    const askRuleExists = await fs.pathExists(path.join(projectDir, '.mcprules-ask'));
    expect(askRuleExists).toBe(true);
  });
}); 