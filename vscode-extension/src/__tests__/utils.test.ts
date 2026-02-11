/**
 * Pure-function utility tests
 *
 * Tests expandTildeInArgs (McpClientManager) and formatRelativeTime (extension.ts).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { expandTildeInArgs } from '../mcp/McpClientManager';
import { formatRelativeTime } from '../extension';

describe('expandTildeInArgs', () => {
  const originalHome = process.env.HOME;

  beforeEach(() => {
    process.env.HOME = '/home/testuser';
  });

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  it('expands ~/path to $HOME/path', () => {
    expect(expandTildeInArgs(['~/project', '--flag'])).toEqual([
      '/home/testuser/project',
      '--flag',
    ]);
  });

  it('leaves non-tilde args unchanged', () => {
    expect(expandTildeInArgs(['/absolute/path', 'relative/path', '--opt=~/val'])).toEqual([
      '/absolute/path',
      'relative/path',
      '--opt=~/val',
    ]);
  });

  it('handles empty args', () => {
    expect(expandTildeInArgs([])).toEqual([]);
  });

  it('only expands leading ~/', () => {
    expect(expandTildeInArgs(['~not-a-path', '~/real-path'])).toEqual([
      '~not-a-path',
      '/home/testuser/real-path',
    ]);
  });
});

describe('formatRelativeTime', () => {
  it('returns "just now" for times < 10 seconds ago', () => {
    const now = new Date();
    expect(formatRelativeTime(now)).toBe('just now');
  });

  it('returns seconds for times < 60 seconds ago', () => {
    const date = new Date(Date.now() - 30_000);
    expect(formatRelativeTime(date)).toBe('30s ago');
  });

  it('returns minutes for times < 60 minutes ago', () => {
    const date = new Date(Date.now() - 5 * 60_000);
    expect(formatRelativeTime(date)).toBe('5 min ago');
  });

  it('returns hours for times >= 60 minutes ago', () => {
    const date = new Date(Date.now() - 2 * 3600_000);
    expect(formatRelativeTime(date)).toBe('2h ago');
  });
});
