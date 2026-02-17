-- Migration: 004_rls_fixes
--
-- Addresses RLS gaps found in security audit:
--   1. Enable RLS on users and mcp_events tables
--   2. Add policies for users (own-record access)
--   3. Add policies for mcp_events (session-based access)
--   4. Add DELETE policy for api_keys
--   5. Fix SECURITY DEFINER functions to include auth checks
--   6. Add policies for 'authenticated' role (Supabase compatibility)

BEGIN;

-- ============================================================================
-- 1. Enable RLS on previously unprotected tables
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_events ENABLE ROW LEVEL SECURITY;

-- schema_migrations is admin-only, no RLS needed (only accessed by postgres role
-- during migrations, which has BYPASSRLS)

-- ============================================================================
-- 2. Users policies — restricted to own record
-- ============================================================================

-- Users can read their own record
CREATE POLICY users_select ON users FOR SELECT TO app_user
  USING (id = (SELECT app.current_user_id()));

-- Users can update their own record
CREATE POLICY users_update ON users FOR UPDATE TO app_user
  USING (id = (SELECT app.current_user_id()))
  WITH CHECK (id = (SELECT app.current_user_id()));

-- User creation is admin-only (done by the server with direct postgres role)
-- No INSERT policy for app_user — registration flows go through the server

-- ============================================================================
-- 3. MCP events policies — session owners see their stream events
-- ============================================================================

-- Events are scoped to a stream_id. A user may see events from their own sessions.
-- We join through sessions to verify ownership.
CREATE POLICY mcp_events_select ON mcp_events FOR SELECT TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = mcp_events.stream_id
        AND s.user_id = (SELECT app.current_user_id())
    )
  );

-- Only the server inserts events (via postgres role), but allow app_user to insert
-- for their own session streams
CREATE POLICY mcp_events_insert ON mcp_events FOR INSERT TO app_user
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = mcp_events.stream_id
        AND s.user_id = (SELECT app.current_user_id())
    )
  );

-- Cleanup is handled by postgres role (app.cleanup_old_events)
-- No DELETE policy for app_user on mcp_events

-- ============================================================================
-- 4. Add DELETE policy for api_keys
-- ============================================================================

CREATE POLICY api_keys_delete ON api_keys FOR DELETE TO app_user
  USING (user_id = (SELECT app.current_user_id()));

-- ============================================================================
-- 5. Fix SECURITY DEFINER functions — add authorization checks
-- ============================================================================

