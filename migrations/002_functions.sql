-- Migration 002: Helper functions for RLS context
-- Compatible with: PostgreSQL 16+ and Supabase
-- Run order: 001 → 002 → 003
--
-- Functions in the `app` schema provide transaction-scoped context
-- set via SET LOCAL before each query batch.

BEGIN;

-- =============================================================================
-- Context helper: current_user_id
-- =============================================================================

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::UUID;
$$;

-- =============================================================================
-- Context helper: current_project_id
-- =============================================================================

CREATE OR REPLACE FUNCTION app.current_project_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_project_id', true), '')::UUID;
$$;

-- =============================================================================
-- Role checker: has_project_role
-- =============================================================================
-- Enum ordering: owner=0, editor=1, viewer=2
-- A user with 'owner' satisfies has_project_role('viewer') because owner <= viewer.

CREATE OR REPLACE FUNCTION app.has_project_role(required_role project_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE user_id = (SELECT app.current_user_id())
      AND project_id = (SELECT app.current_project_id())
      AND role <= required_role
  );
$$;

-- =============================================================================
-- Full-text search helper for documents
-- =============================================================================

CREATE OR REPLACE FUNCTION app.search_documents(
  p_project_id UUID,
  p_query TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  path TEXT,
  content TEXT,
  rank REAL,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  -- Verify the caller has a membership in this project
  IF NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE user_id = (SELECT app.current_user_id())
      AND project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'unauthorized: no access to project %', p_project_id;
  END IF;

  RETURN QUERY
    SELECT
      d.id,
      d.path,
      d.content,
      ts_rank(d.fts_vector, websearch_to_tsquery('english', p_query)) AS rank,
      d.updated_at
    FROM documents d
    WHERE d.project_id = p_project_id
      AND d.fts_vector @@ websearch_to_tsquery('english', p_query)
    ORDER BY rank DESC
    LIMIT p_limit;
END;
$$;

-- =============================================================================
-- Full-text search helper for graph observations
-- =============================================================================

CREATE OR REPLACE FUNCTION app.search_observations(
  p_project_id UUID,
  p_query TEXT,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  entity_id UUID,
  entity_name TEXT,
  entity_type TEXT,
  content TEXT,
  rank REAL
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  -- Verify the caller has a membership in this project
  IF NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE user_id = (SELECT app.current_user_id())
      AND project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'unauthorized: no access to project %', p_project_id;
  END IF;

  RETURN QUERY
    SELECT
      o.id,
      o.entity_id,
      e.name AS entity_name,
      e.entity_type,
      o.content,
      ts_rank(o.fts_vector, websearch_to_tsquery('english', p_query)) AS rank
    FROM graph_observations o
    JOIN graph_entities e ON e.id = o.entity_id
    WHERE o.project_id = p_project_id
      AND o.fts_vector @@ websearch_to_tsquery('english', p_query)
    ORDER BY rank DESC
    LIMIT p_limit;
END;
$$;

-- =============================================================================
-- Cleanup helper: expired sessions
-- =============================================================================

CREATE OR REPLACE FUNCTION app.cleanup_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM sessions WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- =============================================================================
-- Cleanup helper: expired MCP events (older than 7 days)
-- =============================================================================

CREATE OR REPLACE FUNCTION app.cleanup_old_events(max_age INTERVAL DEFAULT '7 days')
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM mcp_events WHERE created_at < now() - max_age;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- =============================================================================
-- Auto-update updated_at trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_entities_updated_at
  BEFORE UPDATE ON graph_entities
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- =============================================================================
-- Track migration
-- =============================================================================

INSERT INTO schema_migrations (version) VALUES ('002_functions');

COMMIT;
