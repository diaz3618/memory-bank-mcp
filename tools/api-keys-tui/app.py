#!/usr/bin/env python3
"""
Memory Bank MCP -- API Key Management TUI

A Textual-based terminal UI for managing API keys.
Supports two connection modes:
  - HTTP: Uses /api/keys REST endpoints with X-API-Key authentication
  - DB:   Direct PostgreSQL access for bootstrap/admin flows

Run:
  pip install -r requirements.txt
  python app.py
"""

from __future__ import annotations

import hashlib
import os
import secrets
import string
import sys
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv
from textual import on, work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.screen import ModalScreen
from textual.widgets import (
    Button,
    DataTable,
    Footer,
    Header,
    Input,
    Label,
    OptionList,
    Select,
    Static,
    TextArea,
)
from textual.widgets.option_list import Option

# ---------------------------------------------------------------------------
# ASCII header (compact version of docs/internal/brain2)
# ---------------------------------------------------------------------------

HEADER_ART = r"""
  __  __                                 ____              _
 |  \/  | ___ _ __ ___   ___  _ __ _   _| __ )  __ _ _ __ | | __
 | |\/| |/ _ \ '_ ` _ \ / _ \| '__| | | |  _ \ / _` | '_ \| |/ /
 | |  | |  __/ | | | | | (_) | |  | |_| | |_) | (_| | | | |   <
 |_|  |_|\___|_| |_| |_|\___/|_|   \__, |____/ \__,_|_| |_|_|\_\
               API Key Manager      |___/
"""

# ---------------------------------------------------------------------------
# Key generation (mirrors server: src/server/middleware/apiKeyAuth.ts)
# ---------------------------------------------------------------------------

BASE62 = string.digits + string.ascii_uppercase + string.ascii_lowercase


def generate_api_key(environment: str = "live") -> dict[str, Any]:
    """Generate a new API key matching server format."""
    random_bytes = secrets.token_bytes(32)
    random_str = "".join(BASE62[b % 62] for b in random_bytes)
    plaintext = f"mbmcp_{environment}_{random_str}"
    prefix = plaintext[:16]
    key_hash = hashlib.sha256(plaintext.encode()).digest()
    return {"plaintext": plaintext, "prefix": prefix, "hash": key_hash}


# ---------------------------------------------------------------------------
# Backend interface
# ---------------------------------------------------------------------------


class Backend:
    """Abstract backend for API key operations."""

    async def list_keys(self, include_revoked: bool = False) -> list[dict]:
        raise NotImplementedError

    async def create_key(
        self,
        user_id: str,
        project_id: str,
        label: str | None = None,
        environment: str = "live",
        expires_in_days: int | None = None,
        scopes: list[str] | None = None,
        rate_limit: int = 60,
    ) -> dict:
        raise NotImplementedError

    async def revoke_key(self, key_id: str) -> bool:
        raise NotImplementedError

    async def get_key_info(self, key_id: str) -> dict | None:
        raise NotImplementedError


class HttpBackend(Backend):
    """REST API backend using /api/keys endpoints."""

    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    def _headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-API-Key": self.api_key,
        }

    async def list_keys(self, include_revoked: bool = False) -> list[dict]:
        import httpx

        query = "?includeRevoked=true" if include_revoked else ""
        url = f"{self.base_url}/api/keys{query}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url, headers=self._headers())
            r.raise_for_status()
            return r.json().get("keys", [])

    async def create_key(
        self,
        user_id: str,
        project_id: str,
        label: str | None = None,
        environment: str = "live",
        expires_in_days: int | None = None,
        scopes: list[str] | None = None,
        rate_limit: int = 60,
    ) -> dict:
        import httpx

        body: dict[str, Any] = {"environment": environment, "rateLimit": rate_limit}
        if label:
            body["label"] = label
        if expires_in_days and expires_in_days > 0:
            body["expiresInDays"] = expires_in_days
        if scopes:
            body["scopes"] = scopes
        url = f"{self.base_url}/api/keys"
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(url, json=body, headers=self._headers())
            r.raise_for_status()
            return r.json()

    async def revoke_key(self, key_id: str) -> bool:
        import httpx

        url = f"{self.base_url}/api/keys/{key_id}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.delete(url, headers=self._headers())
            r.raise_for_status()
            return True

    async def get_key_info(self, key_id: str) -> dict | None:
        keys = await self.list_keys(include_revoked=True)
        for k in keys:
            if k.get("id") == key_id:
                return k
        return None