-- Replace search_documents: verify user has at least 'viewer' role on project
CREATE OR REPLACE FUNCTION app.search_documents(
  p_project_id UUID, p_query TEXT, p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (id UUID, path TEXT, content TEXT, rank REAL, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
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
    SELECT d.id, d.path, d.content,
      ts_rank(d.fts_vector, websearch_to_tsquery('english', p_query)) AS rank,
      d.updated_at
    FROM documents d
    WHERE d.project_id = p_project_id
      AND d.fts_vector @@ websearch_to_tsquery('english', p_query)
    ORDER BY rank DESC LIMIT p_limit;
END;
$$;

-- Replace search_observations: verify user has at least 'viewer' role on project
CREATE OR REPLACE FUNCTION app.search_observations(
  p_project_id UUID, p_query TEXT, p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (id UUID, entity_id UUID, entity_name TEXT, entity_type TEXT, content TEXT, rank REAL)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
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
    SELECT o.id, o.entity_id, e.name, e.entity_type, o.content,
      ts_rank(o.fts_vector, websearch_to_tsquery('english', p_query)) AS rank
    FROM graph_observations o
    JOIN graph_entities e ON e.id = o.entity_id
    WHERE o.project_id = p_project_id
      AND o.fts_vector @@ websearch_to_tsquery('english', p_query)
    ORDER BY rank DESC LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 6. Duplicate all policies for 'authenticated' role (Supabase compatibility)
--    Supabase clients connect as 'authenticated', not 'app_user'
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    -- Users
    EXECUTE $p$ CREATE POLICY users_select_auth ON users FOR SELECT TO authenticated
      USING (id = (SELECT app.current_user_id())) $p$;
    EXECUTE $p$ CREATE POLICY users_update_auth ON users FOR UPDATE TO authenticated
      USING (id = (SELECT app.current_user_id()))
      WITH CHECK (id = (SELECT app.current_user_id())) $p$;

    -- MCP events
    EXECUTE $p$ CREATE POLICY mcp_events_select_auth ON mcp_events FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM sessions s
        WHERE s.id = mcp_events.stream_id
          AND s.user_id = (SELECT app.current_user_id())
      )) $p$;
    EXECUTE $p$ CREATE POLICY mcp_events_insert_auth ON mcp_events FOR INSERT TO authenticated
      WITH CHECK (EXISTS (
        SELECT 1 FROM sessions s
        WHERE s.id = mcp_events.stream_id
          AND s.user_id = (SELECT app.current_user_id())
      )) $p$;

    -- API keys delete (for authenticated)
    EXECUTE $p$ CREATE POLICY api_keys_delete_auth ON api_keys FOR DELETE TO authenticated
      USING (user_id = (SELECT app.current_user_id())) $p$;

    -- Documents (authenticated versions)
    EXECUTE $p$ CREATE POLICY documents_select_auth ON documents FOR SELECT TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('viewer'))) $p$;
    EXECUTE $p$ CREATE POLICY documents_insert_auth ON documents FOR INSERT TO authenticated
      WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor'))) $p$;
    EXECUTE $p$ CREATE POLICY documents_update_auth ON documents FOR UPDATE TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor')))
      WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor'))) $p$;
    EXECUTE $p$ CREATE POLICY documents_delete_auth ON documents FOR DELETE TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('owner'))) $p$;

    -- Graph entities (authenticated versions)
    EXECUTE $p$ CREATE POLICY entities_select_auth ON graph_entities FOR SELECT TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('viewer'))) $p$;
    EXECUTE $p$ CREATE POLICY entities_insert_auth ON graph_entities FOR INSERT TO authenticated
      WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor'))) $p$;
    EXECUTE $p$ CREATE POLICY entities_update_auth ON graph_entities FOR UPDATE TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor')))
      WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor'))) $p$;
    EXECUTE $p$ CREATE POLICY entities_delete_auth ON graph_entities FOR DELETE TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('owner'))) $p$;

    -- Graph observations (authenticated versions)
    EXECUTE $p$ CREATE POLICY observations_select_auth ON graph_observations FOR SELECT TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('viewer'))) $p$;
    EXECUTE $p$ CREATE POLICY observations_insert_auth ON graph_observations FOR INSERT TO authenticated
      WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor'))) $p$;
    EXECUTE $p$ CREATE POLICY observations_update_auth ON graph_observations FOR UPDATE TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor')))
      WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor'))) $p$;
    EXECUTE $p$ CREATE POLICY observations_delete_auth ON graph_observations FOR DELETE TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('owner'))) $p$;

    -- Graph relations (authenticated versions)
    EXECUTE $p$ CREATE POLICY relations_select_auth ON graph_relations FOR SELECT TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('viewer'))) $p$;
    EXECUTE $p$ CREATE POLICY relations_insert_auth ON graph_relations FOR INSERT TO authenticated
      WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor'))) $p$;
    EXECUTE $p$ CREATE POLICY relations_update_auth ON graph_relations FOR UPDATE TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor')))
      WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor'))) $p$;
    EXECUTE $p$ CREATE POLICY relations_delete_auth ON graph_relations FOR DELETE TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('owner'))) $p$;

    -- API keys (authenticated versions)
    EXECUTE $p$ CREATE POLICY api_keys_select_auth ON api_keys FOR SELECT TO authenticated
      USING (user_id = (SELECT app.current_user_id())) $p$;
    EXECUTE $p$ CREATE POLICY api_keys_insert_auth ON api_keys FOR INSERT TO authenticated
      WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_project_role('owner'))) $p$;
    EXECUTE $p$ CREATE POLICY api_keys_update_auth ON api_keys FOR UPDATE TO authenticated
      USING (user_id = (SELECT app.current_user_id())) $p$;

    -- Sessions (authenticated versions)
    EXECUTE $p$ CREATE POLICY sessions_select_auth ON sessions FOR SELECT TO authenticated
      USING (user_id = (SELECT app.current_user_id())) $p$;
    EXECUTE $p$ CREATE POLICY sessions_insert_auth ON sessions FOR INSERT TO authenticated
      WITH CHECK (user_id = (SELECT app.current_user_id())) $p$;
    EXECUTE $p$ CREATE POLICY sessions_update_auth ON sessions FOR UPDATE TO authenticated
      USING (user_id = (SELECT app.current_user_id())) $p$;
    EXECUTE $p$ CREATE POLICY sessions_delete_auth ON sessions FOR DELETE TO authenticated
      USING (user_id = (SELECT app.current_user_id())) $p$;

    -- Memberships (authenticated versions)
    EXECUTE $p$ CREATE POLICY memberships_select_auth ON memberships FOR SELECT TO authenticated
      USING (user_id = (SELECT app.current_user_id())) $p$;
    EXECUTE $p$ CREATE POLICY memberships_insert_auth ON memberships FOR INSERT TO authenticated
      WITH CHECK ((SELECT app.has_project_role('owner'))) $p$;
    EXECUTE $p$ CREATE POLICY memberships_update_auth ON memberships FOR UPDATE TO authenticated
      USING ((SELECT app.has_project_role('owner'))) $p$;
    EXECUTE $p$ CREATE POLICY memberships_delete_auth ON memberships FOR DELETE TO authenticated
      USING ((SELECT app.has_project_role('owner'))) $p$;

    -- Projects (authenticated versions)
    EXECUTE $p$ CREATE POLICY projects_select_auth ON projects FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM memberships m WHERE m.project_id = projects.id AND m.user_id = (SELECT app.current_user_id()))) $p$;
    EXECUTE $p$ CREATE POLICY projects_update_auth ON projects FOR UPDATE TO authenticated
      USING (owner_id = (SELECT app.current_user_id()))
      WITH CHECK (owner_id = (SELECT app.current_user_id())) $p$;
    EXECUTE $p$ CREATE POLICY projects_insert_auth ON projects FOR INSERT TO authenticated
      WITH CHECK (owner_id = (SELECT app.current_user_id())) $p$;
    EXECUTE $p$ CREATE POLICY projects_delete_auth ON projects FOR DELETE TO authenticated
      USING (owner_id = (SELECT app.current_user_id())) $p$;
  END IF;
END
$$;

INSERT INTO schema_migrations (version) VALUES ('004_rls_fixes');

COMMIT;
