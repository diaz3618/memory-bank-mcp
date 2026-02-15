import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { MemoryBankManager } from '../../core/MemoryBankManager.js';
import { handleGetTargetedContext, readSectionByHeading, excerptAroundMatches } from '../../server/tools/KGContextTools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Excerpt Utility Tests
// ============================================================================

describe('readSectionByHeading', () => {
  const markdown = `# Document Title

Some intro text.

## Design Decisions

This section covers design decisions.
Decision A was important.
Decision B was also important.

### Sub-Decision

Sub details here.

## Implementation Notes

Implementation details follow.
Line 1.
Line 2.

## Conclusion

Final thoughts.
`;

  test('should extract a section by heading', () => {
    const result = readSectionByHeading(markdown, 'Design Decisions', 5000);
    expect(result).not.toBeNull();
    expect(result!.excerpt).toContain('## Design Decisions');
    expect(result!.excerpt).toContain('Decision A was important.');
    expect(result!.excerpt).toContain('Sub-Decision');
    // Should NOT include the next same-level heading
    expect(result!.excerpt).not.toContain('## Implementation Notes');
    expect(result!.truncated).toBe(false);
  });

  test('should be case-insensitive', () => {
    const result = readSectionByHeading(markdown, 'design decisions', 5000);
    expect(result).not.toBeNull();
    expect(result!.excerpt).toContain('## Design Decisions');
  });

  test('should truncate when section exceeds maxChars', () => {
    const result = readSectionByHeading(markdown, 'Design Decisions', 80);
    expect(result).not.toBeNull();
    expect(result!.excerpt.length).toBeLessThanOrEqual(80);
    expect(result!.truncated).toBe(true);
    expect(result!.excerpt).toContain('...(truncated)');
  });

  test('should return null when heading not found', () => {
    const result = readSectionByHeading(markdown, 'Nonexistent Section', 5000);
    expect(result).toBeNull();
  });

  test('should handle substring heading match', () => {
    const result = readSectionByHeading(markdown, 'Implementation', 5000);
    expect(result).not.toBeNull();
    expect(result!.excerpt).toContain('## Implementation Notes');
  });
});

describe('excerptAroundMatches', () => {
  const markdown = `Line 0
Line 1
Line 2 contains the keyword target here
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Line 9 also has target
Line 10
Line 11
Line 12`;

  test('should find and excerpt around matches', () => {
    const result = excerptAroundMatches(markdown, 'target', 2, 5000);
    expect(result).not.toBeNull();
    expect(result!.excerpt).toContain('keyword target');
    expect(result!.excerpt).toContain('also has target');
  });

  test('should return null when no matches', () => {
    const result = excerptAroundMatches(markdown, 'nonexistent_xyz', 2, 5000);
    expect(result).toBeNull();
  });

  test('should respect maxChars', () => {
    const result = excerptAroundMatches(markdown, 'target', 2, 40);
    expect(result).not.toBeNull();
    expect(result!.excerpt.length).toBeLessThanOrEqual(60); // small buffer for truncation marker
    expect(result!.truncated).toBe(true);
  });

  test('should be case-insensitive', () => {
    const md = 'Line A\nLine B has TARGET here\nLine C';
    const result = excerptAroundMatches(md, 'target', 1, 5000);
    expect(result).not.toBeNull();
    expect(result!.excerpt).toContain('TARGET');
  });
});

// ============================================================================
// get_targeted_context Integration Tests
// ============================================================================