class DbBackend(Backend):
    """Direct PostgreSQL backend for admin flows."""

    def __init__(self, connection_string: str):
        self.dsn = connection_string
        self._conn: Any = None

    async def _get_conn(self) -> Any:
        if self._conn is None or self._conn.closed:
            import psycopg2

            self._conn = psycopg2.connect(self.dsn)
            self._conn.autocommit = True
        return self._conn

    async def list_keys(self, include_revoked: bool = False) -> list[dict]:
        conn = await self._get_conn()
        cur = conn.cursor()
        where = "" if include_revoked else "WHERE revoked_at IS NULL"
        cur.execute(
            f"""SELECT id, key_prefix, label, scopes, rate_limit,
                       last_used_at, expires_at, created_at, revoked_at
                FROM api_keys {where}
                ORDER BY created_at DESC"""
        )
        cols = [d[0] for d in cur.description]
        rows = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            # Normalize to camelCase matching HTTP API
            revoked = d.get("revoked_at")
            expires = d.get("expires_at")
            status = "active"
            if revoked:
                status = "revoked"
            elif expires and expires < datetime.now(timezone.utc):
                status = "expired"
            rows.append(
                {
                    "id": str(d["id"]),
                    "prefix": d["key_prefix"],
                    "label": d.get("label"),
                    "scopes": d.get("scopes", []),
                    "rateLimit": d.get("rate_limit", 60),
                    "lastUsedAt": _fmt_dt(d.get("last_used_at")),
                    "expiresAt": _fmt_dt(expires),
                    "createdAt": _fmt_dt(d.get("created_at")),
                    "revokedAt": _fmt_dt(revoked),
                    "status": status,
                }
            )
        cur.close()
        return rows

    async def create_key(
        self,
        user_id: str,
        project_id: str,
        label: str | None = None,
        environment: str = "live",
        expires_in_days: int | None = None,
        scopes: list[str] | None = None,
        rate_limit: int = 60,
    ) -> dict:
        conn = await self._get_conn()
        cur = conn.cursor()

        key_data = generate_api_key(environment)
        expires_at = None
        if expires_in_days and expires_in_days > 0:
            from datetime import timedelta

            expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)

        cur.execute(
            """INSERT INTO api_keys
               (user_id, project_id, key_hash, key_prefix, label, scopes, rate_limit, expires_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING id, created_at""",
            (
                user_id,
                project_id,
                key_data["hash"],
                key_data["prefix"],
                label,
                scopes or [],
                rate_limit,
                expires_at,
            ),
        )
        row = cur.fetchone()
        cur.close()

        return {
            "id": str(row[0]),
            "key": key_data["plaintext"],
            "prefix": key_data["prefix"],
            "label": label,
            "scopes": scopes or [],
            "rateLimit": rate_limit,
            "expiresAt": _fmt_dt(expires_at),
            "createdAt": _fmt_dt(row[1]),
            "warning": "Save this key now -- it will not be shown again.",
        }

    async def revoke_key(self, key_id: str) -> bool:
        conn = await self._get_conn()
        cur = conn.cursor()
        cur.execute(
            "UPDATE api_keys SET revoked_at = now() WHERE id = %s AND revoked_at IS NULL",
            (key_id,),
        )
        affected = cur.rowcount
        cur.close()
        return affected > 0

    async def get_key_info(self, key_id: str) -> dict | None:
        keys = await self.list_keys(include_revoked=True)
        for k in keys:
            if k.get("id") == key_id:
                return k
        return None


def _fmt_dt(dt: Any) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    return dt.isoformat()


# ---------------------------------------------------------------------------
# Screens
# ---------------------------------------------------------------------------


