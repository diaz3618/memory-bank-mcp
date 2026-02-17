#!/usr/bin/env node

/**
 * API Key Management CLI
 *
 * Standalone script for managing Memory Bank HTTP server API keys.
 * Connects directly to PostgreSQL — no running server required.
 *
 * Usage:
 *   node scripts/manage-keys.js create  --user <id> --project <id> [--label <name>] [--env live|test] [--expires <days>]
 *   node scripts/manage-keys.js list    --user <id> --project <id> [--all]
 *   node scripts/manage-keys.js revoke  --id <key-id> --user <id>
 *   node scripts/manage-keys.js rotate  --id <key-id> --user <id> --project <id>
 *
 * Environment:
 *   DATABASE_URL   PostgreSQL connection string (required)
 *
 * Examples:
 *   DATABASE_URL=postgres://user:pass@localhost:5432/mbmcp \
 *     node scripts/manage-keys.js create --user 550e8400-... --project 6ba7b810-... --label "CI Pipeline" --env live --expires 90
 *
 *   DATABASE_URL=postgres://... node scripts/manage-keys.js list --user 550e8400-... --project 6ba7b810-...
 *
 *   DATABASE_URL=postgres://... node scripts/manage-keys.js revoke --id abc123 --user 550e8400-...
 */

import { createHash, randomBytes } from 'crypto';

// ---------------------------------------------------------------------------
// Minimal PostgreSQL client (no external dependencies)
// ---------------------------------------------------------------------------

// We use dynamic import so this works in both ESM and CJS contexts.
// The pg package is expected to be available (it's already a dependency
// of the server). If not installed, the script will give a clear error.

interface PgClient {
  connect(): Promise<void>;
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
  end(): Promise<void>;
}

async function createPgClient(connectionString: string): Promise<PgClient> {
  try {
    const pg = await import('pg');
    const Client = pg.default?.Client ?? pg.Client;
    const client = new Client({ connectionString }) as PgClient;
    await client.connect();
    return client;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Cannot find module') || message.includes('pg')) {
      console.error('Error: pg package not found. Install it: npm install pg');
      process.exit(1);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// API Key generation (mirrors src/server/middleware/apiKeyAuth.ts)
// ---------------------------------------------------------------------------

function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

function generateApiKey(environment: 'live' | 'test' = 'live'): {
  plaintext: string;
  hash: Buffer;
  prefix: string;
} {
  const raw = randomBytes(32);
  const base62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let random = '';
  for (const byte of raw) {
    random += base62[byte % 62];
  }

  const plaintext = `mbmcp_${environment}_${random}`;
  const prefix = plaintext.slice(0, 16);
  const hash = Buffer.from(hashApiKey(plaintext), 'hex');

  return { plaintext, hash, prefix };
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface Args {
  command: string;
  user?: string;
  project?: string;
  id?: string;
  label?: string;
  env: 'live' | 'test';
  expires?: number;
  all: boolean;
  scopes: string[];
  rateLimit: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: '',
    env: 'live',
    all: false,
    scopes: [],
    rateLimit: 60,
  };

  // First non-flag argument is the command
  let i = 2; // skip node and script path
  if (i < argv.length && !argv[i].startsWith('-')) {
    args.command = argv[i];
    i++;
  }

  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case '--user':
        args.user = argv[++i];
        break;
      case '--project':
        args.project = argv[++i];
        break;
      case '--id':
        args.id = argv[++i];
        break;
      case '--label':
        args.label = argv[++i];
        break;
      case '--env':
        args.env = argv[++i] as 'live' | 'test';
        break;
      case '--expires':
        args.expires = parseInt(argv[++i], 10);
        break;
      case '--all':
        args.all = true;
        break;
      case '--scopes':
        args.scopes = argv[++i].split(',');
        break;
      case '--rate-limit':
        args.rateLimit = parseInt(argv[++i], 10);
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        printUsage();
        process.exit(1);
    }
    i++;
  }

  return args;
}

