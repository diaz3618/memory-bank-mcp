-- Migration 001: Core schema for Memory Bank MCP HTTP mode
-- Compatible with: PostgreSQL 16+ and Supabase
-- Run order: 001 → 002 → 003

BEGIN;

-- =============================================================================
-- Custom types
-- =============================================================================

CREATE TYPE project_role AS ENUM ('owner', 'editor', 'viewer');

-- =============================================================================
-- Schema: app (helper functions live here, not exposed via Supabase Data API)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS app;

-- =============================================================================
-- Users
-- =============================================================================

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_users_name ON users(name);

-- =============================================================================
-- Projects
-- =============================================================================

CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  settings    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_projects_slug  ON projects USING btree(slug);

-- =============================================================================
-- Memberships
-- =============================================================================

CREATE TABLE memberships (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role        project_role NOT NULL DEFAULT 'viewer',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

-- =============================================================================
-- API Keys
-- =============================================================================

CREATE TABLE api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key_hash     BYTEA NOT NULL UNIQUE,
  key_prefix   VARCHAR(16) NOT NULL,
  label        TEXT,
  scopes       TEXT[] NOT NULL DEFAULT '{}',
  rate_limit   INTEGER NOT NULL DEFAULT 60,
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_user    ON api_keys(user_id);
CREATE INDEX idx_api_keys_project ON api_keys(project_id);
CREATE INDEX idx_api_keys_hash    ON api_keys(key_hash);

-- =============================================================================
-- Documents (memory bank files)
-- =============================================================================

CREATE TABLE documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  fts_vector  tsvector GENERATED ALWAYS AS (
    to_tsvector('english', content)
  ) STORED,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, path)
);

CREATE INDEX idx_documents_project ON documents(project_id);
CREATE INDEX idx_documents_fts     ON documents USING GIN(fts_vector);

-- =============================================================================
-- Knowledge Graph: Entities
-- =============================================================================

CREATE TABLE graph_entities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  attrs       JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, name)
);

CREATE INDEX idx_entities_project  ON graph_entities(project_id);
CREATE INDEX idx_entities_type     ON graph_entities(project_id, entity_type);
CREATE INDEX idx_entities_name_fts ON graph_entities USING GIN(
  to_tsvector('simple', name || ' ' || entity_type)
);

-- =============================================================================
-- Knowledge Graph: Observations
-- =============================================================================

CREATE TABLE graph_observations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   UUID NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  source      JSONB,
  fts_vector  tsvector GENERATED ALWAYS AS (
    to_tsvector('english', content)
  ) STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_observations_entity  ON graph_observations(entity_id);
CREATE INDEX idx_observations_project ON graph_observations(project_id);
CREATE INDEX idx_observations_fts     ON graph_observations USING GIN(fts_vector);

-- =============================================================================
-- Knowledge Graph: Relations
-- =============================================================================

CREATE TABLE graph_relations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_entity_id  UUID NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,
  to_entity_id    UUID NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,
  relation_type   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, from_entity_id, to_entity_id, relation_type)
);

CREATE INDEX idx_relations_project ON graph_relations(project_id);
CREATE INDEX idx_relations_from    ON graph_relations(from_entity_id);
CREATE INDEX idx_relations_to      ON graph_relations(to_entity_id);

-- =============================================================================
-- MCP Events (SSE resumability event store)
-- =============================================================================

CREATE TABLE mcp_events (
  id          BIGSERIAL PRIMARY KEY,
  stream_id   TEXT NOT NULL,
  message     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_stream  ON mcp_events(stream_id, id);
CREATE INDEX idx_events_cleanup ON mcp_events(created_at);

-- =============================================================================
-- Sessions
-- =============================================================================

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

CREATE INDEX idx_sessions_user    ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- =============================================================================
-- Schema migrations tracker
-- =============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version) VALUES ('001_schema');

COMMIT;