class ConnectionScreen(ModalScreen[Backend | None]):
    """Choose connection mode and enter credentials."""

    CSS = """
    ConnectionScreen {
        align: center middle;
    }
    #conn-dialog {
        width: 72;
        height: auto;
        max-height: 36;
        border: thick $accent;
        padding: 1 2;
        background: $surface;
    }
    #conn-dialog Label {
        margin-bottom: 1;
    }
    .field-label {
        margin-top: 1;
        color: $text-muted;
    }
    #conn-buttons {
        margin-top: 1;
        height: auto;
    }
    """

    def compose(self) -> ComposeResult:
        with Vertical(id="conn-dialog"):
            yield Label("[bold]Connection Setup[/bold]")
            yield Label("Mode:", classes="field-label")
            yield Select(
                [("HTTP -- REST API (/api/keys)", "http"), ("Database -- Direct PostgreSQL", "db")],
                id="mode-select",
                value="http",
            )

            # HTTP fields
            yield Label("Server URL:", classes="field-label", id="lbl-url")
            yield Input(
                placeholder="http://localhost:3100",
                id="http-url",
                value=os.environ.get("MCP_BASE_URL", ""),
            )
            yield Label("X-API-Key:", classes="field-label", id="lbl-apikey")
            yield Input(
                placeholder="mbmcp_live_...",
                id="http-apikey",
                password=True,
                value=os.environ.get("MEMORY_BANK_API_KEY", ""),
            )

            # DB fields (hidden by default)
            yield Label("Provider:", classes="field-label", id="lbl-provider")
            yield Select(
                [("postgres (DATABASE_URL)", "postgres"), ("supabase (SUPABASE_DB_URL)", "supabase")],
                id="db-provider",
                value="postgres",
            )
            yield Label("Connection string:", classes="field-label", id="lbl-dsn")
            yield Input(
                placeholder="postgresql://user:pass@host:5432/db",
                id="db-dsn",
                password=True,
            )

            with Horizontal(id="conn-buttons"):
                yield Button("Connect", variant="primary", id="btn-connect")
                yield Button("Cancel", id="btn-cancel")

    def on_mount(self) -> None:
        self._update_field_visibility("http")
        # Pre-fill DB DSN from env
        provider = "postgres"
        dsn = os.environ.get("DATABASE_URL", "")
        if not dsn:
            dsn = os.environ.get("SUPABASE_DB_URL", "")
            if dsn:
                provider = "supabase"
        if dsn:
            self.query_one("#db-dsn", Input).value = dsn
            self.query_one("#db-provider", Select).value = provider

    @on(Select.Changed, "#mode-select")
    def mode_changed(self, event: Select.Changed) -> None:
        self._update_field_visibility(str(event.value))

    def _update_field_visibility(self, mode: str) -> None:
        http_visible = mode == "http"
        db_visible = mode == "db"
        for wid in ["lbl-url", "http-url", "lbl-apikey", "http-apikey"]:
            self.query_one(f"#{wid}").display = http_visible
        for wid in ["lbl-provider", "db-provider", "lbl-dsn", "db-dsn"]:
            self.query_one(f"#{wid}").display = db_visible

    @on(Button.Pressed, "#btn-connect")
    def do_connect(self) -> None:
        mode = self.query_one("#mode-select", Select).value
        if mode == "http":
            url = self.query_one("#http-url", Input).value.strip()
            api_key = self.query_one("#http-apikey", Input).value.strip()
            if not url:
                self.notify("Server URL is required", severity="error")
                return
            if not api_key:
                self.notify("API key is required for HTTP mode", severity="error")
                return
            self.dismiss(HttpBackend(url, api_key))
        else:
            dsn = self.query_one("#db-dsn", Input).value.strip()
            if not dsn:
                self.notify("Connection string is required", severity="error")
                return
            try:
                backend = DbBackend(dsn)
                import psycopg2

                conn = psycopg2.connect(dsn)
                conn.close()
                self.dismiss(backend)
            except Exception as e:
                self.notify(f"Connection failed: {e}", severity="error")

    @on(Button.Pressed, "#btn-cancel")
    def do_cancel(self) -> None:
        self.dismiss(None)


