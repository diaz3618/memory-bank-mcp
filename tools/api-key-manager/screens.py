"""Modal screens for the API Key Manager TUI.

Screens:
  - ConnectionScreen:  Choose connection mode + credentials
  - CreateKeyScreen:   Form for creating a new API key
  - KeyDetailScreen:   Show full metadata for a key
  - NewKeyResultScreen: One-time plaintext key display
  - ConfirmScreen:     Confirmation dialog for destructive actions
  - HelpScreen:        Keyboard shortcuts reference
  - ExportScreen:      Export key listing in various formats
"""

from __future__ import annotations

import os
from typing import Any

from textual import on
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.screen import ModalScreen
from textual.widgets import (
    Button,
    Input,
    Label,
    Select,
    Static,
    TextArea,
)

from backends import Backend, DbBackend, HttpBackend


# ---------------------------------------------------------------------------
# Connection screen
# ---------------------------------------------------------------------------


class ConnectionScreen(ModalScreen[Backend | None]):
    """Choose connection mode and enter credentials."""

    BINDINGS = [Binding("escape", "cancel", "Cancel", show=False)]

    CSS = """
    ConnectionScreen {
        align: center middle;
    }
    #conn-dialog {
        width: 76;
        height: auto;
        max-height: 38;
        border: thick $accent;
        padding: 1 2;
        background: $surface;
    }
    #conn-dialog Label {
        margin-bottom: 0;
    }
    .dialog-title {
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }
    .field-label {
        margin-top: 1;
        color: $text-muted;
    }
    .hint {
        color: $text-disabled;
        margin-top: 0;
    }
    #conn-buttons {
        margin-top: 2;
        height: auto;
        align-horizontal: right;
    }
    #conn-buttons Button {
        margin-left: 1;
    }
    #btn-toggle-pw {
        margin-top: 1;
        min-width: 20;
    }
    #conn-status {
        margin-top: 1;
        height: auto;
        padding: 0 1;
    }
    .status-success {
        color: $success;
    }
    .status-error {
        color: $error;
    }
    """

    def __init__(self) -> None:
        super().__init__()
        self._connected_backend: Backend | None = None

    def compose(self) -> ComposeResult:
        with Vertical(id="conn-dialog"):
            yield Label("Connection Setup", classes="dialog-title")

            yield Label("Mode:", classes="field-label")
            yield Select(
                [
                    ("HTTP — REST API (/api/keys)", "http"),
                    ("Database — Direct PostgreSQL", "db"),
                ],
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
                [
                    ("postgres (DATABASE_URL)", "postgres"),
                    ("supabase (SUPABASE_DB_URL)", "supabase"),
                ],
                id="db-provider",
                value="postgres",
            )
            yield Label("Connection string:", classes="field-label", id="lbl-dsn")
            yield Input(
                placeholder="postgresql://user:pass@host:5432/db",
                id="db-dsn",
                password=True,
            )

            yield Button(
                "Show credentials",
                id="btn-toggle-pw",
                variant="default",
            )

            yield Static("", id="conn-status")

            with Horizontal(id="conn-buttons"):
                yield Button("Close", id="btn-cancel")
                yield Button("Connect", variant="primary", id="btn-connect")

    def on_mount(self) -> None:
        self._update_field_visibility("http")
        # Pre-fill DB DSN from env
        dsn = os.environ.get("DATABASE_URL", "")
        provider = "postgres"
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
        for wid in ("lbl-url", "http-url", "lbl-apikey", "http-apikey"):
            self.query_one(f"#{wid}").display = http_visible
        for wid in ("lbl-provider", "db-provider", "lbl-dsn", "db-dsn"):
            self.query_one(f"#{wid}").display = db_visible

    @on(Button.Pressed, "#btn-toggle-pw")
    def toggle_password(self) -> None:
        """Toggle credential visibility."""
        apikey_input = self.query_one("#http-apikey", Input)
        dsn_input = self.query_one("#db-dsn", Input)
        showing = not apikey_input.password
        apikey_input.password = showing
        dsn_input.password = showing
        btn = self.query_one("#btn-toggle-pw", Button)
        btn.label = "Show credentials" if showing else "Hide credentials"

    def _set_status(self, text: str, success: bool) -> None:
        """Show inline status text below the credentials button."""
        status = self.query_one("#conn-status", Static)
        css_class = "status-success" if success else "status-error"
        status.remove_class("status-success", "status-error")
        status.add_class(css_class)
        icon = "✓" if success else "✗"
        status.update(f"{icon} {text}")

    @on(Button.Pressed, "#btn-connect")
    def do_connect(self) -> None:
        mode = self.query_one("#mode-select", Select).value
        if mode == "http":
            url = self.query_one("#http-url", Input).value.strip()
            api_key = self.query_one("#http-apikey", Input).value.strip()
            if not url:
                self._set_status("Server URL is required", success=False)
                return
            if not api_key:
                self._set_status("API key is required for HTTP mode", success=False)
                return
            backend = HttpBackend(url, api_key)
            self._connected_backend = backend
            self._set_status(f"Connected via HTTP → {url}", success=True)
        else:
            dsn = self.query_one("#db-dsn", Input).value.strip()
            if not dsn:
                self._set_status("Connection string is required", success=False)
                return
            try:
                import psycopg2

                conn = psycopg2.connect(dsn)
                conn.close()
                backend = DbBackend(dsn)
                self._connected_backend = backend
                self._set_status(
                    f"Connected via DB ({backend.provider})", success=True
                )
            except Exception as e:
                self._connected_backend = None
                self._set_status(f"Connection failed: {e}", success=False)

    @on(Button.Pressed, "#btn-cancel")
    def do_close(self) -> None:
        self.dismiss(self._connected_backend)

    def action_cancel(self) -> None:
        self.dismiss(self._connected_backend)


