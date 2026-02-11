/**
 * HttpMcpClient unit tests
 *
 * Tests callTool JSON parsing, error handling, and SSE response reading
 * using mocked global fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpMcpClient } from '../mcp/HttpMcpClient';

// Helper: create a fake Response with JSON body
function jsonResponse(body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// Helper: create a fake SSE stream Response
function sseResponse(events: string[], headers?: Record<string, string>): Response {
  const text = events.join('\n') + '\n';
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', ...headers },
  });
}

describe('HttpMcpClient', () => {
  let client: HttpMcpClient;
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    client = new HttpMcpClient();
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    // Pre-connect: mock initialize handshake + initialized notification
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          { jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'test' } } },
          { 'Mcp-Session-Id': 'test-session' },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 })); // initialized notification
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function connectClient() {
    await client.connect({
      mode: 'http',
      baseUrl: 'http://localhost:3000/mcp',
    });
  }

  describe('callTool', () => {
    it('parses JSON text content', async () => {
      await connectClient();
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: '2.0',
          id: 3,
          result: {
            content: [{ type: 'text', text: '{"entities":[],"relations":[]}' }],
          },
        }),
      );

      const result = await client.callTool<{ entities: unknown[]; relations: unknown[] }>(
        'graph_search',
        { query: 'test' },
      );
      expect(result).toEqual({ entities: [], relations: [] });
    });

    it('returns plain text when JSON.parse fails', async () => {
      await connectClient();
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: '2.0',
          id: 3,
          result: {
            content: [{ type: 'text', text: 'Memory Bank initialized at /test' }],
          },
        }),
      );

      const result = await client.callTool<string>('initialize_memory_bank', { path: '/test' });
      expect(result).toBe('Memory Bank initialized at /test');
    });

    it('throws on isError response', async () => {
      await connectClient();
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: '2.0',
          id: 3,
          result: {
            content: [{ type: 'text', text: 'Tool not found' }],
            isError: true,
          },
        }),
      );

      await expect(client.callTool('bad_tool', {})).rejects.toThrow('Tool not found');
    });

    it('returns undefined when content has no text', async () => {
      await connectClient();
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: '2.0',
          id: 3,
          result: {
            content: [{ type: 'text' }],
          },
        }),
      );

      const result = await client.callTool('some_tool', {});
      expect(result).toBeUndefined();
    });
  });

  describe('SSE response handling', () => {
    it('reads result from SSE stream', async () => {
      await connectClient();
      // After connect, nextId = 2. sendRequest increments to 2 then 3, etc.
      // The callTool request will use id = 2
      fetchMock.mockResolvedValueOnce(
        sseResponse(
          [
            'event: message',
            `data: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"hello"}]}}`,
            '',
          ],
        ),
      );

      const result = await client.callTool<string>('some_tool', {});
      expect(result).toBe('hello');
    });

    it('skips non-matching IDs in SSE stream', async () => {
      await connectClient();
      fetchMock.mockResolvedValueOnce(
        sseResponse([
          `data: {"jsonrpc":"2.0","id":999,"result":{"content":[{"type":"text","text":"wrong"}]}}`,
          `data: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"right"}]}}`,
          '',
        ]),
      );

      const result = await client.callTool<string>('some_tool', {});
      expect(result).toBe('right');
    });

    it('throws on RPC error in SSE stream', async () => {
      await connectClient();
      fetchMock.mockResolvedValueOnce(
        sseResponse([
          `data: {"jsonrpc":"2.0","id":2,"error":{"code":-32601,"message":"Method not found"}}`,
          '',
        ]),
      );

      await expect(client.callTool('bad_tool', {})).rejects.toThrow('RPC error -32601');
    });
  });

  describe('connect / disconnect', () => {
    it('sets connected status after successful connect', async () => {
      await connectClient();
      expect(client.getStatus().connected).toBe(true);
      expect(client.getStatus().mode).toBe('http');
    });

    it('captures session ID from response header', async () => {
      await connectClient();
      // Session was set from the initialize response header ('Mcp-Session-Id': 'test-session')
      // Verify by checking that subsequent requests include it
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ jsonrpc: '2.0', id: 3, result: { tools: [] } }),
      );
      await client.listTools();
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
      const headers = lastCall[1]?.headers as Record<string, string>;
      expect(headers['Mcp-Session-Id']).toBe('test-session');
    });

    it('rejects non-http config', async () => {
      await expect(
        client.connect({ mode: 'stdio', command: 'node', args: [] }),
      ).rejects.toThrow('HttpMcpClient requires http config');
    });

    it('clears status on disconnect', async () => {
      await connectClient();
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 })); // DELETE session
      await client.disconnect();
      expect(client.getStatus().connected).toBe(false);
    });
  });
});