class CreateKeyScreen(ModalScreen[dict | None]):
    """Form for creating a new API key."""

    CSS = """
    CreateKeyScreen {
        align: center middle;
    }
    #create-dialog {
        width: 64;
        height: auto;
        max-height: 32;
        border: thick $accent;
        padding: 1 2;
        background: $surface;
    }
    .field-label {
        margin-top: 1;
        color: $text-muted;
    }
    #create-buttons {
        margin-top: 1;
        height: auto;
    }
    """

    def __init__(self, is_db_mode: bool = False) -> None:
        super().__init__()
        self.is_db_mode = is_db_mode

    def compose(self) -> ComposeResult:
        with Vertical(id="create-dialog"):
            yield Label("[bold]Create API Key[/bold]")

            if self.is_db_mode:
                yield Label("User ID:", classes="field-label")
                yield Input(placeholder="UUID", id="user-id")
                yield Label("Project ID:", classes="field-label")
                yield Input(placeholder="UUID", id="project-id")

            yield Label("Label (optional):", classes="field-label")
            yield Input(placeholder="e.g. CI Pipeline", id="key-label")

            yield Label("Environment:", classes="field-label")
            yield Select(
                [("live", "live"), ("test", "test")],
                id="key-env",
                value="live",
            )

            yield Label("Expires in days (0 = never):", classes="field-label")
            yield Input(placeholder="0", id="key-expires", value="0")

            yield Label("Rate limit (req/min):", classes="field-label")
            yield Input(placeholder="60", id="key-rate-limit", value="60")

            with Horizontal(id="create-buttons"):
                yield Button("Create", variant="primary", id="btn-create")
                yield Button("Cancel", id="btn-cancel-create")

    @on(Button.Pressed, "#btn-create")
    def do_create(self) -> None:
        result: dict[str, Any] = {}

        if self.is_db_mode:
            user_id = self.query_one("#user-id", Input).value.strip()
            project_id = self.query_one("#project-id", Input).value.strip()
            if not user_id or not project_id:
                self.notify("User ID and Project ID are required in DB mode", severity="error")
                return
            result["user_id"] = user_id
            result["project_id"] = project_id

        result["label"] = self.query_one("#key-label", Input).value.strip() or None
        result["environment"] = str(self.query_one("#key-env", Select).value)

        expires_raw = self.query_one("#key-expires", Input).value.strip()
        try:
            expires = int(expires_raw) if expires_raw else 0
        except ValueError:
            self.notify("Expires must be a number", severity="error")
            return
        result["expires_in_days"] = expires if expires > 0 else None

        rate_raw = self.query_one("#key-rate-limit", Input).value.strip()
        try:
            result["rate_limit"] = int(rate_raw) if rate_raw else 60
        except ValueError:
            self.notify("Rate limit must be a number", severity="error")
            return

        self.dismiss(result)

    @on(Button.Pressed, "#btn-cancel-create")
    def do_cancel(self) -> None:
        self.dismiss(None)


class KeyDetailScreen(ModalScreen[None]):
    """Show detailed metadata for a single key."""

    CSS = """
    KeyDetailScreen {
        align: center middle;
    }
    #detail-dialog {
        width: 72;
        height: auto;
        max-height: 28;
        border: thick $accent;
        padding: 1 2;
        background: $surface;
    }
    #detail-text {
        height: auto;
        max-height: 20;
    }
    """

    def __init__(self, key_info: dict) -> None:
        super().__init__()
        self.key_info = key_info

    def compose(self) -> ComposeResult:
        k = self.key_info
        status_marker = (
            "[green]active[/green]"
            if k.get("status") == "active"
            else "[red]revoked[/red]"
            if k.get("status") == "revoked"
            else "[yellow]expired[/yellow]"
        )

        lines = [
            f"[bold]Key Details[/bold]",
            "",
            f"  ID:         {k.get('id', '?')}",
            f"  Prefix:     {k.get('prefix', '?')}...",
            f"  Label:      {k.get('label') or '--'}",
            f"  Status:     {status_marker}",
            f"  Scopes:     {', '.join(k.get('scopes', [])) or '--'}",
            f"  Rate limit: {k.get('rateLimit', 60)}/min",
            f"  Created:    {k.get('createdAt', '?')}",
            f"  Last used:  {k.get('lastUsedAt') or '--'}",
            f"  Expires:    {k.get('expiresAt') or 'Never'}",
            f"  Revoked:    {k.get('revokedAt') or '--'}",
        ]

        with Vertical(id="detail-dialog"):
            yield Static("\n".join(lines), id="detail-text")
            yield Button("Close", id="btn-close-detail")

    @on(Button.Pressed, "#btn-close-detail")
    def do_close(self) -> None:
        self.dismiss(None)


