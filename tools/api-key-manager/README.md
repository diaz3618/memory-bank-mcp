# Memory Bank — API Key Manager

A TUI for managing Memory Bank MCP API keys, built with [Textual](https://textual.textualize.io/).

## Quick Start

```bash
cd tools/api-key-manager
pip install -r requirements.txt
python app.py
```

Or as a package:

```bash
python -m api-key-manager
```

## Features

### Key Management
- **List** all API keys with status, prefix, label, rate limit, dates
- **Create** keys with label, environment (live/test), expiry, rate limit
- **Revoke** active keys with confirmation dialog
- **Rotate** keys — atomically revokes the old key and creates a new one preserving metadata
- **Inspect** full metadata for any key via detail dialog
- **Filter/Search** — live-filter keys by prefix, label, ID, or status
- **Toggle** showing revoked/expired keys via switch widget

### UI / UX
- **TabbedContent** — Keys table + Activity Log tabs
- **Command Palette** — `Ctrl+P` to access all commands fuzzy-searchable
- **Loading Indicators** — visual feedback during async operations
- **Confirmation Dialogs** — safety prompts before revoke/rotate
- **Clipboard Support** — copy key ID or full plaintext at creation (via xclip/xsel)
- **Activity Log** — timestamped RichLog of all operations
- **Auto-Refresh** — periodic background refresh (30s)
- **Collapsible Header** — compact ASCII branding
- **Connection Health** — green/red status indicator
- **Zebra-striped DataTable** with row cursor
- **Help Screen** — F1 / ? for keyboard shortcuts reference

### Export
- **JSON** — full key metadata
- **CSV** — spreadsheet-compatible
- **Markdown** — table format for documentation

### Backends
- **HTTP** — REST API via `/api/keys` endpoints (recommended)
- **Database** — Direct PostgreSQL for bootstrap/admin scenarios

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
3. **Environment variables** — Set the variables above before launching. The TUI auto-connects on startup if found.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `F1` / `?` | Show help screen |
| `Ctrl+P` | Open command palette |
| `r` | Refresh key list |
| `c` | Create new key |
| `d` | Revoke selected key (with confirmation) |
| `t` | Rotate selected key (with confirmation) |
| `i` / `Enter` | Inspect selected key metadata |
| `n` | New connection (change mode/credentials) |
| `v` | Toggle showing revoked keys |
| `s` | Focus search/filter input |
| `x` | Export keys |
| `1` | Switch to Keys tab |
| `2` | Switch to Activity Log tab |
| `q` | Quit |

## Package Structure

```
api-key-manager/
├── __init__.py       # Package metadata (version, app name)
├── __main__.py       # Entry point for python -m
├── app.py            # Main App class with TabbedContent, command palette, etc.
├── backends.py       # Backend abstract class, HttpBackend, DbBackend
├── keygen.py         # Key generation utilities (mbmcp_{env}_{base62})
├── screens.py        # All modal screens (Connection, Create, Detail, Confirm, Help, Export)
├── requirements.txt  # Python dependencies
└── README.md         # This file
```

## Security Notes

- **Plaintext keys are shown exactly once** at creation time. Copy them immediately.
- The TUI never stores or logs plaintext keys to disk.
- In HTTP mode, the `X-API-Key` header is used for authentication — never logged.
- In DB mode, key hashes use SHA-256 matching the server implementation.
- Connection credentials entered via the dialog are held in memory only for the session lifetime.
- Key format: `mbmcp_{live|test}_{base62_32chars}`
- Credential fields have "Show/Hide" toggle (passwords masked by default).

## Requirements

- Python 3.10+
- PostgreSQL server (for DB mode) or running Memory Bank HTTP server (for HTTP mode)
- `xclip` or `xsel` for clipboard support (optional)
- See `requirements.txt` for Python dependencies

### Python Dependencies

```
textual>=0.47.0
httpx>=0.27.0
psycopg2-binary>=2.9.9
python-dotenv>=1.0.1
```
