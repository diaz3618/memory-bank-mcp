#!/usr/bin/env python3
"""
Memory Bank MCP — API Key Manager TUI

A fully-featured terminal UI for managing API keys, built with Textual.
Supports two connection modes:
  - HTTP: REST API via /api/keys endpoints (recommended)
  - DB:   Direct PostgreSQL for bootstrap/admin flows

Run:
  pip install -r requirements.txt
  python app.py

Package entry point:
  python -m api-key-manager
"""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv
from textual import on, work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.command import Hit, Hits, Provider
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.reactive import reactive
from textual.timer import Timer
from textual.widgets import (
    Button,
    Collapsible,
    DataTable,
    Footer,
    Header,
    Input,
    Label,
    LoadingIndicator,
    RichLog,
    Rule,
    Static,
    Switch,
    TabbedContent,
    TabPane,
)

from backends import Backend, DbBackend, HttpBackend, backend_from_env
from screens import (
    ConfirmScreen,
    ConnectionScreen,
    CreateKeyScreen,
    ExportScreen,
    HelpScreen,
    KeyDetailScreen,
    NewKeyResultScreen,
)

# ---------------------------------------------------------------------------
# ASCII header
# ---------------------------------------------------------------------------

HEADER_ART = r"""
█▀▄▀█ █▀▀ █▀▄▀█ █▀█ █▀█ █▄█   █▄▄ ▄▀█ █▄ █ █▄▀
█ ▀ █ ██▄ █ ▀ █ █▄█ █▀▄  █    █▄█ █▀█ █ ▀█ █ █
API Key Manager              
"""

## HEADER_ART = r"""
##   __  __                                 ____              _
##  |  \/  | ___ _ __ ___   ___  _ __ _   _| __ )  __ _ _ __ | | __
##  | |\/| |/ _ \ '_ ` _ \ / _ \| '__| | | |  _ \ / _` | '_ \| |/ /
##  | |  | |  __/ | | | | | (_) | |  | |_| | |_) | (_| | | | |   <
##  |_|  |_|\___|_| |_| |_|\___/|_|   \__, |____/ \__,_|_| |_|_|\_\
##                API Key Manager     |___/
## """


# ---------------------------------------------------------------------------
# Command palette provider
# ---------------------------------------------------------------------------


class KeyManagerCommands(Provider):
    """Command palette provider for all key manager actions."""

    async def search(self, query: str) -> Hits:
        app = self.app
        assert isinstance(app, ApiKeyManagerApp)

        commands: list[tuple[str, str, str]] = [
            ("Create Key", "Create a new API key", "action_create"),
            ("Refresh", "Refresh the key list", "action_refresh"),
            ("Revoke Key", "Revoke the selected key", "action_revoke"),
            ("Rotate Key", "Rotate the selected key", "action_rotate"),
            ("Inspect Key", "Show details for the selected key", "action_inspect"),
            ("New Connection", "Change connection settings", "action_reconnect"),
            ("Toggle Revoked", "Show/hide revoked keys", "action_toggle_revoked"),
            ("Export Keys", "Export key list to file", "action_export"),
            ("Help", "Show keyboard shortcuts", "action_help"),
            ("Focus Search", "Focus the search filter input", "action_focus_search"),
            ("Switch to Keys Tab", "Show the keys table", "action_tab_keys"),
            ("Switch to Activity Tab", "Show the activity log", "action_tab_activity"),
            ("Quit", "Exit the application", "action_quit"),
        ]

        matcher = self.matcher(query)
        for name, description, action in commands:
            score = matcher.match(name)
            if score > 0:
                yield Hit(
                    score,
                    matcher.highlight(name),
                    partial=None,
                    help=description,
                )


# ---------------------------------------------------------------------------
# Main application
# ---------------------------------------------------------------------------


