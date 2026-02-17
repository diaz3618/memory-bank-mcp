# HTTP + Postgres + Redis Deployment Guide

> Memory Bank MCP server with HTTP Streamable transport, PostgreSQL storage,
> Redis caching, and Traefik reverse proxy.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Prerequisites](#prerequisites)
3. [Local Compose Startup](#local-compose-startup)
4. [Supabase Setup](#supabase-setup)
5. [Environment Variable Reference](#environment-variable-reference)
6. [API Key Management](#api-key-management)
7. [Security Model](#security-model)
8. [Troubleshooting](#troubleshooting)
9. [Rollback Plan](#rollback-plan)

---

## Architecture

```markdown
                ┌───────────────────────────────────────────┐
                │             Client (IDE / CLI)            │
                │       X-API-Key: mbmcp_live_abc123...     │
                └──────────────────┬────────────────────────┘
                                   │ HTTPS / HTTP
                                   ▼
                ┌──────────────────────────────────────────┐
                │      Traefik v3.3 (reverse proxy)        │
                │  • TLS termination (Let's Encrypt)       │
                │  • PathPrefix routing: /mcp, /health     │
                │  • Dashboard on :8080 (dev only)         │
                └──────────────────┬───────────────────────┘
                                   │ :3100
                                   ▼
                ┌──────────────────────────────────────────┐
                │     Memory Bank MCP Server (Express)     │
                │  • Streamable HTTP transport (SSE)       │
                │  • API key auth middleware               │
                │  • Redis-backed rate limiter             │
                │  • Security headers                      │
                │  • trust proxy = 1                       │
                ├──────────┬───────────────────────────────┤
                │          │                               │
                ▼          ▼                               ▼
         ┌──────────┐  ┌───────────────┐  ┌─────────────────────┐
         │ Redis 7  │  │ PostgreSQL 17 │  │ Supabase (external) │
         │ (alpine) │  │   (alpine)    │  │  session pooler     │
         │          │  │ profile:      │  │                     │
         │ • session│  │  local-db     │  │  DB_PROVIDER=       │
         │   cache  │  │               │  │    supabase         │
         │ • rate   │  │ • RLS via     │  │                     │
         │   limits │  │   SET LOCAL   │  │ • RLS built-in      │
         │ • key    │  │ • documents   │  │ • auto TLS          │
         │   cache  │  │ • graph       │  │ • connection pooler │
         └──────────┘  │ • events      │  └─────────────────────┘
                       │ • sessions    │
                       │ • api_keys    │
                       └───────────────┘
```

### Data Flow

1. Client sends JSON-RPC over HTTP with `X-API-Key` header
2. Traefik terminates TLS and forwards to MCP server on port 3100
3. API key middleware hashes the key (SHA-256), checks Redis cache, falls back to Postgres
4. Rate limiter checks per-key and per-IP limits in Redis
5. MCP server creates per-session `StreamableHTTPServerTransport`
6. All queries run with `SET LOCAL app.current_user_id / app.current_project_id` for RLS
7. Events stored in `mcp_events` (JSONB) for SSE resumability

### Database Schema (10 tables)

| Table | Purpose |
|---|---|
| `users` | User accounts |
| `projects` | Project containers |
| `memberships` | User ↔ Project with role (owner/editor/viewer) |
| `api_keys` | SHA-256 hashed keys with scopes, rate limits, expiry |
| `documents` | Memory bank files (content + FTS vector) |
| `graph_entities` | Knowledge graph nodes |
| `graph_observations` | Observations attached to entities |
| `graph_relations` | Typed edges between entities |
| `mcp_events` | SSE event store for resumability |
| `sessions` | Active session tracking |

---

## Prerequisites

- Docker Engine 24+ with Compose v2
- Ports available: 80, 443, 8080 (Traefik), 5432 (Postgres), 6379 (Redis)
- For Supabase: an active Supabase project with the SQL Editor or `psql` access

---

## Local Compose Startup

### 1. Clone and configure

```bash
git clone https://github.com/diaz3618/memory-bank-mcp.git
cd memory-bank-mcp
git checkout feature/http-postgres-redis-supabase

cp .env.example .env
# Edit .env — at minimum set strong passwords for production
```

### 2. Start the full stack (local Postgres)

```bash
# Full stack with local PostgreSQL
docker compose --profile local-db up -d

# Verify all containers are healthy
docker compose ps

# Expected output:
#   mbmcp-traefik   running (healthy)
#   mbmcp-server    running (healthy)
#   mbmcp-postgres  running (healthy)
#   mbmcp-redis     running (healthy)
```

The Postgres container auto-runs `migrations/001_schema.sql` on first start
(mounted as `/docker-entrypoint-initdb.d`).

### 3. Start with external Supabase

```bash
# In .env:
DB_PROVIDER=supabase
SUPABASE_DB_URL=postgresql://postgres.xxxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres

# Start without local-db profile
docker compose up -d
```

### 4. Verify

```bash
# Health check
curl http://localhost/health
# → {"status":"ok","db":"ok","redis":"ok","uptime":12.34}

# Traefik dashboard (dev only)
open http://localhost:8080
```

### 5. Stop

```bash
docker compose --profile local-db down

# To also remove volumes (destroys data):
docker compose --profile local-db down -v
```

---

## Supabase Setup

The `supabase/setup/` directory contains three SQL scripts that create the
Memory Bank MCP schema on a Supabase project.

### Run order

Execute these **in order** via the Supabase SQL Editor or `psql`:

```bash
psql "$SUPABASE_DB_URL" -f supabase/setup/001_schema.sql
psql "$SUPABASE_DB_URL" -f supabase/setup/002_policies.sql
psql "$SUPABASE_DB_URL" -f supabase/setup/003_functions.sql
```

| Order | File | Description |
|-------|------|-------------|
| 1 | `001_schema.sql` | Tables, indexes, custom types |
| 2 | `002_policies.sql` | RLS policies for all tables |
| 3 | `003_functions.sql` | Helper functions, triggers, FTS search |

### Verify

```sql
SELECT * FROM schema_migrations ORDER BY applied_at;
-- Should return 3 rows: 001_schema, 002_policies, 003_functions

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('documents', 'graph_entities', 'api_keys', 'sessions');
-- All should show rowsecurity = true
```

### Connection string

Use the **session pooler** for persistent connections (port 5432 or 6543):

```bash
postgres://postgres.{ref}:{password}@aws-0-{region}.pooler.supabase.com:5432/postgres
```

**Do not use the transaction pooler** (port 6543 with `?pgbouncer=true`) — it
does not propagate `SET LOCAL` used for RLS context.

---

## Environment Variable Reference

| Variable | Default | Description |
|---|---|---|
| `MCP_TRANSPORT` | `stdio` | Transport mode: `stdio` or `http` |
| `MCP_PORT` | `3100` | HTTP listen port |
| `MCP_HOST` | `0.0.0.0` | HTTP bind host |
| `MCP_JSON_RESPONSE` | `false` | `true` for JSON instead of SSE streaming |
| `DB_PROVIDER` | `postgres` | `postgres` (local) or `supabase` |
| `DATABASE_URL` | see .env.example | PostgreSQL connection string (local) |
| `SUPABASE_DB_URL` | — | Supabase connection string |
| `DB_MAX_CONNECTIONS` | `10` (Supabase) / `20` (local) | Max pool connections |
| `REDIS_URL` | `redis://redis:6379` | Redis connection URL |
| `REDIS_KEY_PREFIX` | `mbmcp` | Redis key namespace prefix |
| `POSTGRES_DB` | `memory_bank_mcp` | Local Postgres database name |
| `POSTGRES_USER` | `mbmcp` | Local Postgres username |
| `POSTGRES_PASSWORD` | `mbmcp_secret` | Local Postgres password |
| `POSTGRES_PORT` | `5432` | Local Postgres port |
| `REDIS_PORT` | `6379` | Redis port |
| `TRAEFIK_HTTP_PORT` | `80` | Traefik HTTP port |
| `TRAEFIK_HTTPS_PORT` | `443` | Traefik HTTPS port |
| `TRAEFIK_DASHBOARD_PORT` | `8080` | Traefik dashboard port |
| `ACME_EMAIL` | — | Let's Encrypt email (uncomment in compose) |
| `DOCKER_IMAGE` | `diaz3618/memory-bank-mcp` | Docker image name |
| `DOCKER_TAG` | `1.8.0-http-pg-redis` | Docker image tag (branch-distinct, not mainline) |
| `NODE_ENV` | `production` | Node environment |

---

## API Key Management

### Key format

Keys use the prefix format `mbmcp_live_<random>` or `mbmcp_test_<random>`.

### Storage

- Keys are **SHA-256 hashed** before storage in `api_keys.key_hash` (BYTEA)
- Only the `key_prefix` (first 12 chars) is stored in plaintext for identification
- The full plaintext key is shown **once** at creation time and never stored

### Authentication flow

1. Client sends `X-API-Key: mbmcp_live_abc123...`
2. Server validates format (`mbmcp_` prefix required)
3. SHA-256 hash computed
4. Check Redis cache → if miss, query `api_keys` table
5. Verify: not revoked (`revoked_at IS NULL`), not expired (`expires_at > now()`)
6. Cache result in Redis with 5-minute TTL

### Revocation

Set `revoked_at` on the `api_keys` row. The Redis cache TTL (5 min) means
revocation takes effect within 5 minutes.

### Rate limits

Each API key has a `rate_limit` column (default: 60 req/min). The rate limiter
uses Redis sliding windows per key hash. When Redis is down, rate limiting
degrades gracefully (all requests allowed).

---

## Security Model

### Transport

- Express `trust proxy = 1` for correct client IP behind Traefik
- Request body limited to 1 MB (`express.json({ limit: '1mb' })`)
- Security headers on all responses:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 0` (modern standard, rely on CSP)
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Cache-Control: no-store`

### Data isolation (RLS)

- Every query runs inside a transaction with `SET LOCAL`:

  ```sql
  BEGIN;
  SET LOCAL app.current_user_id = '<user-uuid>';
  SET LOCAL app.current_project_id = '<project-uuid>';
  -- query executes here
  COMMIT;
  ```

- `SET LOCAL` scoping ensures isolation per transaction (not connection)
- RLS policies enforce that users can only access their own projects' data
- On error, `ROLLBACK` clears the context variables

### Resilience

| Failure | Behavior |
|---|---|
| Redis down | Rate limiter allows all, API key auth falls through to Postgres, sessions are not cached |
| Postgres down | `/health` returns 503, MCP requests fail with 500 |
| Network partition | Traefik returns 502/503 to client |

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker compose logs mbmcp-server --tail 50

# Common issues:
# - DATABASE_URL wrong → "ECONNREFUSED" or "authentication failed"
# - Redis not ready → usually self-heals via depends_on + healthcheck
# - Port conflict → change TRAEFIK_HTTP_PORT in .env
```

### Health check fails

```bash
curl -v http://localhost/health

# If db: "error" → check Postgres connection
docker compose logs postgres --tail 20

# If redis: "error" → check Redis
docker compose exec redis redis-cli ping
```

### API key rejected

```bash
# Verify key format
echo "Key must start with mbmcp_live_ or mbmcp_test_"

# Check if key is revoked/expired
docker compose exec postgres psql -U mbmcp -d memory_bank_mcp \
  -c "SELECT key_prefix, revoked_at, expires_at FROM api_keys;"
```

### Migrations not applied

```bash
# Check migration status
docker compose exec postgres psql -U mbmcp -d memory_bank_mcp \
  -c "SELECT * FROM schema_migrations;"

# Re-run manually
docker compose exec postgres psql -U mbmcp -d memory_bank_mcp \
  -f /docker-entrypoint-initdb.d/001_schema.sql
```

### SSE events not resuming

```bash
# Check event store
docker compose exec postgres psql -U mbmcp -d memory_bank_mcp \
  -c "SELECT count(*), min(created_at), max(created_at) FROM mcp_events;"

# Events older than 24h should be purged (cleanup not yet automated)
```

### Traefik dashboard insecure

The `--api.insecure=true` flag in `docker-compose.yml` exposes the dashboard
without authentication. For production:

```yaml
# Remove --api.insecure=true
# Add BasicAuth middleware:
labels:
  - "traefik.http.middlewares.auth.basicauth.users=admin:$$apr1$$..."
```

---

## Rollback Plan

### Option 1: Revert to stdio transport

The MCP server still supports stdio transport. Set `MCP_TRANSPORT=stdio` or
simply run without Docker:

```bash
npx @diazstg/memory-bank-mcp
```

This restores the original file-system-based storage with no database dependency.

### Option 2: Remove database schema

```sql
-- WARNING: Drops ALL Memory Bank data in the database
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

### Option 3: Remove Docker stack entirely

```bash
docker compose --profile local-db down -v
docker rmi diaz3618/memory-bank-mcp:1.8.0-http-pg-redis
```

### Option 4: Git revert

```bash
git checkout main
# The main branch has no HTTP/Postgres/Redis code
```
