import { test, expect, describe } from 'vitest';
import { allTools } from '../../server/tools/index.js';
import { coreTools } from '../../server/tools/CoreTools.js';
import { progressTools } from '../../server/tools/ProgressTools.js';
import { contextTools } from '../../server/tools/ContextTools.js';
import { decisionTools } from '../../server/tools/DecisionTools.js';
import { modeTools } from '../../server/tools/ModeTools.js';
import { graphTools } from '../../server/tools/GraphTools.js';
import { storeToolDefinitions } from '../../server/tools/StoreTools.js';
import { thinkingTools } from '../../server/tools/ThinkingTools.js';
import { kgContextTools } from '../../server/tools/KGContextTools.js';

describe('Tool Registration Alignment', () => {
  // Regression test: ensures allTools (used by init handshake AND tools/list)
  // includes every tool from every module.
  // See: docs/internal/audit/2026-03-01-tool-capability-mismatch.md

  const moduleTools = [
    ...coreTools,
    ...progressTools,
    ...contextTools,
    ...decisionTools,
    ...modeTools,
    ...graphTools,
    ...storeToolDefinitions,
    ...thinkingTools,
    ...kgContextTools,
  ];

  test('allTools includes every tool module', () => {
    expect(allTools.length).toBe(moduleTools.length);
  });

  test('allTools has exactly 36 tools', () => {
    expect(allTools.length).toBe(36);
  });

  test('allTools contains all expected tool names', () => {
    const allNames = new Set(allTools.map((t: { name: string }) => t.name));
    const moduleNames = moduleTools.map((t: { name: string }) => t.name);

    for (const name of moduleNames) {
      expect(allNames.has(name)).toBe(true);
    }
  });

  test('no duplicate tool names in allTools', () => {
    const names = allTools.map((t: { name: string }) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  test('each tool module contributes expected count', () => {
    expect(coreTools.length).toBe(19);
    expect(progressTools.length).toBe(1);
    expect(contextTools.length).toBe(1);
    expect(decisionTools.length).toBe(1);
    expect(modeTools.length).toBe(1);
    expect(graphTools.length).toBe(7);
    expect(storeToolDefinitions.length).toBe(2);
    expect(thinkingTools.length).toBe(2);
    expect(kgContextTools.length).toBe(2);
  });
});