class NewKeyResultScreen(ModalScreen[None]):
    """Show the newly created key (one-time display)."""

    CSS = """
    NewKeyResultScreen {
        align: center middle;
    }
    #result-dialog {
        width: 78;
        height: auto;
        max-height: 22;
        border: thick $warning;
        padding: 1 2;
        background: $surface;
    }
    #key-display {
        height: 3;
        margin: 1 0;
    }
    """

    def __init__(self, result: dict) -> None:
        super().__init__()
        self.result = result

    def compose(self) -> ComposeResult:
        r = self.result
        with Vertical(id="result-dialog"):
            yield Label("[bold yellow]!! SAVE THIS KEY NOW !![/bold yellow]")
            yield Label("This is the ONLY time the plaintext key will be shown.")
            yield Label("")
            yield TextArea(r.get("key", ""), id="key-display", read_only=True)
            yield Label("")
            yield Label(f"  ID:      {r.get('id', '?')}")
            yield Label(f"  Prefix:  {r.get('prefix', '?')}")
            yield Label(f"  Label:   {r.get('label') or '--'}")
            yield Label(f"  Expires: {r.get('expiresAt') or 'Never'}")
            yield Label("")
            yield Button("I have saved the key", variant="warning", id="btn-ack")

    @on(Button.Pressed, "#btn-ack")
    def do_ack(self) -> None:
        self.dismiss(None)


# ---------------------------------------------------------------------------
# Main App
# ---------------------------------------------------------------------------