# ---------------------------------------------------------------------------
# Create key screen
# ---------------------------------------------------------------------------


class CreateKeyScreen(ModalScreen[dict | None]):
    """Form for creating a new API key."""

    BINDINGS = [Binding("escape", "cancel", "Cancel", show=False)]

    CSS = """
    CreateKeyScreen {
        align: center middle;
    }
    #create-dialog {
        width: 80;
        height: auto;
        max-height: 32;
        border: thick $accent;
        padding: 1 2;
        background: $surface;
    }
    .dialog-title {
        text-style: bold;
        color: $success;
        margin-bottom: 1;
    }
    .field-label {
        margin-top: 1;
        color: $text-muted;
    }
    .hint {
        color: $text-disabled;
    }
    .field-row {
        height: auto;
        margin-top: 0;
    }
    .field-row .field-col {
        width: 1fr;
        height: auto;
    }
    .field-row .field-col:last-child {
        margin-left: 1;
    }
    .field-col .field-label {
        margin-top: 0;
    }
    #create-buttons {
        margin-top: 1;
        height: auto;
        align-horizontal: right;
    }
    #create-buttons Button {
        margin-left: 1;
    }
    """

    def __init__(self, is_db_mode: bool = False) -> None:
        super().__init__()
        self.is_db_mode = is_db_mode

    def compose(self) -> ComposeResult:
        with Vertical(id="create-dialog"):
            yield Label("Create API Key", classes="dialog-title")

            if self.is_db_mode:
                with Horizontal(classes="field-row"):
                    with Vertical(classes="field-col"):
                        yield Label("Username:", classes="field-label")
                        yield Input(placeholder="e.g. johndoe", id="username")
                    with Vertical(classes="field-col"):
                        yield Label("Email:", classes="field-label")
                        yield Input(placeholder="user@example.com", id="user-email")
                yield Label("Project name:", classes="field-label")
                yield Input(placeholder="e.g. my-project", id="project-name")

            yield Label("Label (optional):", classes="field-label")
            yield Input(placeholder="e.g. CI Pipeline, Production, Dev", id="key-label")

            with Horizontal(classes="field-row"):
                with Vertical(classes="field-col"):
                    yield Label("Environment:", classes="field-label")
                    yield Select(
                        [("live", "live"), ("test", "test")],
                        id="key-env",
                        value="live",
                    )
                with Vertical(classes="field-col"):
                    yield Label("Rate limit (req/min):", classes="field-label")
                    yield Input(placeholder="60", id="key-rate-limit", value="60")

            with Horizontal(classes="field-row"):
                with Vertical(classes="field-col"):
                    yield Label("Expires in days (0 = never):", classes="field-label")
                    yield Input(placeholder="0", id="key-expires", value="0")

            with Horizontal(id="create-buttons"):
                yield Button("Cancel", id="btn-cancel-create")
                yield Button("Create", variant="success", id="btn-create")

    @on(Button.Pressed, "#btn-create")
    def do_create(self) -> None:
        result: dict[str, Any] = {}

        if self.is_db_mode:
            username = self.query_one("#username", Input).value.strip()
            email = self.query_one("#user-email", Input).value.strip()
            project_name = self.query_one("#project-name", Input).value.strip()
            if not username or not email:
                self.notify(
                    "Username and email are required in DB mode",
                    severity="error",
                )
                return
            if not project_name:
                self.notify(
                    "Project name is required in DB mode",
                    severity="error",
                )
                return
            result["username"] = username
            result["email"] = email
            result["project_name"] = project_name

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

    def action_cancel(self) -> None:
        self.dismiss(None)