describe('get_targeted_context', () => {
  const tempDir = path.join(__dirname, 'temp-kg-context-test-dir');
  const projectPath = path.join(tempDir, 'project');
  const memoryBankDir = path.join(projectPath, 'memory-bank');
  const testUserId = 'test-user';
  let memoryBankManager: MemoryBankManager;

  beforeEach(async () => {
    await fs.ensureDir(memoryBankDir);
    await fs.ensureDir(path.join(memoryBankDir, 'docs'));
    await fs.ensureDir(path.join(memoryBankDir, 'graph'));

    // Create core Memory Bank files
    await fs.writeFile(
      path.join(memoryBankDir, 'active-context.md'),
      `# Active Context

## Ongoing Tasks
- Implement knowledge graph
- Add sequential thinking

## Known Issues
- None currently

## Next Steps
- Write tests
- Update documentation

## Session Notes

`
    );

    await fs.writeFile(
      path.join(memoryBankDir, 'progress.md'),
      `# Progress

## Update History

### [Jan 1, 2025, 10:00 AM] ✨ Feature: Knowledge graph implementation
<!-- ID: p_2025-01-01_test1 -->

Initial KG implementation.

---
`
    );

    await fs.writeFile(
      path.join(memoryBankDir, 'decision-log.md'),
      `# Decision Log

## 1. Use JSONL for KG storage
- **Date:** 2025-01-01
- **Context:** Needed a simple append-only format
- **Decision:** Use JSONL event log with snapshots
`
    );

    await fs.writeFile(
      path.join(memoryBankDir, 'product-context.md'),
      `# Product Context

## Overview
Memory Bank MCP server for persisting AI context.
`
    );

    await fs.writeFile(
      path.join(memoryBankDir, 'docs/design.md'),
      `# Design Document

## Architecture

The system uses an MCP server pattern.

## Knowledge Graph Design

The KG is stored as JSONL.
Entities, observations, and relations.

## API Design

REST-like tool interface.
`
    );

    memoryBankManager = new MemoryBankManager(projectPath, testUserId);
    memoryBankManager.setMemoryBankDir(memoryBankDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test('should return valid JSON with required fields', async () => {
    const result = await handleGetTargetedContext(memoryBankManager, {
      query: 'knowledge graph',
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);

    // Check required output schema fields
    expect(parsed.query).toBe('knowledge graph');
    expect(parsed.digest).toBeDefined();
    expect(parsed.digest.text).toBeDefined();
    expect(typeof parsed.digest.chars).toBe('number');
    expect(parsed.graph).toBeDefined();
    expect(parsed.graph.hits).toBeInstanceOf(Array);
    expect(parsed.graph.opened).toBeDefined();
    expect(parsed.pointers).toBeInstanceOf(Array);
    expect(parsed.excerpts).toBeInstanceOf(Array);
    expect(parsed.budget).toBeDefined();
    expect(parsed.budget.maxChars).toBe(8000); // default
    expect(typeof parsed.budget.usedChars).toBe('number');
    expect(typeof parsed.budget.truncated).toBe('boolean');
  });

  test('budget.usedChars should not exceed maxChars', async () => {
    const result = await handleGetTargetedContext(memoryBankManager, {
      query: 'architecture',
      maxChars: 2000,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.budget.usedChars).toBeLessThanOrEqual(parsed.budget.maxChars);
  });

  test('should include digest text from active-context', async () => {
    const result = await handleGetTargetedContext(memoryBankManager, {
      query: 'tasks',
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.digest.text).toContain('knowledge graph');
  });

  test('should return error when Memory Bank not initialized', async () => {
    const uninitManager = new MemoryBankManager('/tmp/nonexistent', 'test');
    const result = await handleGetTargetedContext(uninitManager, {
      query: 'test',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not initialized');
  });

  test('should handle small maxChars gracefully', async () => {
    const result = await handleGetTargetedContext(memoryBankManager, {
      query: 'test',
      maxChars: 500,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.budget.maxChars).toBe(500);
    // Should still return valid structure even if truncated
    expect(parsed.query).toBe('test');
    expect(parsed.digest).toBeDefined();
  });
});

// ============================================================================
// Safety Tests
// ============================================================================

describe('get_targeted_context safety', () => {
  const tempDir = path.join(__dirname, 'temp-kg-safety-test-dir');
  const projectPath = path.join(tempDir, 'project');
  const memoryBankDir = path.join(projectPath, 'memory-bank');
  let memoryBankManager: MemoryBankManager;

  beforeEach(async () => {
    await fs.ensureDir(memoryBankDir);

    await fs.writeFile(
      path.join(memoryBankDir, 'active-context.md'),
      '# Active Context\n\n## Session Notes\n'
    );

    memoryBankManager = new MemoryBankManager(projectPath, 'test');
    memoryBankManager.setMemoryBankDir(memoryBankDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test('path traversal in pointers should be rejected by MemoryBankManager', async () => {
    // This test verifies that even if a pointer somehow contained
    // a traversal path, MemoryBankManager.readFile would reject it.
    // We test the safety at the MemoryBankManager layer, which
    // get_targeted_context delegates to.
    try {
      await memoryBankManager.readFile('../secrets.md');
      // If no error, the safety check failed
      expect(true).toBe(false); // should not reach here
    } catch (err) {
      expect(String(err)).toMatch(/invalid|not allowed|outside/i);
    }

    try {
      await memoryBankManager.readFile('/etc/passwd');
      expect(true).toBe(false);
    } catch (err) {
      expect(String(err)).toMatch(/invalid|not allowed|absolute|outside/i);
    }
  });
});