function printUsage(): void {
  console.log(`
API Key Management CLI

Usage:
  manage-keys <command> [options]

Commands:
  create   Create a new API key
  list     List existing API keys
  revoke   Revoke an API key
  rotate   Revoke an old key and create a new one

Options:
  --user <uuid>        User ID (required for create, list, revoke)
  --project <uuid>     Project ID (required for create, list)
  --id <uuid>          API key ID (required for revoke, rotate)
  --label <string>     Human-readable label for the key
  --env <live|test>    Environment (default: live)
  --expires <days>     Expiry in days (omit for no expiry)
  --scopes <a,b>       Comma-separated scopes (default: none)
  --rate-limit <n>     Rate limit per minute (default: 60)
  --all                Include revoked/expired keys in list
  --help, -h           Show this help

Environment Variables:
  DATABASE_URL         PostgreSQL connection string (required)

Examples:
  # Create a production API key expiring in 90 days
  DATABASE_URL=postgres://... manage-keys create \\
    --user 550e8400-e29b-41d4-a716-446655440000 \\
    --project 6ba7b810-9dad-11d1-80b4-00c04fd430c8 \\
    --label "CI Pipeline" --env live --expires 90

  # List all active keys
  DATABASE_URL=postgres://... manage-keys list \\
    --user 550e8400-... --project 6ba7b810-...

  # Revoke a key
  DATABASE_URL=postgres://... manage-keys revoke \\
    --id abc123 --user 550e8400-...
`);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdCreate(client: PgClient, args: Args): Promise<void> {
  if (!args.user || !args.project) {
    console.error('Error: --user and --project are required for create');
    process.exit(1);
  }

  const { plaintext, hash, prefix } = generateApiKey(args.env);

  let expiresAt: Date | null = null;
  if (args.expires && args.expires > 0) {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + args.expires);
  }

  const result = await client.query<{ id: string; created_at: string }>(
    `INSERT INTO api_keys (user_id, project_id, key_hash, key_prefix, label, scopes, rate_limit, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, created_at`,
    [
      args.user,
      args.project,
      hash,
      prefix,
      args.label ?? null,
      args.scopes,
      args.rateLimit,
      expiresAt,
    ],
  );

  const row = result.rows[0];

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║              API KEY CREATED SUCCESSFULLY                   ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ Key:       ${plaintext}`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ ID:        ${row.id}`);
  console.log(`║ Prefix:    ${prefix}`);
  console.log(`║ Label:     ${args.label ?? '(none)'}`);
  console.log(`║ Env:       ${args.env}`);
  console.log(`║ Scopes:    ${args.scopes.length > 0 ? args.scopes.join(', ') : '(all)'}`);
  console.log(`║ Rate Limit:${args.rateLimit}/min`);
  console.log(`║ Expires:   ${expiresAt?.toISOString() ?? 'Never'}`);
  console.log(`║ Created:   ${row.created_at}`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║ ⚠ SAVE THIS KEY NOW — IT WILL NOT BE SHOWN AGAIN           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

async function cmdList(client: PgClient, args: Args): Promise<void> {
  if (!args.user || !args.project) {
    console.error('Error: --user and --project are required for list');
    process.exit(1);
  }

  const whereClause = args.all
    ? 'WHERE user_id = $1 AND project_id = $2'
    : 'WHERE user_id = $1 AND project_id = $2 AND revoked_at IS NULL';

  interface KeyRow {
    id: string;
    key_prefix: string;
    label: string | null;
    scopes: string[];
    rate_limit: number;
    last_used_at: string | null;
    expires_at: string | null;
    created_at: string;
    revoked_at: string | null;
  }

  const result = await client.query<KeyRow>(
    `SELECT id, key_prefix, label, scopes, rate_limit, last_used_at,
            expires_at, created_at, revoked_at
     FROM api_keys
     ${whereClause}
     ORDER BY created_at DESC`,
    [args.user, args.project],
  );

  if (result.rows.length === 0) {
    console.log('No API keys found.');
    return;
  }

  console.log(`\nFound ${result.rows.length} key(s):\n`);
  console.log('─'.repeat(100));
  console.log(
    padRight('ID', 38) +
    padRight('Prefix', 18) +
    padRight('Label', 22) +
    padRight('Status', 10) +
    padRight('Created', 12),
  );
  console.log('─'.repeat(100));

  for (const row of result.rows) {
    const status = row.revoked_at
      ? '⊘ revoked'
      : row.expires_at && new Date(row.expires_at) < new Date()
        ? '⚠ expired'
        : '✓ active';

    const created = new Date(row.created_at).toISOString().slice(0, 10);

    console.log(
      padRight(row.id, 38) +
      padRight(row.key_prefix + '...', 18) +
      padRight(row.label ?? '—', 22) +
      padRight(status, 10) +
      padRight(created, 12),
    );
  }

  console.log('─'.repeat(100));
  console.log();
}

async function cmdRevoke(client: PgClient, args: Args): Promise<void> {
  if (!args.id || !args.user) {
    console.error('Error: --id and --user are required for revoke');
    process.exit(1);
  }

  const result = await client.query(
    `UPDATE api_keys
     SET revoked_at = now()
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
     RETURNING id`,
    [args.id, args.user],
  );

  if (result.rowCount === 0) {
    console.error('Error: API key not found or already revoked.');
    process.exit(1);
  }

  console.log(`\n✓ API key ${args.id} has been revoked.\n`);
}

async function cmdRotate(client: PgClient, args: Args): Promise<void> {
  if (!args.id || !args.user || !args.project) {
    console.error('Error: --id, --user, and --project are required for rotate');
    process.exit(1);
  }

  // 1. Get the old key's metadata
  interface OldKeyRow {
    label: string | null;
    scopes: string[];
    rate_limit: number;
  }

  const oldKeyResult = await client.query<OldKeyRow>(
    `SELECT label, scopes, rate_limit FROM api_keys
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [args.id, args.user],
  );

  if (oldKeyResult.rows.length === 0) {
    console.error('Error: Old API key not found or already revoked.');
    process.exit(1);
  }

  const oldKey = oldKeyResult.rows[0];

  // 2. Revoke the old key
  await client.query(
    `UPDATE api_keys SET revoked_at = now() WHERE id = $1`,
    [args.id],
  );
  console.log(`\n✓ Old key ${args.id} revoked.`);

  // 3. Create a new key with same metadata
  args.label = args.label ?? oldKey.label ?? undefined;
  args.scopes = args.scopes.length > 0 ? args.scopes : oldKey.scopes;
  args.rateLimit = args.rateLimit || oldKey.rate_limit;

  await cmdCreate(client, args);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable is required.');
    console.error('Example: DATABASE_URL=postgres://user:pass@localhost:5432/mbmcp');
    process.exit(1);
  }

  const args = parseArgs(process.argv);

  if (!args.command) {
    printUsage();
    process.exit(1);
  }

  const client = await createPgClient(databaseUrl);

  try {
    switch (args.command) {
      case 'create':
        await cmdCreate(client, args);
        break;
      case 'list':
        await cmdList(client, args);
        break;
      case 'revoke':
        await cmdRevoke(client, args);
        break;
      case 'rotate':
        await cmdRotate(client, args);
        break;
      default:
        console.error(`Unknown command: ${args.command}`);
        printUsage();
        process.exit(1);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