# ---------------------------------------------------------------------------
# Key detail screen
# ---------------------------------------------------------------------------


class KeyDetailScreen(ModalScreen[None]):
    """Show detailed metadata for a single key."""

    BINDINGS = [
        Binding("escape", "close", "Close", show=False),
        Binding("c", "copy_id", "Copy ID"),
    ]

    CSS = """
    KeyDetailScreen {
        align: center middle;
    }
    #detail-dialog {
        width: 76;
        height: auto;
        max-height: 30;
        border: thick $accent;
        padding: 1 2;
        background: $surface;
    }
    .dialog-title {
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }
    #detail-text {
        height: auto;
        max-height: 20;
        padding: 0 1;
    }
    #detail-buttons {
        margin-top: 1;
        height: auto;
        align-horizontal: right;
    }
    #detail-buttons Button {
        margin-left: 1;
    }
    """

    def __init__(self, key_info: dict) -> None:
        super().__init__()
        self.key_info = key_info

    def compose(self) -> ComposeResult:
        k = self.key_info
        status = k.get("status", "?")
        status_rich = {
            "active": "[bold green]● active[/bold green]",
            "revoked": "[bold red]● revoked[/bold red]",
            "expired": "[bold yellow]● expired[/bold yellow]",
        }.get(status, f"[dim]{status}[/dim]")

        lines = [
            f"[bold]Key Details[/bold]",
            "",
            f"  [dim]ID:[/dim]          {k.get('id', '?')}",
            f"  [dim]Prefix:[/dim]      {k.get('prefix', '?')}...",
            f"  [dim]Label:[/dim]       {k.get('label') or '—'}",
            f"  [dim]Status:[/dim]      {status_rich}",
            f"  [dim]Scopes:[/dim]      {', '.join(k.get('scopes', [])) or '—'}",
            f"  [dim]Rate limit:[/dim]  {k.get('rateLimit', 60)}/min",
            "",
            f"  [dim]Created:[/dim]     {k.get('createdAt', '?')}",
            f"  [dim]Last used:[/dim]   {k.get('lastUsedAt') or '—'}",
            f"  [dim]Expires:[/dim]     {k.get('expiresAt') or 'Never'}",
            f"  [dim]Revoked:[/dim]     {k.get('revokedAt') or '—'}",
        ]

        with Vertical(id="detail-dialog"):
            yield Label("Key Details", classes="dialog-title")
            yield Static("\n".join(lines), id="detail-text")
            with Horizontal(id="detail-buttons"):
                yield Button("Copy ID", id="btn-copy-id")
                yield Button("Close", variant="primary", id="btn-close-detail")

    @on(Button.Pressed, "#btn-close-detail")
    def do_close(self) -> None:
        self.dismiss(None)

    @on(Button.Pressed, "#btn-copy-id")
    def do_copy_id(self) -> None:
        self._copy_id()

    def action_close(self) -> None:
        self.dismiss(None)

    def action_copy_id(self) -> None:
        self._copy_id()

    def _copy_id(self) -> None:
        key_id = self.key_info.get("id", "")
        if key_id:
            try:
                import subprocess

                subprocess.run(
                    ["xclip", "-selection", "clipboard"],
                    input=key_id.encode(),
                    check=True,
                    timeout=2,
                )
                self.notify(f"Copied ID to clipboard")
            except FileNotFoundError:
                try:
                    subprocess.run(
                        ["xsel", "--clipboard", "--input"],
                        input=key_id.encode(),
                        check=True,
                        timeout=2,
                    )
                    self.notify(f"Copied ID to clipboard")
                except Exception:
                    self.notify(f"ID: {key_id}", severity="information")
            except Exception:
                self.notify(f"ID: {key_id}", severity="information")


