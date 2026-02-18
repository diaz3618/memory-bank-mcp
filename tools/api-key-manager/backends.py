"""Backend implementations for API key operations.

Two backends:
  - HttpBackend: REST API via /api/keys endpoints (recommended)
  - DbBackend:   Direct PostgreSQL for bootstrap/admin flows
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from keygen import generate_api_key


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fmt_dt(dt: Any) -> str | None:
    """Format a datetime value (or passthrough strings / None)."""
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    return dt.isoformat()


# ---------------------------------------------------------------------------
# Abstract backend
# ---------------------------------------------------------------------------


class Backend:
    """Abstract backend for API key operations."""

    name: str = "unknown"

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

    async def health_check(self) -> bool:
        """Return True if connection is healthy."""
        try:
            await self.list_keys()
            return True
        except Exception:
            return False


# ---------------------------------------------------------------------------
# HTTP backend
# ---------------------------------------------------------------------------


class HttpBackend(Backend):
    """REST API backend using /api/keys endpoints."""

    name = "HTTP"

    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    @property
    def display_info(self) -> str:
        return self.base_url

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

    async def health_check(self) -> bool:
        import httpx

        try:
            url = f"{self.base_url}/api/keys"
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(url, headers=self._headers())
                return r.status_code < 500
        except Exception:
            return False


# ---------------------------------------------------------------------------
# Database backend
# ---------------------------------------------------------------------------


class DbBackend(Backend):
    """Direct PostgreSQL backend for admin flows."""

    name = "DB"

    def __init__(self, connection_string: str):
        self.dsn = connection_string
        self._conn: Any = None
        self.provider = "supabase" if "supabase" in connection_string.lower() else "postgres"

    @property
    def display_info(self) -> str:
        return f"{self.provider}"

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
                       last_used_at, expires_at, created_at, revoked_at,
                       user_id, project_id
                FROM api_keys {where}
                ORDER BY created_at DESC"""
        )
        cols = [d[0] for d in cur.description]
        rows = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
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
                    "user_id": str(d.get("user_id", "")),
                    "project_id": str(d.get("project_id", "")),
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

    async def health_check(self) -> bool:
        try:
            conn = await self._get_conn()
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.close()
            return True
        except Exception:
            return False


# ---------------------------------------------------------------------------
# Factory helpers
# ---------------------------------------------------------------------------


def backend_from_env() -> Backend | None:
    """Try to build a backend from environment variables. Returns None on failure."""
    base_url = os.environ.get("MCP_BASE_URL", "")
    api_key = os.environ.get("MEMORY_BANK_API_KEY", "")
    if base_url and api_key:
        return HttpBackend(base_url, api_key)

    dsn = os.environ.get("DATABASE_URL", "") or os.environ.get("SUPABASE_DB_URL", "")
    if dsn:
        try:
            import psycopg2

            conn = psycopg2.connect(dsn)
            conn.close()
            return DbBackend(dsn)
        except Exception:
            return None

    return None
