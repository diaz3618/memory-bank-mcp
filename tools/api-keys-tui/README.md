# Memory Bank — API Key Management TUI

A terminal UI for managing Memory Bank MCP API keys, built with [Textual](https://textual.textualize.io/).

```
  __  __                                 ____              _
 |  \/  | ___ _ __ ___   ___  _ __ _   _| __ )  __ _ _ __ | | __
 | |\/| |/ _ \ '_ ` _ \ / _ \| '__| | | |  _ \ / _` | '_ \| |/ /
 | |  | |  __/ | | | | | (_) | |  | |_| | |_) | (_| | | | |   <
 |_|  |_|\___|_| |_| |_|\___/|_|   \__, |____/ \__,_|_| |_|_|\_\
               API Key Manager      |___/
```

## Quick Start

```bash
cd tools/api-keys-tui
pip install -r requirements.txt
python app.py
```

## Connection Modes

### HTTP Mode (recommended)

Connects to a running Memory Bank HTTP server via the `/api/keys` REST endpoints.
Requires an existing API key with sufficient privileges.

| Variable | Description |
|---|---|
| `MCP_BASE_URL` | Server URL, e.g. `http://localhost:3100` |
| `MEMORY_BANK_API_KEY` | An API key for authentication (`X-API-Key` header) |

### Direct Database Mode

Connects directly to PostgreSQL for bootstrap/admin scenarios (e.g. creating the first key when no HTTP key exists yet).

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (standard provider) |
| `SUPABASE_DB_URL` | PostgreSQL connection string (Supabase provider) |

## Credential Sourcing

1. **`.env` file** — Place a `.env` in the working directory or project root. The TUI auto-loads it via `python-dotenv`.
2. **Manual entry** — Press `n` or click **Connect** to open the connection dialog and enter credentials interactively.

If environment variables are set, the TUI auto-connects on startup.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `r` | Refresh key list |
| `c` | Create new key |
| `d` | Revoke selected key |
| `t` | Rotate selected key (revoke + create with same metadata) |
| `i` | Inspect selected key metadata |
| `n` | New connection (change mode/credentials) |
| `q` | Quit |

## Features

- **List** all API keys with status, prefix, label, rate limit, dates
- **Create** keys with label, environment (live/test), expiry, rate limit
- **Revoke** active keys (soft delete)
- **Rotate** keys — atomically revokes the old key and creates a new one preserving label and settings
- **Inspect** full metadata for any key
- **Toggle** showing revoked keys
- Two connection backends: HTTP REST and Direct PostgreSQL

## Security Notes

- **Plaintext keys are shown exactly once** at creation time. Copy them immediately.
- The TUI never stores or logs plaintext keys to disk.
- In HTTP mode, the `X-API-Key` header is used for authentication — never logged.
- In DB mode, key hashes use SHA-256 matching the server implementation.
- Connection credentials entered via the dialog are held in memory only for the session lifetime.
- Key format: `mbmcp_{live|test}_{base62_32chars}`

## Requirements

- Python 3.10+
- PostgreSQL server (for DB mode) or running Memory Bank HTTP server (for HTTP mode)
- See `requirements.txt` for Python dependencies