# ---------------------------------------------------------------------------
# New key result screen
# ---------------------------------------------------------------------------


class NewKeyResultScreen(ModalScreen[None]):
    """Show the newly created key (one-time display)."""

    BINDINGS = [Binding("escape", "close", "Close", show=False)]

    CSS = """
    NewKeyResultScreen {
        align: center middle;
    }
    #result-dialog {
        width: 82;
        height: auto;
        max-height: 26;
        border: thick $warning;
        padding: 1 2;
        background: $surface;
    }
    .warning-title {
        text-style: bold;
        color: $warning;
        text-align: center;
        margin-bottom: 1;
    }
    .warning-subtitle {
        color: $warning;
        text-align: center;
    }
    #key-display {
        height: 3;
        margin: 1 0;
        border: tall $warning;
    }
    .key-meta {
        color: $text-muted;
        padding-left: 2;
    }
    #result-buttons {
        margin-top: 1;
        height: auto;
        align-horizontal: center;
    }
    #result-buttons Button {
        margin: 0 1;
    }
    """

    def __init__(self, result: dict) -> None:
        super().__init__()
        self.result = result

    def compose(self) -> ComposeResult:
        r = self.result
        with Vertical(id="result-dialog"):
            yield Label("⚠  SAVE THIS KEY NOW  ⚠", classes="warning-title")
            yield Label(
                "This is the ONLY time the plaintext key will be shown.",
                classes="warning-subtitle",
            )
            yield TextArea(r.get("key", ""), id="key-display", read_only=True)
            yield Label(
                f"  ID:      {r.get('id', '?')}",
                classes="key-meta",
            )
            yield Label(
                f"  Prefix:  {r.get('prefix', '?')}",
                classes="key-meta",
            )
            yield Label(
                f"  Label:   {r.get('label') or '—'}",
                classes="key-meta",
            )
            yield Label(
                f"  Expires: {r.get('expiresAt') or 'Never'}",
                classes="key-meta",
            )
            with Horizontal(id="result-buttons"):
                yield Button(
                    "Copy to clipboard",
                    variant="primary",
                    id="btn-copy-key",
                )
                yield Button(
                    "I have saved the key",
                    variant="warning",
                    id="btn-ack",
                )

    @on(Button.Pressed, "#btn-copy-key")
    def do_copy(self) -> None:
        key = self.result.get("key", "")
        if key:
            try:
                import subprocess

                subprocess.run(
                    ["xclip", "-selection", "clipboard"],
                    input=key.encode(),
                    check=True,
                    timeout=2,
                )
                self.notify("Key copied to clipboard!")
            except FileNotFoundError:
                try:
                    subprocess.run(
                        ["xsel", "--clipboard", "--input"],
                        input=key.encode(),
                        check=True,
                        timeout=2,
                    )
                    self.notify("Key copied to clipboard!")
                except Exception:
                    self.notify(
                        "Clipboard unavailable — copy from the text area above",
                        severity="warning",
                    )
            except Exception:
                self.notify(
                    "Clipboard unavailable — copy from the text area above",
                    severity="warning",
                )

    @on(Button.Pressed, "#btn-ack")
    def do_ack(self) -> None:
        self.dismiss(None)

    def action_close(self) -> None:
        self.dismiss(None)


