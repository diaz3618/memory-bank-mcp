# Memory Bank MCP Integration Testing Guide

> **Note**: This guide covers integration testing for the **stdio/npm transport** variant (`@diazstg/memory-bank-mcp`). The HTTP transport variant is maintained in a separate repository: [memory-bank-mcp-http](https://github.com/diaz3618/memory-bank-mcp-http). For unit and coverage testing, see [Testing Guide](./testing-guide.md).

## Overview

This guide covers how to integration-test the Memory Bank MCP server against the actual MCP protocol — spawning the server as a child process over stdio and driving it with an MCP SDK client. This mirrors exactly how AI assistants like Claude, Cursor, and Cline communicate with it in production.

## Prerequisites

- Bun ≥ 1.0 (`bun --version`)
- The package built: `bun run build`
- `@modelcontextprotocol/sdk` available (already in `devDependencies`)

## How Stdio MCP Works

```
┌──────────────────┐   stdin (JSON-RPC requests)    ┌────────────────────────┐
│  MCP Client      │ ─────────────────────────────► │  memory-bank-mcp       │
│  (Test / AI app) │                                │  process               │
│                  │ ◄───────────────────────────── │                        │
└──────────────────┘   stdout (JSON-RPC responses)  └────────────────────────┘
                                                     stderr → debug logs
```

The server is a Node/Bun process. Clients communicate via newline-delimited JSON-RPC 2.0 over stdin/stdout. There is no HTTP server to curl.

## Running Existing Integration Tests

The server-level integration tests live in `src/__tests__/server/`:

```bash
# Run all tests (includes server integration tests)
bun test

# Run only server tests
bun test src/__tests__/server/

# Run with verbose output
bun test --reporter=verbose src/__tests__/server/
```

## Writing a New Integration Test

Create a test file in `src/__tests__/server/` using Bun's test runner with the MCP SDK's `StdioClientTransport`:

```typescript
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Memory Bank MCP integration', () => {
  let client: Client;
  let transport: StdioClientTransport;
  let tmpDir: string;

  beforeAll(async () => {
    // Create an isolated temp directory for each test run
    tmpDir = mkdtempSync(join(tmpdir(), 'mb-int-test-'));

    transport = new StdioClientTransport({
      command: 'node',
      args: ['build/index.js', '--path', tmpDir, '--username', 'IntegrationTest'],
    });

    client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: { tools: {} } });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('lists tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('initialize_memory_bank');
    expect(names).toContain('track_progress');
    expect(names).toContain('switch_mode');
    expect(names).toContain('graph_search');
  });

  test('initializes memory bank', async () => {
    const result = await client.callTool({
      name: 'initialize_memory_bank',
      arguments: { path: tmpDir },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('');
    expect(text).toMatch(/initialized|created/i);
  });

  test('track_progress writes an entry', async () => {
    const result = await client.callTool({
      name: 'track_progress',
      arguments: {
        action: 'Integration test',
        description: 'Verifying stdio MCP integration',
      },
    });
    expect(result.isError).toBeFalsy();
  });

  test('read_memory_bank_file returns progress content', async () => {
    const result = await client.callTool({
      name: 'read_memory_bank_file',
      arguments: { filename: 'progress.md' },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)
      .map((c) => c.text)
      .join('');
    expect(text).toContain('Integration test');
  });

  test('switch_mode with no params returns current mode', async () => {
    const result = await client.callTool({ name: 'switch_mode', arguments: {} });
    expect(result.isError).toBeFalsy();
  });

  test('switch_mode with mode param switches mode', async () => {
    const result = await client.callTool({
      name: 'switch_mode',
      arguments: { mode: 'architect' },
    });
    expect(result.isError).toBeFalsy();
  });

  test('log_decision records an entry', async () => {
    const result = await client.callTool({
      name: 'log_decision',
      arguments: {
        title: 'Use stdio transport',
        context: 'Integration test environment',
        decision: 'Stdio is the correct transport for this server',
      },
    });
    expect(result.isError).toBeFalsy();
  });

  test('get_context_digest returns summary', async () => {
    const result = await client.callTool({
      name: 'get_context_digest',
      arguments: {},
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)
      .map((c) => c.text)
      .join('');
    expect(text.length).toBeGreaterThan(0);
  });

  test('graph_upsert_entity then graph_search roundtrip', async () => {
    await client.callTool({
      name: 'graph_upsert_entity',
      arguments: { name: 'TestService', entityType: 'service' },
    });
    const result = await client.callTool({
      name: 'graph_search',
      arguments: { query: 'TestService' },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)
      .map((c) => c.text)
      .join('');
    expect(text).toContain('TestService');
  });

  test('create_backup creates a backup', async () => {
    const result = await client.callTool({
      name: 'create_backup',
      arguments: {},
    });
    expect(result.isError).toBeFalsy();
  });

  test('create_backup with listOnly:true lists backups', async () => {
    const result = await client.callTool({
      name: 'create_backup',
      arguments: { listOnly: true },
    });
    expect(result.isError).toBeFalsy();
  });
});
```

## Manual Smoke Test via Node REPL

For quick ad-hoc testing without writing a test file:

```typescript
// smoke-test.ts  (run with: bun run smoke-test.ts)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['build/index.js', '--path', '/tmp/mb-smoke', '--debug'],
});

const client = new Client({ name: 'smoke', version: '1.0' }, { capabilities: { tools: {} } });
await client.connect(transport);

const { tools } = await client.listTools();
console.log('Tools available:', tools.length);
console.log(tools.map((t) => t.name).join('\n'));

await client.callTool({ name: 'initialize_memory_bank', arguments: { path: '/tmp/mb-smoke' } });
const status = await client.callTool({ name: 'get_memory_bank_status', arguments: {} });
console.log('\nStatus:', (status.content as any)[0].text);

await client.close();
```

```bash
bun run smoke-test.ts
```

## Verifying a Specific Tool

Use `debug_mcp_config` to dump current server configuration and state:

```typescript
const result = await client.callTool({
  name: 'debug_mcp_config',
  arguments: { verbose: true },
});
console.log((result.content as any)[0].text);
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ENOENT: build/index.js` | Package not built | Run `bun run build` first |
| `Protocol error: server not initialized` | `client.connect()` not awaited | Await `connect()` in `beforeAll` |
| Responses on stderr only | Output routing issue | Confirm server logs go to stderr not stdout |
| `Memory Bank not found` in tool response | `--path` points to empty dir | Call `initialize_memory_bank` with that path first |
| Test isolation failures | Shared temp dir | Use `mkdtempSync` to create unique dirs per suite |

## See Also

- [Testing Guide](./testing-guide.md) — Unit tests and coverage
- [MCP Protocol Specification](../reference/mcp-protocol-specification.md) — Full tool reference
- [Generic MCP Integration Guide](../integration/generic-mcp-integration.md) — Client configuration

---
