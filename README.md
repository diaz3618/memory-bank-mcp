# Memory Bank MCP

> **⚠️ Branch variant: HTTP + Postgres + Redis**
>
> You are on the `feature/http-postgres-redis-supabase` branch.
> This is an **independent deployment track** — it is NOT the npm/mainline release.
>
> - Deploy via **Docker**: `docker compose up -d`
> - See [docs/deployment/http-postgres-redis-supabase.md](docs/deployment/http-postgres-redis-supabase.md) for setup

<br></br>
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker — Docker Hub](https://github.com/diaz3618/memory-bank-mcp/actions/workflows/docker-hub.yml/badge.svg?branch=feature%2Fhttp-postgres-redis-supabase)](https://github.com/diaz3618/memory-bank-mcp/actions/workflows/docker-hub.yml)
[![Docker — GHCR](https://github.com/diaz3618/memory-bank-mcp/actions/workflows/docker-ghcr.yml/badge.svg?branch=feature%2Fhttp-postgres-redis-supabase)](https://github.com/diaz3618/memory-bank-mcp/actions/workflows/docker-ghcr.yml)

An MCP server that gives AI assistants persistent memory across sessions. This variant uses HTTP Streamable transport with Postgres/Supabase storage and Redis caching — deployed via Docker.

## Quick Start

```bash
# Pull from Docker Hub
docker pull diaz3618/memory-bank-mcp:latest-http

# Deploy the full stack (server + Postgres + Redis + Traefik)
cp .env.example .env   # Edit with your secrets
docker compose --profile local-db up -d
```

### Docker Images

<small>**Note: Both are private for now until it's tested**</small>

| Registry | Image |
|----------|-------|
| Docker Hub | `diaz3618/memory-bank-mcp:latest-http` |
| GHCR | `ghcr.io/diaz3618/memory-bank-mcp:latest-http` |

See [Deployment Guide](docs/deployment/http-postgres-redis-supabase.md) for Supabase and advanced configuration.

## Configuration

Add to your editor's MCP config (`.vscode/mcp.json`, Cursor, Claude Desktop, etc.):

```json
{
  "servers": {
    "memory-bank-mcp": {
      "type": "http",
      "url": "http://localhost/mcp",
      "headers": {
        "Authorization": "Bearer <your-api-key>"
      }
    }
  }
}
```

> **Note**: The server accepts API keys via `Authorization: Bearer <key>` or `X-API-Key: <key>` header. If not using Traefik, connect directly to port 3100: `http://localhost:3100/mcp`.

> **Tip**: Manage API keys via `POST /api/keys` (create), `GET /api/keys` (list), `DELETE /api/keys/:id` (revoke). See the [Deployment Guide](docs/deployment/http-postgres-redis-supabase.md#api-key-management).

### Environment Variables

Key environment variables (see `.env.example` for the full list):

```bash
MCP_TRANSPORT=http              # Transport mode (http)
MCP_PORT=3100                   # Server port
DB_PROVIDER=postgres            # postgres or supabase
DATABASE_URL=postgres://...     # Connection string
REDIS_URL=redis://redis:6379    # Redis connection
```

## How It Works

Memory Bank stores project context as markdown files in a `memory-bank/` directory:

| File | Purpose |
|------|---------|
| `product-context.md` | Project overview, goals, tech stack |
| `active-context.md` | Current state, ongoing tasks, next steps |
| `progress.md` | Chronological record of updates |
| `decision-log.md` | Decisions with context and rationale |
| `system-patterns.md` | Architecture and code patterns |

The AI assistant reads these files at the start of each session and updates them as work progresses, maintaining continuity across conversations.

## MCP Tools

| Tool | Description |
|------|-------------|
| `initialize_memory_bank` | Create a new Memory Bank |
| `get_memory_bank_status` | Check current status |
| `read_memory_bank_file` | Read a specific file |
| `write_memory_bank_file` | Write/update a file |
| `track_progress` | Add a progress entry |
| `log_decision` | Record a decision |
| `update_active_context` | Update current context |
| `switch_mode` | Change operational mode |
| `graph_upsert_entity` | Create or update a knowledge graph entity |
| `graph_add_observation` | Add an observation to an entity |
| `graph_link_entities` | Create a relation between entities |
| `graph_search` | Search entities by name or type |
| `graph_open_nodes` | Get full details of specific entities |
| `graph_compact` | Compact the event log |

## Modes

| Mode | Focus |
|------|-------|
| `code` | Implementation and development |
| `architect` | System design and planning |
| `ask` | Q&A and information retrieval |
| `debug` | Troubleshooting and diagnostics |
| `test` | Testing and quality assurance |

Modes can be set via CLI (`--mode code`), tool call (`switch_mode`), or `.mcprules-[mode]` files. See [Usage Modes](docs/guides/usage-modes.md).

## Architecture

This variant deploys as a Docker Compose stack:

| Service | Image | Purpose |
|---------|-------|---------|
| `mbmcp-server` | `diaz3618/memory-bank-mcp:1.8.0-http-pg-redis` | MCP server (HTTP Streamable) |
| `postgres` | `postgres:17-alpine` | Primary storage with RLS |
| `redis` | `redis:7-alpine` | Session/API key cache |
| `traefik` | `traefik:v3.3` | Reverse proxy + TLS |

## Documentation

| Topic | Link |
|-------|------|
| Getting Started | [npx usage](docs/getting-started/npx-usage.md), [build with Bun](docs/getting-started/build-with-bun.md), [custom folder](docs/getting-started/custom-folder-name.md) |
| Guides | [Remote server](docs/guides/remote-server.md), [SSH keys](docs/guides/ssh-keys-guide.md), [usage modes](docs/guides/usage-modes.md), [status system](docs/guides/memory-bank-status-prefix.md), [migration](docs/guides/migration-guide.md), [debug MCP](docs/guides/debug-mcp-config.md) |
| Integrations | [VS Code/Copilot](docs/integration/vscode-copilot-integration.md), [Claude Code](docs/integration/claude-code-integration.md), [Cursor](docs/integration/cursor-integration.md), [Cline](docs/integration/cline-integration.md), [Roo Code](docs/integration/roo-code-integration.md), [generic MCP](docs/integration/generic-mcp-integration.md) |
| Reference | [MCP protocol](docs/reference/mcp-protocol-specification.md), [rules format](docs/reference/rule-formats.md), [file naming](docs/reference/file-naming-convention.md) |
| Development | [Architecture](ARCHITECTURE.md), [testing](docs/development/testing-guide.md), [logging](docs/development/logging-system.md) |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

See [LICENSE](LICENSE).
