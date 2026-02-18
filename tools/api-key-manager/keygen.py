"""Key generation utilities matching the server format.

Mirrors: src/server/middleware/apiKeyAuth.ts  generateApiKey()
Format:  mbmcp_{live|test}_{base62_32chars}
Hash:    SHA-256 of plaintext
Prefix:  first 16 characters
"""

from __future__ import annotations

import hashlib
import secrets
import string
from typing import Any

BASE62 = string.digits + string.ascii_uppercase + string.ascii_lowercase


def generate_api_key(environment: str = "live") -> dict[str, Any]:
    """Generate an API key matching the server format.

    Returns dict with keys: plaintext, prefix, hash (bytes).
    """
    random_bytes = secrets.token_bytes(32)
    random_str = "".join(BASE62[b % 62] for b in random_bytes)
    plaintext = f"mbmcp_{environment}_{random_str}"
    prefix = plaintext[:16]
    key_hash = hashlib.sha256(plaintext.encode()).digest()
    return {"plaintext": plaintext, "prefix": prefix, "hash": key_hash}


def hash_api_key(plaintext: str) -> bytes:
    """SHA-256 hash a plaintext API key."""
    return hashlib.sha256(plaintext.encode()).digest()
