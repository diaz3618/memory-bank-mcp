# Redis Key Naming & TTL Conventions

> Branch: `feature/http-postgres-redis-supabase`  
> Source: [`src/utils/RedisManager.ts`](../../src/utils/RedisManager.ts)

## Key Naming Schema

All Redis keys follow the pattern:

```
{prefix}:{namespace}:{identifier}
```

| Component | Format | Example |
|-----------|--------|---------|
| **prefix** | `mbmcp:{env}` | `mbmcp:prod`, `mbmcp:dev`, `mbmcp:test` |
| **namespace** | One of the defined namespaces below | `session`, `apikey`, `ratelimit` |
| **identifier** | Unique ID for the cached entity | UUID, hash, IP address |

Default prefix: `mbmcp:prod` (configurable via `REDIS_KEY_PREFIX` env var).

### Full key examples

```
mbmcp:prod:session:a1b2c3d4-e5f6-7890-abcd-ef1234567890
mbmcp:prod:apikey:e3b0c44298fc1c149afbf4c8996fb924...
mbmcp:prod:ratelimit:192.168.1.100
```

## Namespaces

| Namespace | Purpose | Identifier | Payload Shape |
|-----------|---------|------------|---------------|
| `session` | MCP session data | Session UUID (`Mcp-Session-Id`) | `CachedSession` |
| `apikey` | API key validation cache | SHA-256 hash of key | `CachedApiKey` |
| `ratelimit` | Sliding window counters | User ID or IP address | Integer (counter) |

## Payload Schemas

### `CachedSession`

```typescript
interface CachedSession {
  userId: string;      // UUID of authenticated user
  projectId: string;   // UUID of bound project
  createdAt: string;   // ISO 8601 timestamp
  lastSeen: string;    // ISO 8601 timestamp (updated on touch)
}
```

### `CachedApiKey`

```typescript
interface CachedApiKey {
  userId: string;      // UUID of key owner
  projectId: string;   // UUID of bound project
  scopes: string[];    // Permission scopes (e.g., ['read', 'write'])
  rateLimit: number;   // Max requests per window for this key
}
```

### `ratelimit` (counter)

Raw integer value. No JSON wrapper. Incremented via `INCR` with `EXPIRE`.

## TTL Policy

| Namespace | TTL | Rationale |
|-----------|-----|-----------|
| `session` | 24 hours (86,400s) | Sessions expire after a day of inactivity. `touchSession()` resets TTL on each request. |
| `apikey` | 5 minutes (300s) | Short cache reduces lag between key revocation and enforcement. Postgres is the source of truth. |
| `ratelimit` | 1 minute (60s) | Sliding window for rate limiting. Counter resets after window expires. |

## Schema Validation

Payloads are validated at **read boundaries** using type guard functions in `RedisManager`:

- `isValidCachedSession(data)` — validates `CachedSession` shape
- `isValidCachedApiKey(data)` — validates `CachedApiKey` shape

If a cached value fails validation (e.g., schema drift from a deployment), it is:
1. Logged as a warning
2. Deleted from Redis (self-healing)
3. Returned as `null` (forcing fallback to Postgres)

## Environment Isolation

The key prefix ensures environment isolation:

| Environment | Prefix | Set via |
|-------------|--------|---------|
| Production | `mbmcp:prod` | `REDIS_KEY_PREFIX=mbmcp:prod` (default) |
| Development | `mbmcp:dev` | `REDIS_KEY_PREFIX=mbmcp:dev` |
| Testing | `mbmcp:test` | `REDIS_KEY_PREFIX=mbmcp:test` |

Multiple environments can safely share a single Redis instance if prefixes differ.

## Graceful Degradation

When Redis is unavailable:
- **API key auth** falls back to direct Postgres lookup (slower but functional)
- **Rate limiting** allows all requests (fail-open for availability)
- **Sessions** are managed in-memory only (no cross-instance sharing)

See [`redisResilience.test.ts`](../../src/__tests__/server/redisResilience.test.ts) for degradation test coverage.
