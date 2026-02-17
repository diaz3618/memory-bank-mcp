#!/usr/bin/env bash
# =============================================================================
# Release: Docker images (Docker Hub + GHCR)
#
# Usage:  npm run release:docker
#         ./scripts/release-docker.sh
#
# Steps:
#   1. Verify branch is feature/http-postgres-redis-supabase
#   2. Bump patch version, commit, tag, push
#   3. Trigger Docker Hub workflow
#   4. Trigger GHCR workflow
# =============================================================================
set -euo pipefail

REQUIRED_BRANCH="feature/http-postgres-redis-supabase"
BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ "$BRANCH" != "$REQUIRED_BRANCH" ]; then
  echo "❌ ABORT: must be on $REQUIRED_BRANCH (current: $BRANCH)"
  exit 1
fi

# --- Step 1: Version bump + commit + tag + push ---
VER=$(npm version patch --no-git-tag-version)
TAG="${VER}-http-pg-redis"

echo "📦 $VER"
git add package.json
git commit -q -m "release: $TAG"
git tag "$TAG"
echo "🏷  Tagged $TAG"

git push -q origin "$REQUIRED_BRANCH"
git push -q origin "$TAG"
echo "✅ Pushed branch + tag"

# --- Step 2: Trigger CI workflows ---
gh workflow run docker-hub.yml  --ref "$REQUIRED_BRANCH" 2>&1 | head -1
gh workflow run docker-ghcr.yml --ref "$REQUIRED_BRANCH" 2>&1 | head -1

echo ""
echo "🚀 Done — monitor builds:"
echo "   gh run list --workflow=docker-hub.yml  -L3"
echo "   gh run list --workflow=docker-ghcr.yml -L3"
