# Supabase Setup — Memory Bank MCP

These SQL scripts set up the Memory Bank MCP database schema on a **Supabase** project.

## Prerequisites

- A Supabase project (free tier or above)
- Access to the SQL Editor in the Supabase Dashboard, or `psql` connected to your Supabase database

## Connection

Use the **session pooler** connection string for persistent server connections:

```
postgres://postgres.{ref}:{password}@aws-0-{region}.pooler.supabase.com:5432/postgres
```

Or use the **direct** connection for migrations (IPv6 required):

```
postgresql://postgres:{password}@db.{ref}.supabase.co:5432/postgres
```

Find your connection strings at: **Supabase Dashboard → Settings → Database → Connection string**

## Run Order

Execute these scripts **in order** via the SQL Editor or `psql`:

```bash
# Option A: Supabase SQL Editor
# Paste each file contents into the SQL Editor and click "Run"

# Option B: psql
psql "$SUPABASE_DB_URL" -f supabase/setup/001_schema.sql
psql "$SUPABASE_DB_URL" -f supabase/setup/002_policies.sql
psql "$SUPABASE_DB_URL" -f supabase/setup/003_functions.sql
```

| Order | File | Description |
|-------|------|-------------|
| 1 | `001_schema.sql` | Tables, indexes, types |
| 2 | `002_policies.sql` | RLS policies for all tables |
| 3 | `003_functions.sql` | Helper functions, triggers, FTS search |

## Verification

After running all three scripts, verify the setup:

```sql
-- Check all migrations applied
SELECT * FROM schema_migrations ORDER BY applied_at;

-- Should return 3 rows: 001_schema, 002_policies, 003_functions

-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('documents', 'graph_entities', 'api_keys', 'sessions');
```

## Supabase API Keys

Memory Bank MCP uses its **own** API key system (`mbmcp_*` keys), not Supabase API keys.

Supabase keys are only used for:
- **Connection string** — the MCP server connects to Supabase Postgres using the DB password
- **Service role key** (`sb_secret_...`) — for migration scripts that need to bypass RLS

| Supabase Key | Prefix | Use in Memory Bank MCP |
|---|---|---|
| Publishable | `sb_publishable_...` | NOT used |
| Secret | `sb_secret_...` | Migrations only |

## Rollback

To completely remove the Memory Bank MCP schema:

```sql
-- WARNING: This drops ALL Memory Bank data!
BEGIN;
  DROP TABLE IF EXISTS mcp_events CASCADE;
  DROP TABLE IF EXISTS sessions CASCADE;
  DROP TABLE IF EXISTS graph_relations CASCADE;
  DROP TABLE IF EXISTS graph_observations CASCADE;
  DROP TABLE IF EXISTS graph_entities CASCADE;
  DROP TABLE IF EXISTS documents CASCADE;
  DROP TABLE IF EXISTS api_keys CASCADE;
  DROP TABLE IF EXISTS memberships CASCADE;
  DROP TABLE IF EXISTS projects CASCADE;
  DROP TABLE IF EXISTS users CASCADE;
  DROP TABLE IF EXISTS schema_migrations CASCADE;
  DROP TYPE IF EXISTS project_role CASCADE;
  DROP SCHEMA IF EXISTS app CASCADE;
COMMIT;
```

## Environment Variables

Set these in your `.env` file for Supabase mode:

```bash
DB_PROVIDER=supabase
SUPABASE_DB_URL=postgres://postgres.{ref}:{password}@aws-0-{region}.pooler.supabase.com:5432/postgres
SUPABASE_SERVICE_KEY=sb_secret_...   # Only for migrations
```
