# Docker Registry Cleanup & CI/CD Setup Report

**Date:** 2025-07-14  
**Project:** `@diazstg/memory-bank-mcp` v1.10.0  
**Commit:** `2cd0354`

---

## Summary

Cleaned all legacy Docker images from the `feature/http-postgres-redis-supabase` branch (now in its own repo `diaz3618/memory-bank-mcp-http`) off both Docker Hub and GHCR. Rebuilt and published fresh images for the current stdio-based MCP server, and added a CI/CD workflow for automated Docker publishing.

---

## 1. Registry Cleanup

### Docker Hub — `diaz3618/memory-bank-mcp`

| Metric | Value |
|--------|-------|
| Tags removed | **33** |
| Tag patterns | `*-http-pg-redis`, commit SHAs, `latest`, `latest-http` |
| Method | Docker Hub REST API (`DELETE /v2/repositories/.../tags/{tag}/`) with JWT auth |
| Verification | `Tags: 0` confirmed via API |

### GHCR — `ghcr.io/diaz3618/memory-bank-mcp`

| Metric | Value |
|--------|-------|
| Versions removed | **185** |
| Version patterns | Same HTTP feature branch images + untagged manifests |
| Method | `gh api --method DELETE /user/packages/container/memory-bank-mcp/versions/{id}` |
| Verification | Empty array `[]` confirmed via API |

All images originated from the `feature/http-postgres-redis-supabase` branch which added HTTP transport, PostgreSQL, Redis, and Supabase support. That branch has been moved to its own repository (`diaz3618/memory-bank-mcp-http`) with a separate Docker Hub token.

---

## 2. New Image Build & Publish

### Image Details

| Property | Value |
|----------|-------|
| Base image | `oven/bun:alpine` |
| Final size | **249 MB** |
| Digest | `sha256:b81879ffebced56a8d25322af02fca19b2df46d662b82a6f2a118c4c43168a4b` |
| Architecture | `linux/amd64` (local build; CI builds `amd64` + `arm64`) |
| Runtime | `bun run build/index.js` |

### Published Tags

| Registry | Tags |
|----------|------|
| Docker Hub | `diaz3618/memory-bank-mcp:1.10.0`, `diaz3618/memory-bank-mcp:latest` |
| GHCR | `ghcr.io/diaz3618/memory-bank-mcp:1.10.0`, `ghcr.io/diaz3618/memory-bank-mcp:latest` |

---

## 3. Infrastructure Files Added

### `.dockerignore` (Whitelist approach)

```
*
!package.json
!bun.lock
!bunbuild.toml
!bunfig.toml
!tsconfig.json
!src/
!src/**
```

**Rationale:** The workspace contains a `repos/` directory with cloned git repositories (~100MB+). A blacklist approach still transferred excessive context. The whitelist approach reduces build context to ~1MB by including only the files needed for the build.

### `.github/workflows/docker-publish.yml`

| Feature | Detail |
|---------|--------|
| Trigger | `v*` tags (excluding `vscode-v*`) + manual `workflow_dispatch` |
| Platforms | `linux/amd64`, `linux/arm64` |
| Registries | Docker Hub + GHCR |
| Tag strategy | `{{version}}`, `{{major}}.{{minor}}`, `latest` |
| Builder | Docker Buildx with GHA cache |
| Secrets | `DOCKERHUB_TOKEN` (existing), `GITHUB_TOKEN` (automatic) |

The trigger pattern matches the existing `npm-publish.yml` workflow, so a single `v*` tag push will publish to both npm and Docker registries.

---

## 4. Dockerfile (Unchanged)

The existing Dockerfile was kept as-is per requirements:

```dockerfile
FROM oven/bun:alpine
WORKDIR /app
COPY package.json bun.lock bunbuild.toml bunfig.toml tsconfig.json ./
RUN bun install
COPY . .
RUN bun run build
CMD ["bun", "run", "build/index.js"]
```

This builds the stdio-based MCP server. It does **not** expose any ports — the server communicates via stdin/stdout as per MCP protocol.

---

## 5. Auth & Secrets Notes

| Secret | Scope | Notes |
|--------|-------|-------|
| `DOCKERHUB_TOKEN` | This repo (`memory-bank-mcp`) | Already existed in repo secrets; used by new `docker-publish.yml` |
| `GITHUB_TOKEN` | Automatic | Used for GHCR pushes |
| Separate DH token | `memory-bank-mcp-http` repo | Cannot write to `diaz3618/memory-bank-mcp` — isolated by design |

---

## 6. Local Cleanup

- Removed stale local image `diaz3618/memory-bank-mcp:latest-http` and its associated stopped container.

---

## 7. Usage

```bash
# Docker Hub
docker pull diaz3618/memory-bank-mcp:1.10.0

# GHCR
docker pull ghcr.io/diaz3618/memory-bank-mcp:1.10.0

# Run (stdio mode)
docker run -i diaz3618/memory-bank-mcp:latest
```

For MCP client configuration with Docker, see the project README.