# ---------------------------------------------------------------------------
# Confirm screen
# ---------------------------------------------------------------------------


class ConfirmScreen(ModalScreen[bool]):
    """Confirmation dialog for destructive actions."""

    BINDINGS = [
        Binding("escape", "cancel", "Cancel", show=False),
        Binding("y", "confirm", "Confirm", show=False),
        Binding("n", "cancel", "Cancel", show=False),
    ]

    CSS = """
    ConfirmScreen {
        align: center middle;
    }
    #confirm-dialog {
        width: 60;
        height: auto;
        max-height: 14;
        border: thick $error;
        padding: 1 2;
        background: $surface;
    }
    .confirm-title {
        text-style: bold;
        color: $error;
        margin-bottom: 1;
    }
    .confirm-body {
        margin-bottom: 1;
    }
    .confirm-hint {
        color: $text-disabled;
        margin-bottom: 1;
    }
    #confirm-buttons {
        height: auto;
        align-horizontal: right;
    }
    #confirm-buttons Button {
        margin-left: 1;
    }
    """

    def __init__(self, title: str, body: str, confirm_label: str = "Confirm") -> None:
        super().__init__()
        self._title = title
        self._body = body
        self._confirm_label = confirm_label

    def compose(self) -> ComposeResult:
        with Vertical(id="confirm-dialog"):
            yield Label(self._title, classes="confirm-title")
            yield Label(self._body, classes="confirm-body")
            yield Label("Press [bold]Y[/bold] to confirm or [bold]N[/bold] / Esc to cancel", classes="confirm-hint")
            with Horizontal(id="confirm-buttons"):
                yield Button("Cancel", id="btn-cancel-confirm")
                yield Button(
                    self._confirm_label,
                    variant="error",
                    id="btn-do-confirm",
                )

    @on(Button.Pressed, "#btn-do-confirm")
    def do_confirm(self) -> None:
        self.dismiss(True)

    @on(Button.Pressed, "#btn-cancel-confirm")
    def do_cancel_btn(self) -> None:
        self.dismiss(False)

    def action_confirm(self) -> None:
        self.dismiss(True)

    def action_cancel(self) -> None:
        self.dismiss(False)


# ---------------------------------------------------------------------------
# Help screen
# ---------------------------------------------------------------------------