class ApiKeyManagerApp(App):
    """Memory Bank API Key Manager TUI."""

    CSS = """
    #header-art {
        height: auto;
        color: $accent;
        text-align: center;
        margin-bottom: 1;
    }
    #status-bar {
        height: 1;
        background: $accent;
        color: $text;
        padding: 0 1;
    }
    #keys-table {
        height: 1fr;
    }
    #action-bar {
        height: auto;
        padding: 1 0;
        dock: bottom;
    }
    #action-bar Button {
        margin: 0 1;
    }
    """

    BINDINGS = [
        Binding("q", "quit", "Quit"),
        Binding("r", "refresh", "Refresh"),
        Binding("c", "create", "Create Key"),
        Binding("d", "revoke", "Revoke Key"),
        Binding("t", "rotate", "Rotate Key"),
        Binding("i", "inspect", "Inspect"),
        Binding("n", "reconnect", "New Connection"),
    ]

    TITLE = "Memory Bank -- API Key Manager"

    def __init__(self) -> None:
        super().__init__()
        self.backend: Backend | None = None
        self.keys: list[dict] = []
        self._show_revoked = False

    def compose(self) -> ComposeResult:
        yield Header()
        with VerticalScroll():
            yield Static(HEADER_ART.strip(), id="header-art")
            yield Static("Not connected", id="status-bar")
            yield DataTable(id="keys-table")
        with Horizontal(id="action-bar"):
            yield Button("Connect", id="btn-connect", variant="primary")
            yield Button("Refresh", id="btn-refresh")
            yield Button("Create", id="btn-create", variant="success")
            yield Button("Revoke", id="btn-revoke", variant="error")
            yield Button("Rotate", id="btn-rotate", variant="warning")
            yield Button("Inspect", id="btn-inspect")
            yield Button("Toggle Revoked", id="btn-toggle-revoked")
        yield Footer()

    def on_mount(self) -> None:
        table = self.query_one("#keys-table", DataTable)
        table.add_columns("Status", "Prefix", "Label", "Rate", "Created", "Expires", "ID")
        table.cursor_type = "row"

        # Auto-connect from environment if possible
        load_dotenv()
        self._try_auto_connect()

    def _try_auto_connect(self) -> None:
        """Try to build a backend from environment variables."""
        base_url = os.environ.get("MCP_BASE_URL", "")
        api_key = os.environ.get("MEMORY_BANK_API_KEY", "")
        if base_url and api_key:
            self.backend = HttpBackend(base_url, api_key)
            self._update_status(f"HTTP: {base_url}")
            self.action_refresh()
            return

        dsn = os.environ.get("DATABASE_URL", "") or os.environ.get("SUPABASE_DB_URL", "")
        if dsn:
            try:
                import psycopg2
                conn = psycopg2.connect(dsn)
                conn.close()
                self.backend = DbBackend(dsn)
                provider = "supabase" if "supabase" in dsn.lower() else "postgres"
                self._update_status(f"DB ({provider}): connected")
                self.action_refresh()
            except Exception:
                pass

    def _update_status(self, text: str) -> None:
        self.query_one("#status-bar", Static).update(f" {text}")

    # -- Actions --

    @on(Button.Pressed, "#btn-connect")
    def on_connect_pressed(self) -> None:
        self.action_reconnect()

    @on(Button.Pressed, "#btn-refresh")
    def on_refresh_pressed(self) -> None:
        self.action_refresh()

    @on(Button.Pressed, "#btn-create")
    def on_create_pressed(self) -> None:
        self.action_create()

    @on(Button.Pressed, "#btn-revoke")
    def on_revoke_pressed(self) -> None:
        self.action_revoke()

    @on(Button.Pressed, "#btn-rotate")
    def on_rotate_pressed(self) -> None:
        self.action_rotate()

    @on(Button.Pressed, "#btn-inspect")
    def on_inspect_pressed(self) -> None:
        self.action_inspect()

    @on(Button.Pressed, "#btn-toggle-revoked")
    def on_toggle_revoked(self) -> None:
        self._show_revoked = not self._show_revoked
        self.action_refresh()

    def action_reconnect(self) -> None:
        def on_result(backend: Backend | None) -> None:
            if backend is not None:
                self.backend = backend
                mode_label = "HTTP" if isinstance(backend, HttpBackend) else "DB"
                self._update_status(f"{mode_label}: connected")
                self.action_refresh()

        self.push_screen(ConnectionScreen(), on_result)

    @work(exclusive=True)
    async def action_refresh(self) -> None:
        if not self.backend:
            self.notify("Not connected. Press [n] or click Connect.", severity="warning")
            return
        try:
            self.keys = await self.backend.list_keys(include_revoked=self._show_revoked)
            self._populate_table()
            self._update_status(
                f"{'HTTP' if isinstance(self.backend, HttpBackend) else 'DB'}: "
                f"{len(self.keys)} key(s) | "
                f"{'showing all' if self._show_revoked else 'active only'}"
            )
        except Exception as e:
            self.notify(f"Refresh failed: {e}", severity="error")

    def _populate_table(self) -> None:
        table = self.query_one("#keys-table", DataTable)
        table.clear()
        for key in self.keys:
            status = key.get("status", "?")
            marker = (
                "[green]active [/green]"
                if status == "active"
                else "[red]revoked[/red]"
                if status == "revoked"
                else "[yellow]expired[/yellow]"
            )
            table.add_row(
                marker,
                f"{key.get('prefix', '?')}...",
                key.get("label") or "--",
                str(key.get("rateLimit", 60)),
                (key.get("createdAt") or "?")[:19],
                (key.get("expiresAt") or "Never")[:19],
                key.get("id", "?")[:8] + "...",
                key=key.get("id", ""),
            )

    def action_create(self) -> None:
        if not self.backend:
            self.notify("Connect first", severity="warning")
            return
        is_db = isinstance(self.backend, DbBackend)

        def on_result(params: dict | None) -> None:
            if params is not None:
                self._do_create(params)

        self.push_screen(CreateKeyScreen(is_db_mode=is_db), on_result)

    @work(exclusive=True)
    async def _do_create(self, params: dict) -> None:
        assert self.backend is not None
        try:
            user_id = params.pop("user_id", "")
            project_id = params.pop("project_id", "")
            result = await self.backend.create_key(
                user_id=user_id,
                project_id=project_id,
                **params,
            )
            self.notify(f"Key created: {result.get('prefix', '?')}...")

            def on_ack(_: None) -> None:
                self.action_refresh()

            self.push_screen(NewKeyResultScreen(result), on_ack)
        except Exception as e:
            self.notify(f"Create failed: {e}", severity="error")

    @work(exclusive=True)
    async def action_revoke(self) -> None:
        key = self._get_selected_key()
        if not key:
            return
        if key.get("status") != "active":
            self.notify("Only active keys can be revoked", severity="warning")
            return
        assert self.backend is not None
        try:
            ok = await self.backend.revoke_key(key["id"])
            if ok:
                self.notify(f"Key revoked: {key.get('prefix', '?')}...")
                await self.backend.list_keys(include_revoked=self._show_revoked)
                self.keys = await self.backend.list_keys(include_revoked=self._show_revoked)
                self._populate_table()
            else:
                self.notify("Key not found or already revoked", severity="warning")
        except Exception as e:
            self.notify(f"Revoke failed: {e}", severity="error")

    @work(exclusive=True)
    async def action_rotate(self) -> None:
        key = self._get_selected_key()
        if not key:
            return
        if key.get("status") != "active":
            self.notify("Only active keys can be rotated", severity="warning")
            return
        assert self.backend is not None
        try:
            # Revoke old
            await self.backend.revoke_key(key["id"])

            # Create new with same metadata
            env = "test" if key.get("prefix", "").startswith("mbmcp_test") else "live"

            create_params: dict[str, Any] = {
                "label": key.get("label"),
                "environment": env,
                "rate_limit": key.get("rateLimit", 60),
            }

            if isinstance(self.backend, DbBackend):
                # For DB mode we need user/project from original key
                # Re-fetch full info
                info = await self.backend.get_key_info(key["id"])
                if info:
                    create_params["user_id"] = info.get("user_id", "")
                    create_params["project_id"] = info.get("project_id", "")
                else:
                    self.notify("Cannot determine key owner for rotation. Use create instead.", severity="error")
                    return
            else:
                # HTTP mode - server infers user/project from auth
                create_params["user_id"] = ""
                create_params["project_id"] = ""

            result = await self.backend.create_key(**create_params)
            self.notify(f"Key rotated: old revoked, new {result.get('prefix', '?')}...")

            def on_ack(_: None) -> None:
                self.action_refresh()

            self.push_screen(NewKeyResultScreen(result), on_ack)
        except Exception as e:
            self.notify(f"Rotate failed: {e}", severity="error")

    def action_inspect(self) -> None:
        key = self._get_selected_key()
        if not key:
            return
        self.push_screen(KeyDetailScreen(key))

    def _get_selected_key(self) -> dict | None:
        if not self.backend:
            self.notify("Connect first", severity="warning")
            return None
        table = self.query_one("#keys-table", DataTable)
        if table.cursor_row is None or table.cursor_row < 0:
            self.notify("Select a key in the table first", severity="warning")
            return None
        try:
            row_key = table.get_row_at(table.cursor_row)
        except Exception:
            self.notify("No key selected", severity="warning")
            return None
        # Find key by matching row key
        try:
            key_id = str(table.get_cell_at((table.cursor_row, 6)))  # ID column
        except Exception:
            self.notify("Cannot identify selected key", severity="warning")
            return None
        # Match from cached keys - ID column is truncated, use row_key from DataTable
        cursor_coordinate = table.cursor_coordinate
        if cursor_coordinate is not None:
            row_idx = cursor_coordinate.row
            if 0 <= row_idx < len(self.keys):
                return self.keys[row_idx]
        return None


def main() -> None:
    load_dotenv()
    app = ApiKeyManagerApp()
    app.run()


if __name__ == "__main__":
    main()
