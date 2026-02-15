import { test, expect, describe } from 'bun:test';
import {
  handleSequentialThinking,
  handleResetSequentialThinking,
} from '../../server/tools/ThinkingTools.js';

describe('ThinkingTools', () => {
  // Reset all sessions before each test group
  describe('sequential_thinking', () => {
    test('should return metadata only — raw thought NOT in output', () => {
      // Reset first to ensure clean state
      handleResetSequentialThinking();

      const result = handleSequentialThinking({
        thought: 'This is a secret thought that should NOT appear in output',
        nextThoughtNeeded: true,
        thoughtNumber: 1,
        totalThoughts: 3,
        sessionId: 'test-no-leak',
      });

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      const parsed = JSON.parse(text);

      // Metadata fields present
      expect(parsed.thoughtNumber).toBe(1);
      expect(parsed.totalThoughts).toBe(3);
      expect(parsed.nextThoughtNeeded).toBe(true);
      expect(parsed.thoughtHistoryLength).toBe(1);
      expect(parsed.sessionId).toBe('test-no-leak');

      // Raw thought must NOT appear anywhere in the response
      expect(text).not.toContain('secret thought');
      expect(text).not.toContain('should NOT appear');

      handleResetSequentialThinking('test-no-leak');
    });

    test('should auto-adjust totalThoughts upward', () => {
      handleResetSequentialThinking('test-adjust');

      const result = handleSequentialThinking({
        thought: 'Step beyond original total',
        nextThoughtNeeded: true,
        thoughtNumber: 5,
        totalThoughts: 3,
        sessionId: 'test-adjust',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.totalThoughts).toBe(5); // auto-adjusted from 3 to 5

      handleResetSequentialThinking('test-adjust');
    });

    test('should track branches', () => {
      handleResetSequentialThinking('test-branch');

      // First thought
      handleSequentialThinking({
        thought: 'Main line',
        nextThoughtNeeded: true,
        thoughtNumber: 1,
        totalThoughts: 3,
        sessionId: 'test-branch',
      });

      // Branch from thought 1
      const result = handleSequentialThinking({
        thought: 'Alternative approach',
        nextThoughtNeeded: true,
        thoughtNumber: 2,
        totalThoughts: 3,
        branchFromThought: 1,
        branchId: 'alt-approach',
        sessionId: 'test-branch',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.branches).toContain('alt-approach');
      expect(parsed.thoughtHistoryLength).toBe(2);

      handleResetSequentialThinking('test-branch');
    });

    test('should track history length across multiple thoughts', () => {
      handleResetSequentialThinking('test-history');

      for (let i = 1; i <= 4; i++) {
        handleSequentialThinking({
          thought: `Thought ${i}`,
          nextThoughtNeeded: i < 4,
          thoughtNumber: i,
          totalThoughts: 4,
          sessionId: 'test-history',
        });
      }

      // Add one more (should auto-adjust)
      const result = handleSequentialThinking({
        thought: 'Thought 5 - extra',
        nextThoughtNeeded: false,
        thoughtNumber: 5,
        totalThoughts: 4,
        needsMoreThoughts: true,
        sessionId: 'test-history',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.thoughtHistoryLength).toBe(5);
      expect(parsed.totalThoughts).toBe(5);

      handleResetSequentialThinking('test-history');
    });
  });

  describe('reset_sequential_thinking', () => {
    test('should reset a specific session', () => {
      handleSequentialThinking({
        thought: 'test',
        nextThoughtNeeded: false,
        thoughtNumber: 1,
        totalThoughts: 1,
        sessionId: 'to-reset',
      });

      const result = handleResetSequentialThinking('to-reset');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.reset).toBe(true);
      expect(parsed.sessionId).toBe('to-reset');
      expect(parsed.existed).toBe(true);
    });

    test('should reset all sessions when no sessionId given', () => {
      handleSequentialThinking({
        thought: 'a',
        nextThoughtNeeded: false,
        thoughtNumber: 1,
        totalThoughts: 1,
        sessionId: 'sess-a',
      });
      handleSequentialThinking({
        thought: 'b',
        nextThoughtNeeded: false,
        thoughtNumber: 1,
        totalThoughts: 1,
        sessionId: 'sess-b',
      });

      const result = handleResetSequentialThinking();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.reset).toBe(true);
      expect(parsed.sessionsCleared).toBeGreaterThanOrEqual(2);
    });

    test('should handle resetting non-existent session gracefully', () => {
      const result = handleResetSequentialThinking('nonexistent-session-id');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.reset).toBe(true);
      expect(parsed.existed).toBe(false);
    });
  });

  describe('session isolation', () => {
    test('different sessionIds should have independent state', () => {
      handleResetSequentialThinking();

      handleSequentialThinking({
        thought: 'Session A thought 1',
        nextThoughtNeeded: true,
        thoughtNumber: 1,
        totalThoughts: 2,
        sessionId: 'iso-a',
      });
      handleSequentialThinking({
        thought: 'Session A thought 2',
        nextThoughtNeeded: false,
        thoughtNumber: 2,
        totalThoughts: 2,
        sessionId: 'iso-a',
      });

      const resultB = handleSequentialThinking({
        thought: 'Session B thought 1',
        nextThoughtNeeded: false,
        thoughtNumber: 1,
        totalThoughts: 1,
        sessionId: 'iso-b',
      });

      const parsedB = JSON.parse(resultB.content[0].text);
      expect(parsedB.thoughtHistoryLength).toBe(1); // B has only 1 thought

      handleResetSequentialThinking();
    });
  });
});
