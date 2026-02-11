/**
 * BaseMcpClient unit tests
 *
 * Tests parsing logic in getCurrentMode() and listMemoryBankFiles()
 * using a minimal concrete subclass with a mocked callTool.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseMcpClient } from '../mcp/BaseMcpClient';

// Concrete test double that exposes callTool as a mock
class TestMcpClient extends BaseMcpClient {
  mockCallTool = vi.fn();

  async connect() { /* noop */ }
  async disconnect() { /* noop */ }
  async listTools() { return []; }
  async listResources() { return []; }
  async readResource() { return { uri: '', text: '' }; }
  async callTool<T = unknown>(name: string, args: object): Promise<T> {
    return this.mockCallTool(name, args);
  }
}

describe('BaseMcpClient', () => {
  let client: TestMcpClient;

  beforeEach(() => {
    client = new TestMcpClient();
  });

  // ---------- getCurrentMode ----------

  describe('getCurrentMode', () => {
    it('parses "Current mode: code" header line', async () => {
      client.mockCallTool.mockResolvedValue(
        'Current mode: code\nMemory Bank status: active\nUMB mode active: No',
      );
      expect(await client.getCurrentMode()).toBe('code');
    });

    it('parses mode case-insensitively', async () => {
      client.mockCallTool.mockResolvedValue('Current mode: Architect\n');
      expect(await client.getCurrentMode()).toBe('architect');
    });

    it('falls back to trimmed value for known modes', async () => {
      client.mockCallTool.mockResolvedValue('debug');
      expect(await client.getCurrentMode()).toBe('debug');
    });

    it('returns "unknown" for unrecognized text', async () => {
      client.mockCallTool.mockResolvedValue('some random output');
      expect(await client.getCurrentMode()).toBe('unknown');
    });

    it('returns "unknown" on callTool error', async () => {
      client.mockCallTool.mockRejectedValue(new Error('connection lost'));
      expect(await client.getCurrentMode()).toBe('unknown');
    });

    it('handles non-string return coerced to string', async () => {
      client.mockCallTool.mockResolvedValue({ toString: () => 'Current mode: test' });
      expect(await client.getCurrentMode()).toBe('test');
    });
  });

  // ---------- listMemoryBankFiles ----------

  describe('listMemoryBankFiles', () => {
    it('parses file list with header line', async () => {
      client.mockCallTool.mockResolvedValue(
        'Files in Memory Bank:\nactive-context.md\ndecision-log.md\nprogress.md\n',
      );
      const files = await client.listMemoryBankFiles();
      expect(files).toEqual(['active-context.md', 'decision-log.md', 'progress.md']);
    });

    it('filters out directory entries (no extension)', async () => {
      client.mockCallTool.mockResolvedValue(
        'Files in Memory Bank:\ndocs\nactive-context.md\ntemplates\nprogress.md\n',
      );
      const files = await client.listMemoryBankFiles();
      expect(files).toEqual(['active-context.md', 'progress.md']);
    });

    it('handles no header — treats all lines as files', async () => {
      client.mockCallTool.mockResolvedValue(
        'active-context.md\ndecision-log.md\n',
      );
      const files = await client.listMemoryBankFiles();
      expect(files).toEqual(['active-context.md', 'decision-log.md']);
    });

    it('trims whitespace from file names', async () => {
      client.mockCallTool.mockResolvedValue(
        'Files in Memory Bank:\n  active-context.md  \n  progress.md\n',
      );
      const files = await client.listMemoryBankFiles();
      expect(files).toEqual(['active-context.md', 'progress.md']);
    });

    it('returns empty array for empty output', async () => {
      client.mockCallTool.mockResolvedValue('');
      const files = await client.listMemoryBankFiles();
      expect(files).toEqual([]);
    });
  });

  // ---------- getContextDigest ----------

  describe('getContextDigest', () => {
    it('returns result when callTool succeeds', async () => {
      const digest = {
        digest: {
          currentContext: { tasks: ['task1'], issues: [], nextSteps: [] },
          recentProgress: [],
          recentDecisions: [],
        },
        metadata: { timestamp: '2025-01-01T00:00:00Z', memoryBankDir: '/test' },
      };
      client.mockCallTool.mockResolvedValue(digest);
      expect(await client.getContextDigest()).toEqual(digest);
    });

    it('returns fallback when callTool returns null', async () => {
      client.mockCallTool.mockResolvedValue(null);
      const result = await client.getContextDigest();
      expect(result.digest.currentContext.tasks).toEqual([]);
      expect(result.metadata.memoryBankDir).toBe('');
    });
  });

  // ---------- listStores ----------

  describe('listStores', () => {
    it('returns parsed store list', async () => {
      const data = { stores: [{ path: '/test', kind: 'local' }], selectedStoreId: 'main' };
      client.mockCallTool.mockResolvedValue(data);
      expect(await client.listStores()).toEqual(data);
    });

    it('returns fallback when callTool returns null', async () => {
      client.mockCallTool.mockResolvedValue(null);
      const result = await client.listStores();
      expect(result.stores).toEqual([]);
      expect(result.selectedStoreId).toBeNull();
    });
  });

  // ---------- Status listeners ----------

  describe('status management', () => {
    it('notifies listeners on status update', () => {
      const listener = vi.fn();
      client.onStatusChange(listener);
      (client as unknown as { updateStatus: (u: Record<string, unknown>) => void }).updateStatus({
        connected: true,
        mode: 'stdio',
      });
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ connected: true, mode: 'stdio' }),
      );
    });

    it('getStatus returns a copy', () => {
      const s1 = client.getStatus();
      const s2 = client.getStatus();
      expect(s1).toEqual(s2);
      expect(s1).not.toBe(s2);
    });
  });
});