class HelpScreen(ModalScreen[None]):
    """Keyboard shortcuts and usage reference."""

    BINDINGS = [
        Binding("escape", "close", "Close", show=False),
        Binding("f1", "close", "Close", show=False),
        Binding("question_mark", "close", "Close", show=False),
    ]

    CSS = """
    HelpScreen {
        align: center middle;
    }
    #help-dialog {
        width: 72;
        height: auto;
        max-height: 34;
        border: thick $accent;
        padding: 1 2;
        background: $surface;
    }
    .dialog-title {
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }
    #help-content {
        height: auto;
        max-height: 26;
        overflow-y: auto;
    }
    """

    HELP_TEXT = """\
[bold]Keyboard Shortcuts[/bold]

  [bold cyan]General[/bold cyan]
  [dim]F1[/dim] / [dim]?[/dim]       Show this help
  [dim]q[/dim]            Quit
  [dim]n[/dim]            New connection
  [dim]Ctrl+P[/dim]       Command palette

  [bold cyan]Key Management[/bold cyan]
  [dim]r[/dim]            Refresh key list
  [dim]c[/dim]            Create new key
  [dim]d[/dim]            Revoke selected key
  [dim]t[/dim]            Rotate selected key
  [dim]i[/dim] / [dim]Enter[/dim]    Inspect key details
  [dim]x[/dim]            Export keys

  [bold cyan]View[/bold cyan]
  [dim]v[/dim]            Toggle show revoked keys
  [dim]s[/dim]            Focus search filter
  [dim]1[/dim]            Switch to Keys tab
  [dim]2[/dim]            Switch to Activity tab

  [bold cyan]Navigation[/bold cyan]
  [dim]↑ / ↓[/dim]        Move cursor in table
  [dim]Tab[/dim]          Cycle focus between widgets
  [dim]Escape[/dim]       Close dialog / clear search

[bold]Connection Modes[/bold]
  [bold green]HTTP[/bold green]  — REST API via /api/keys (recommended)
       Env: MCP_BASE_URL, MEMORY_BANK_API_KEY
  [bold yellow]DB[/bold yellow]    — Direct PostgreSQL (bootstrap/admin)
       Env: DATABASE_URL or SUPABASE_DB_URL

[bold]Key Format[/bold]
  mbmcp_{live|test}_{base62_32chars}
  Keys are hashed with SHA-256 for storage.
  Plaintext is shown exactly once at creation.
"""

    def compose(self) -> ComposeResult:
        with Vertical(id="help-dialog"):
            yield Label("Help — API Key Manager", classes="dialog-title")
            with VerticalScroll(id="help-content"):
                yield Static(self.HELP_TEXT)
            yield Button("Close (Esc)", variant="primary", id="btn-close-help")

    @on(Button.Pressed, "#btn-close-help")
    def do_close(self) -> None:
        self.dismiss(None)

    def action_close(self) -> None:
        self.dismiss(None)


# ---------------------------------------------------------------------------
# Export screen
# ---------------------------------------------------------------------------


class ExportScreen(ModalScreen[str | None]):
    """Choose export format and destination."""

    BINDINGS = [Binding("escape", "cancel", "Cancel", show=False)]

    CSS = """
    ExportScreen {
        align: center middle;
    }
    #export-dialog {
        width: 60;
        height: auto;
        max-height: 18;
        border: thick $accent;
        padding: 1 2;
        background: $surface;
    }
    .dialog-title {
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }
    .field-label {
        margin-top: 1;
        color: $text-muted;
    }
    #export-buttons {
        margin-top: 1;
        height: auto;
        align-horizontal: right;
    }
    #export-buttons Button {
        margin-left: 1;
    }
    """

    def compose(self) -> ComposeResult:
        with Vertical(id="export-dialog"):
            yield Label("Export Keys", classes="dialog-title")

            yield Label("Format:", classes="field-label")
            yield Select(
                [
                    ("JSON", "json"),
                    ("CSV", "csv"),
                    ("Markdown Table", "md"),
                ],
                id="export-format",
                value="json",
            )

            yield Label("Filename:", classes="field-label")
            yield Input(
                placeholder="api-keys-export",
                id="export-filename",
                value="api-keys-export",
            )

            with Horizontal(id="export-buttons"):
                yield Button("Cancel", id="btn-cancel-export")
                yield Button("Export", variant="primary", id="btn-do-export")

    @on(Button.Pressed, "#btn-do-export")
    def do_export(self) -> None:
        fmt = str(self.query_one("#export-format", Select).value)
        filename = self.query_one("#export-filename", Input).value.strip()
        if not filename:
            self.notify("Filename is required", severity="error")
            return
        ext = {"json": ".json", "csv": ".csv", "md": ".md"}.get(fmt, ".txt")
        if not filename.endswith(ext):
            filename += ext
        self.dismiss(f"{fmt}:{filename}")

    @on(Button.Pressed, "#btn-cancel-export")
    def do_cancel(self) -> None:
        self.dismiss(None)

    def action_cancel(self) -> None:
        self.dismiss(None)