class ApiKeyManagerApp(App):
    """Memory Bank API Key Manager — Full-featured TUI."""

    COMMANDS = {KeyManagerCommands}

    CSS = """
    /* ── Layout ─────────────────────────────────────────────── */

    #header-art {
        height: auto;
        color: $accent;
        text-align: center;
        padding: 0 0;
    }

    #status-row {
        height: 1;
        background: $primary-background-darken-2;
        padding: 0 2;
    }

    #conn-indicator {
        width: auto;
        min-width: 3;
    }

    #conn-status {
        width: 1fr;
    }

    #key-count {
        width: auto;
        min-width: 10;
        text-align: right;
    }

    /* ── Filter bar ─────────────────────────────────────────── */

    #filter-bar {
        height: 3;
        padding: 0 1;
    }

    #search-input {
        width: 1fr;
        margin-right: 1;
    }

    #show-revoked-label {
        width: auto;
        padding: 1 1 0 0;
    }

    #show-revoked {
        width: auto;
        padding-top: 1;
    }

    /* ── Tabs ───────────────────────────────────────────────── */

    #main-tabs {
        height: 1fr;
    }

    #keys-table {
        height: 1fr;
    }

    #activity-log {
        height: 1fr;
        border: none;
        padding: 0 1;
    }

    /* ── Action bar ─────────────────────────────────────────── */

    #action-bar {
        height: auto;
        padding: 0 1;
        dock: bottom;
        background: $surface;
    }

    #action-bar Button {
        margin: 0 0 0 1;
        min-width: 12;
    }

    /* ── Loading overlay ────────────────────────────────────── */

    #loading-overlay {
        display: none;
        height: 3;
        width: 100%;
    }

    #loading-overlay.visible {
        display: block;
    }

    /* ── Misc ───────────────────────────────────────────────── */

    Collapsible {
        padding: 0;
        border: none;
    }

    DataTable {
        height: 1fr;
    }

    DataTable > .datatable--cursor {
        background: $accent 30%;
    }
    """

    BINDINGS = [
        Binding("q", "quit", "Quit", priority=True),
        Binding("f1", "help", "Help"),
        Binding("question_mark", "help", "Help", show=False),
        Binding("r", "refresh", "Refresh"),
        Binding("c", "create", "Create"),
        Binding("d", "revoke", "Revoke"),
        Binding("t", "rotate", "Rotate"),
        Binding("i", "inspect", "Inspect"),
        Binding("enter", "inspect", "Inspect", show=False),
        Binding("n", "reconnect", "Connect"),
        Binding("v", "toggle_revoked", "Toggle revoked"),
        Binding("s", "focus_search", "Search", show=False),
        Binding("x", "export", "Export"),
        Binding("1", "tab_keys", "Keys tab", show=False),
        Binding("2", "tab_activity", "Activity tab", show=False),
    ]

    TITLE = "Memory Bank — API Key Manager"
    SUB_TITLE = "v1.0.0"

    # Reactive state
    connected: reactive[bool] = reactive(False)
    show_revoked: reactive[bool] = reactive(False)
    key_count: reactive[int] = reactive(0)

    def __init__(self) -> None:
        super().__init__()
        self.backend: Backend | None = None
        self.keys: list[dict] = []
        self._filter_text: str = ""
        self._auto_refresh_timer: Timer | None = None
        self._auto_refresh_seconds: int = 30

    # ── Compose ─────────────────────────────────────────────

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)

        with VerticalScroll():
            # ASCII branding (collapsible)
            with Collapsible(title="Memory Bank", collapsed=False):
                yield Static(HEADER_ART.strip(), id="header-art")

            # Status bar
            with Horizontal(id="status-row"):
                yield Static("●", id="conn-indicator")
                yield Static(" Not connected", id="conn-status")
                yield Static("0 keys", id="key-count")

            yield Rule()

            # Filter bar
            with Horizontal(id="filter-bar"):
                yield Input(
                    placeholder="Filter keys by prefix, label, or ID…",
                    id="search-input",
                )
                yield Label("Show revoked", id="show-revoked-label")
                yield Switch(value=False, id="show-revoked")

            # Loading indicator
            yield LoadingIndicator(id="loading-overlay")

            # Tabbed main content
            with TabbedContent(id="main-tabs"):
                with TabPane("Keys", id="tab-keys"):
                    yield DataTable(id="keys-table")
                with TabPane("Activity Log", id="tab-activity"):
                    yield RichLog(
                        id="activity-log",
                        highlight=True,
                        markup=True,
                    )

        # Action buttons
        with Horizontal(id="action-bar"):
            yield Button("Connect", id="btn-connect", variant="primary")
            yield Button("Refresh", id="btn-refresh")
            yield Button("Create", id="btn-create", variant="success")
            yield Button("Revoke", id="btn-revoke", variant="error")
            yield Button("Rotate", id="btn-rotate", variant="warning")
            yield Button("Inspect", id="btn-inspect")
            yield Button("Export", id="btn-export")
            yield Button("Help", id="btn-help")

        yield Footer()

    # ── Lifecycle ───────────────────────────────────────────

    def on_mount(self) -> None:
        """Initialize table columns, auto-connect, start timers."""
        table = self.query_one("#keys-table", DataTable)
        table.add_columns(
            "Status",
            "Prefix",
            "Label",
            "Rate",
            "Created",
            "Expires",
            "ID",
        )
        table.cursor_type = "row"
        table.zebra_stripes = True

        self._log_activity("Application started")

        # Auto-connect from environment
        load_dotenv()
        self._try_auto_connect()

    def _try_auto_connect(self) -> None:
        """Try to build a backend from environment variables."""
        backend = backend_from_env()
        if backend:
            self.backend = backend
            self.connected = True
            self._update_status()
            self._log_activity(
                f"Auto-connected via {backend.name} ({backend.display_info})"
            )
            self.action_refresh()
            self._start_auto_refresh()

    # ── Reactive watchers ───────────────────────────────────

    def watch_connected(self, value: bool) -> None:
        indicator = self.query_one("#conn-indicator", Static)
        if value:
            indicator.update("[bold green]●[/bold green]")
        else:
            indicator.update("[bold red]●[/bold red]")

    def watch_key_count(self, count: int) -> None:
        label = "key" if count == 1 else "keys"
        self.query_one("#key-count", Static).update(f"{count} {label}")

    def watch_show_revoked(self, value: bool) -> None:
        try:
            self.query_one("#show-revoked", Switch).value = value
        except Exception:
            pass
        if self.backend:
            self.action_refresh()

    # ── Status management ───────────────────────────────────

    def _update_status(self) -> None:
        if not self.backend:
            self.query_one("#conn-status", Static).update(" Not connected")
            return

        mode = self.backend.name
        info = self.backend.display_info
        revoked_text = " | including revoked" if self.show_revoked else ""
        self.query_one("#conn-status", Static).update(
            f" {mode}: {info}{revoked_text}"
        )

    # ── Activity log ────────────────────────────────────────

    def _log_activity(self, message: str, level: str = "info") -> None:
        """Write a timestamped entry to the activity log."""
        log = self.query_one("#activity-log", RichLog)
        now = datetime.now(timezone.utc).strftime("%H:%M:%S")
        color = {
            "info": "cyan",
            "success": "green",
            "warning": "yellow",
            "error": "red",
        }.get(level, "white")
        log.write(f"[dim]{now}[/dim]  [{color}]{message}[/{color}]")

    # ── Loading state ───────────────────────────────────────

    def _show_loading(self) -> None:
        self.query_one("#loading-overlay").add_class("visible")

    def _hide_loading(self) -> None:
        self.query_one("#loading-overlay").remove_class("visible")

    # ── Auto-refresh ────────────────────────────────────────

    def _start_auto_refresh(self) -> None:
        if self._auto_refresh_timer:
            self._auto_refresh_timer.stop()
        self._auto_refresh_timer = self.set_interval(
            self._auto_refresh_seconds,
            self._do_auto_refresh,
        )

    def _do_auto_refresh(self) -> None:
        if self.backend and self.connected:
            self.action_refresh()

    # ── Event handlers ──────────────────────────────────────

    @on(Switch.Changed, "#show-revoked")
    def on_show_revoked_changed(self, event: Switch.Changed) -> None:
        self.show_revoked = event.value

    @on(Input.Changed, "#search-input")
    def on_search_changed(self, event: Input.Changed) -> None:
        self._filter_text = event.value.strip().lower()
        self._populate_table()

    @on(DataTable.RowSelected, "#keys-table")
    def on_row_selected(self, event: DataTable.RowSelected) -> None:
        self.action_inspect()

    # ── Button handlers ─────────────────────────────────────

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

    @on(Button.Pressed, "#btn-export")
    def on_export_pressed(self) -> None:
        self.action_export()

    @on(Button.Pressed, "#btn-help")
    def on_help_pressed(self) -> None:
        self.action_help()

    # ── Actions ─────────────────────────────────────────────

    def action_help(self) -> None:
        self.push_screen(HelpScreen())

    def action_focus_search(self) -> None:
        self.query_one("#search-input", Input).focus()

    def action_tab_keys(self) -> None:
        tabs = self.query_one("#main-tabs", TabbedContent)
        tabs.active = "tab-keys"

    def action_tab_activity(self) -> None:
        tabs = self.query_one("#main-tabs", TabbedContent)
        tabs.active = "tab-activity"

    def action_reconnect(self) -> None:
        def on_result(backend: Backend | None) -> None:
            if backend is not None:
                self.backend = backend
                self.connected = True
                self._update_status()
                self._log_activity(
                    f"Connected via {backend.name} ({backend.display_info})",
                    "success",
                )
                self.action_refresh()
                self._start_auto_refresh()

        self.push_screen(ConnectionScreen(), on_result)

    @work(exclusive=True, group="refresh")
    async def action_refresh(self) -> None:
        if not self.backend:
            self.notify("Not connected. Press [n] or click Connect.", severity="warning")
            return

        self._show_loading()
        try:
            self.keys = await self.backend.list_keys(
                include_revoked=self.show_revoked
            )
            self.key_count = len(self.keys)
            self._populate_table()
            self._update_status()
            self._log_activity(
                f"Refreshed: {len(self.keys)} key(s) loaded"
                + (" (including revoked)" if self.show_revoked else "")
            )
        except Exception as e:
            self.notify(f"Refresh failed: {e}", severity="error")
            self._log_activity(f"Refresh failed: {e}", "error")
            self.connected = False
        finally:
            self._hide_loading()

    def action_toggle_revoked(self) -> None:
        self.show_revoked = not self.show_revoked

    def action_create(self) -> None:
        if not self.backend:
            self.notify("Connect first", severity="warning")
            return
        is_db = isinstance(self.backend, DbBackend)

        def on_result(params: dict | None) -> None:
            if params is not None:
                self._do_create(params)

        self.push_screen(CreateKeyScreen(is_db_mode=is_db), on_result)

    @work(exclusive=True, group="mutate")
    async def _do_create(self, params: dict) -> None:
        assert self.backend is not None
        self._show_loading()
        try:
            # In DB mode, resolve username/project_name → UUIDs
            if isinstance(self.backend, DbBackend):
                username = params.pop("username", "")
                project_name = params.pop("project_name", "")
                user_id = await self.backend.find_or_create_user(username)
                project_id = await self.backend.find_or_create_project(
                    project_name, user_id
                )
            else:
                user_id = params.pop("user_id", "")
                project_id = params.pop("project_id", "")

            result = await self.backend.create_key(
                user_id=user_id,
                project_id=project_id,
                **params,
            )
            prefix = result.get("prefix", "?")
            label = result.get("label") or "—"
            self.notify(f"Key created: {prefix}...")
            self._log_activity(
                f"Created key [bold]{prefix}...[/bold] ({label})", "success"
            )

            def on_ack(_: None) -> None:
                self.action_refresh()

            self.push_screen(NewKeyResultScreen(result), on_ack)
        except Exception as e:
            self.notify(f"Create failed: {e}", severity="error")
            self._log_activity(f"Create failed: {e}", "error")
        finally:
            self._hide_loading()

    def action_revoke(self) -> None:
        key = self._get_selected_key()
        if not key:
            return
        if key.get("status") != "active":
            self.notify("Only active keys can be revoked", severity="warning")
            return

        prefix = key.get("prefix", "?")

        def on_confirm(confirmed: bool) -> None:
            if confirmed:
                self._do_revoke(key)

        self.push_screen(
            ConfirmScreen(
                title="Revoke API Key",
                body=f"Are you sure you want to revoke key [bold]{prefix}...[/bold]?\n"
                f"Label: {key.get('label') or '—'}\n"
                "This action cannot be undone.",
                confirm_label="Revoke",
            ),
            on_confirm,
        )

    @work(exclusive=True, group="mutate")
    async def _do_revoke(self, key: dict) -> None:
        assert self.backend is not None
        self._show_loading()
        try:
            ok = await self.backend.revoke_key(key["id"])
            if ok:
                prefix = key.get("prefix", "?")
                self.notify(f"Key revoked: {prefix}...")
                self._log_activity(
                    f"Revoked key [bold]{prefix}...[/bold]", "warning"
                )
                self.keys = await self.backend.list_keys(
                    include_revoked=self.show_revoked
                )
                self.key_count = len(self.keys)
                self._populate_table()
            else:
                self.notify("Key not found or already revoked", severity="warning")
        except Exception as e:
            self.notify(f"Revoke failed: {e}", severity="error")
            self._log_activity(f"Revoke failed: {e}", "error")
        finally:
            self._hide_loading()

    def action_rotate(self) -> None:
        key = self._get_selected_key()
        if not key:
            return
        if key.get("status") != "active":
            self.notify("Only active keys can be rotated", severity="warning")
            return

        prefix = key.get("prefix", "?")

        def on_confirm(confirmed: bool) -> None:
            if confirmed:
                self._do_rotate(key)

        self.push_screen(
            ConfirmScreen(
                title="Rotate API Key",
                body=f"Rotate key [bold]{prefix}...[/bold]?\n"
                f"Label: {key.get('label') or '—'}\n"
                "The old key will be revoked and a new one created.",
                confirm_label="Rotate",
            ),
            on_confirm,
        )

    @work(exclusive=True, group="mutate")
    async def _do_rotate(self, key: dict) -> None:
        assert self.backend is not None
        self._show_loading()
        try:
            # Revoke old key
            await self.backend.revoke_key(key["id"])

            # Create new with same metadata
            env = "test" if key.get("prefix", "").startswith("mbmcp_test") else "live"
            create_params: dict[str, Any] = {
                "label": key.get("label"),
                "environment": env,
                "rate_limit": key.get("rateLimit", 60),
            }

            if isinstance(self.backend, DbBackend):
                info = await self.backend.get_key_info(key["id"])
                if info:
                    create_params["user_id"] = info.get("user_id", "")
                    create_params["project_id"] = info.get("project_id", "")
                else:
                    self.notify(
                        "Cannot determine key owner for rotation.",
                        severity="error",
                    )
                    return
            else:
                create_params["user_id"] = ""
                create_params["project_id"] = ""

            result = await self.backend.create_key(**create_params)
            new_prefix = result.get("prefix", "?")
            old_prefix = key.get("prefix", "?")
            self.notify(f"Rotated: {old_prefix}... → {new_prefix}...")
            self._log_activity(
                f"Rotated key [bold]{old_prefix}...[/bold] → [bold]{new_prefix}...[/bold]",
                "success",
            )

            def on_ack(_: None) -> None:
                self.action_refresh()

            self.push_screen(NewKeyResultScreen(result), on_ack)
        except Exception as e:
            self.notify(f"Rotate failed: {e}", severity="error")
            self._log_activity(f"Rotate failed: {e}", "error")
        finally:
            self._hide_loading()

    def action_inspect(self) -> None:
        key = self._get_selected_key()
        if not key:
            return
        self._log_activity(f"Inspecting key {key.get('prefix', '?')}...")
        self.push_screen(KeyDetailScreen(key))

    def action_export(self) -> None:
        if not self.keys:
            self.notify("No keys to export", severity="warning")
            return

        def on_result(spec: str | None) -> None:
            if spec:
                self._do_export(spec)

        self.push_screen(ExportScreen(), on_result)

    @work(exclusive=True, group="export")
    async def _do_export(self, spec: str) -> None:
        fmt, filename = spec.split(":", 1)
        try:
            if fmt == "json":
                content = json.dumps(self.keys, indent=2, default=str)
            elif fmt == "csv":
                buf = io.StringIO()
                if self.keys:
                    writer = csv.DictWriter(buf, fieldnames=self.keys[0].keys())
                    writer.writeheader()
                    writer.writerows(self.keys)
                content = buf.getvalue()
            elif fmt == "md":
                if not self.keys:
                    content = "No keys."
                else:
                    headers = ["Status", "Prefix", "Label", "Rate", "Created", "Expires", "ID"]
                    rows = []
                    for k in self.keys:
                        rows.append([
                            k.get("status", "?"),
                            f"{k.get('prefix', '?')}...",
                            k.get("label") or "—",
                            str(k.get("rateLimit", 60)),
                            (k.get("createdAt") or "?")[:19],
                            (k.get("expiresAt") or "Never")[:19],
                            k.get("id", "?")[:8] + "...",
                        ])
                    content = _markdown_table(headers, rows)
            else:
                content = json.dumps(self.keys, indent=2, default=str)

            with open(filename, "w") as f:
                f.write(content)

            self.notify(f"Exported {len(self.keys)} keys to {filename}")
            self._log_activity(
                f"Exported {len(self.keys)} keys → {filename} ({fmt})", "success"
            )
        except Exception as e:
            self.notify(f"Export failed: {e}", severity="error")
            self._log_activity(f"Export failed: {e}", "error")

    # ── Table management ────────────────────────────────────

    def _populate_table(self) -> None:
        """Populate the DataTable with (optionally filtered) keys."""
        table = self.query_one("#keys-table", DataTable)
        table.clear()

        filtered = self._filtered_keys()
        for key in filtered:
            status = key.get("status", "?")
            marker = {
                "active": "[bold green]● active [/bold green]",
                "revoked": "[bold red]● revoked[/bold red]",
                "expired": "[bold yellow]● expired[/bold yellow]",
            }.get(status, f"[dim]  {status}[/dim]")

            table.add_row(
                marker,
                f"{key.get('prefix', '?')}...",
                key.get("label") or "—",
                str(key.get("rateLimit", 60)),
                (key.get("createdAt") or "?")[:19],
                (key.get("expiresAt") or "Never")[:19],
                key.get("id", "?")[:12] + "…",
                key=key.get("id", ""),
            )

        # Update count based on filtered results
        if self._filter_text:
            self.query_one("#key-count", Static).update(
                f"{len(filtered)}/{len(self.keys)} keys"
            )

    def _filtered_keys(self) -> list[dict]:
        """Return keys matching the current filter text."""
        if not self._filter_text:
            return self.keys

        q = self._filter_text
        results = []
        for k in self.keys:
            searchable = " ".join(
                str(v)
                for v in [
                    k.get("prefix", ""),
                    k.get("label", ""),
                    k.get("id", ""),
                    k.get("status", ""),
                ]
            ).lower()
            if q in searchable:
                results.append(k)
        return results

    def _get_selected_key(self) -> dict | None:
        """Get the key dict for the currently selected table row."""
        if not self.backend:
            self.notify("Connect first", severity="warning")
            return None

        table = self.query_one("#keys-table", DataTable)
        if table.row_count == 0:
            self.notify("No keys in table", severity="warning")
            return None

        cursor = table.cursor_coordinate
        if cursor is None or cursor.row < 0:
            self.notify("Select a key in the table first", severity="warning")
            return None

        # Use the DataTable row key to reliably find the right key
        try:
            row_key = table.coordinate_to_cell_key(cursor).row_key
            key_id = str(row_key.value)

            # Look up from cached keys
            for k in self.keys:
                if k.get("id") == key_id:
                    return k
        except Exception:
            pass

        # Fallback: match by index in filtered list
        filtered = self._filtered_keys()
        row_idx = cursor.row
        if 0 <= row_idx < len(filtered):
            return filtered[row_idx]

        self.notify("Cannot identify selected key", severity="warning")
        return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _markdown_table(headers: list[str], rows: list[list[str]]) -> str:
    """Build a markdown table string."""
    widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            if i < len(widths):
                widths[i] = max(widths[i], len(cell))

    def fmt_row(cells: list[str]) -> str:
        return "| " + " | ".join(c.ljust(widths[i]) for i, c in enumerate(cells)) + " |"

    lines = [fmt_row(headers)]
    lines.append("| " + " | ".join("-" * w for w in widths) + " |")
    for row in rows:
        lines.append(fmt_row(row))
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    load_dotenv()
    app = ApiKeyManagerApp()
    app.run()


if __name__ == "__main__":
    main()
