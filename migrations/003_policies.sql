-- Migration 003: Row Level Security policies
-- Compatible with: PostgreSQL 16+ and Supabase
-- Run order: 001 → 002 → 003
--
-- All policies use app.current_user_id() and app.current_project_id()
-- which are set via SET LOCAL before each transaction.

BEGIN;

-- =============================================================================
-- Create application role (local Postgres only; Supabase uses 'authenticated')
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO app_user;
GRANT USAGE ON SCHEMA app TO app_user;

-- Grant table permissions to app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Also grant to 'authenticated' role for Supabase compatibility
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA app TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated';
  END IF;
END
$$;

-- =============================================================================
-- Enable RLS on all data tables
-- =============================================================================

ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys          ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_entities    ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_relations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_events        ENABLE ROW LEVEL SECURITY;
-- schema_migrations: admin-only, accessed by postgres role (BYPASSRLS) during migrations

-- =============================================================================
-- Users policies — own-record access only
-- =============================================================================

CREATE POLICY users_select ON users
  FOR SELECT TO app_user
  USING (id = (SELECT app.current_user_id()));

CREATE POLICY users_update ON users
  FOR UPDATE TO app_user
  USING (id = (SELECT app.current_user_id()))
  WITH CHECK (id = (SELECT app.current_user_id()));
-- User creation is admin-only (registration flows via postgres role)

-- =============================================================================
-- MCP Events policies — session-scoped access
-- =============================================================================

CREATE POLICY mcp_events_select ON mcp_events
  FOR SELECT TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = mcp_events.stream_id
        AND s.user_id = (SELECT app.current_user_id())
    )
  );

CREATE POLICY mcp_events_insert ON mcp_events
  FOR INSERT TO app_user
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = mcp_events.stream_id
        AND s.user_id = (SELECT app.current_user_id())
    )
  );
-- Event cleanup handled by postgres role (app.cleanup_old_events)

-- =============================================================================
-- Documents policies
-- =============================================================================

-- Viewers+ can read documents in their current project
CREATE POLICY documents_select ON documents
  FOR SELECT TO app_user
  USING (
    project_id = (SELECT app.current_project_id())
    AND (SELECT app.has_project_role('viewer'))
  );

-- Editors+ can insert documents
CREATE POLICY documents_insert ON documents
  FOR INSERT TO app_user
  WITH CHECK (
    project_id = (SELECT app.current_project_id())
    AND (SELECT app.has_project_role('editor'))
  );

-- Editors+ can update documents
CREATE POLICY documents_update ON documents
  FOR UPDATE TO app_user
  USING (
    project_id = (SELECT app.current_project_id())
    AND (SELECT app.has_project_role('editor'))
  )
  WITH CHECK (
    project_id = (SELECT app.current_project_id())
    AND (SELECT app.has_project_role('editor'))
  );

-- Owners only can delete documents
CREATE POLICY documents_delete ON documents
  FOR DELETE TO app_user
  USING (
    project_id = (SELECT app.current_project_id())
    AND (SELECT app.has_project_role('owner'))
  );

-- =============================================================================
-- Graph entities policies
-- =============================================================================

CREATE POLICY entities_select ON graph_entities
  FOR SELECT TO app_user
  USING (
    project_id = (SELECT app.current_project_id())
    AND (SELECT app.has_project_role('viewer'))
  );

CREATE POLICY entities_insert ON graph_entities
  FOR INSERT TO app_user
  WITH CHECK (
    project_id = (SELECT app.current_project_id())
    AND (SELECT app.has_project_role('editor'))
  );

CREATE POLICY entities_update ON graph_entities
  FOR UPDATE TO app_user
  USING (
    project_id = (SELECT app.current_project_id())
    AND (SELECT app.has_project_role('editor'))
  )
  WITH CHECK (
    project_id = (SELECT app.current_project_id())
    AND (SELECT app.has_project_role('editor'))
  );

CREATE POLICY entities_delete ON graph_entities
  FOR DELETE TO app_user
  USING (
    project_id = (SELECT app.current_project_id())
    AND (SELECT app.has_project_role('owner'))
  );

-- =============================================================================
-- Graph observations policies
-- =============================================================================

CREATE POLICY observations_select ON graph_observations
  FOR SELECT TO app_user
  USING (
    project_id = (SELECT app.current_project_id())
    AND (SELECT app.has_project_role('viewer'))
  );

CREATE POLICY observations_insert ON graph_observations
  FOR INSERT TO app_user
  WITH CHECK (
    project_id = (SELECT app.current_project_id())
    AND (SELECT app.has_project_role('editor'))
  );

CREATE POLICY observations_update ON graph_observations
  FOR UPDATE TO app_user
  USING (
    project_id = (SELECT app.current_project_id())
    AND (SELECT app.has_project_role('editor'))
  )
  WITH CHECK (
    project_id = (SELECT app.current_project_id())
    AND (SELECT app.has_project_role('editor'))
  );

CREATE POLICY observations_delete ON graph_observations
  FOR DELETE TO app_user
  USING (
    project_id = (SELECT app.current_project_id())
    AND (SELECT app.has_project_role('owner'))
  );

-- =============================================================================
-- Graph relations policies
-- =============================================================================

CREATE POLICY relations_select ON graph_relations
  FOR SELECT TO app_user
  USING (
    project_id = (SELECT app.current_project_id())
    AND (SELECT app.has_project_role('viewer'))
  );

CREATE POLICY relations_insert ON graph_relations
  FOR INSERT TO app_user
  WITH CHECK (
    project_id = (SELECT app.current_project_id())
    AND (SELECT app.has_project_role('editor'))
  );

CREATE POLICY relations_update ON graph_relations
  FOR UPDATE TO app_user
  USING (
    project_id = (SELECT app.current_project_id())
    AND (SELECT app.has_project_role('editor'))
  )
  WITH CHECK (
    project_id = (SELECT app.current_project_id())
    AND (SELECT app.has_project_role('editor'))
  );

CREATE POLICY relations_delete ON graph_relations
  FOR DELETE TO app_user
  USING (
    project_id = (SELECT app.current_project_id())
    AND (SELECT app.has_project_role('owner'))
  );

-- =============================================================================
-- API keys policies (user-scoped)
-- =============================================================================

CREATE POLICY api_keys_select ON api_keys
  FOR SELECT TO app_user
  USING (user_id = (SELECT app.current_user_id()));

CREATE POLICY api_keys_insert ON api_keys
  FOR INSERT TO app_user
  WITH CHECK (
    user_id = (SELECT app.current_user_id())
    AND (SELECT app.has_project_role('owner'))
  );

CREATE POLICY api_keys_update ON api_keys
  FOR UPDATE TO app_user
  USING (user_id = (SELECT app.current_user_id()));

CREATE POLICY api_keys_delete ON api_keys
  FOR DELETE TO app_user
  USING (user_id = (SELECT app.current_user_id()));

-- =============================================================================
-- Sessions policies
-- =============================================================================

CREATE POLICY sessions_select ON sessions
  FOR SELECT TO app_user
  USING (user_id = (SELECT app.current_user_id()));

CREATE POLICY sessions_insert ON sessions
  FOR INSERT TO app_user
  WITH CHECK (user_id = (SELECT app.current_user_id()));

CREATE POLICY sessions_update ON sessions
  FOR UPDATE TO app_user
  USING (user_id = (SELECT app.current_user_id()));

CREATE POLICY sessions_delete ON sessions
  FOR DELETE TO app_user
  USING (user_id = (SELECT app.current_user_id()));

-- =============================================================================
-- Memberships policies
-- =============================================================================

CREATE POLICY memberships_select ON memberships
  FOR SELECT TO app_user
  USING (user_id = (SELECT app.current_user_id()));

-- Only project owners can manage memberships
CREATE POLICY memberships_insert ON memberships
  FOR INSERT TO app_user
  WITH CHECK (
    (SELECT app.has_project_role('owner'))
  );

CREATE POLICY memberships_update ON memberships
  FOR UPDATE TO app_user
  USING (
    (SELECT app.has_project_role('owner'))
  );

CREATE POLICY memberships_delete ON memberships
  FOR DELETE TO app_user
  USING (
    (SELECT app.has_project_role('owner'))
  );

-- =============================================================================
-- Projects policies
-- =============================================================================

CREATE POLICY projects_select ON projects
  FOR SELECT TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.project_id = projects.id
        AND m.user_id = (SELECT app.current_user_id())
    )
  );

CREATE POLICY projects_update ON projects
  FOR UPDATE TO app_user
  USING (
    owner_id = (SELECT app.current_user_id())
  )
  WITH CHECK (
    owner_id = (SELECT app.current_user_id())
  );

CREATE POLICY projects_insert ON projects
  FOR INSERT TO app_user
  WITH CHECK (
    owner_id = (SELECT app.current_user_id())
  );

CREATE POLICY projects_delete ON projects
  FOR DELETE TO app_user
  USING (
    owner_id = (SELECT app.current_user_id())
  );

-- =============================================================================
-- Duplicate ALL policies for 'authenticated' role (Supabase compatibility)
-- Supabase clients connect as 'authenticated', not 'app_user'
-- =============================================================================

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

    -- Documents
    EXECUTE $p$ CREATE POLICY documents_select_auth ON documents FOR SELECT TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('viewer'))) $p$;
    EXECUTE $p$ CREATE POLICY documents_insert_auth ON documents FOR INSERT TO authenticated
      WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor'))) $p$;
    EXECUTE $p$ CREATE POLICY documents_update_auth ON documents FOR UPDATE TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor')))
      WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor'))) $p$;
    EXECUTE $p$ CREATE POLICY documents_delete_auth ON documents FOR DELETE TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('owner'))) $p$;

    -- Graph entities
    EXECUTE $p$ CREATE POLICY entities_select_auth ON graph_entities FOR SELECT TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('viewer'))) $p$;
    EXECUTE $p$ CREATE POLICY entities_insert_auth ON graph_entities FOR INSERT TO authenticated
      WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor'))) $p$;
    EXECUTE $p$ CREATE POLICY entities_update_auth ON graph_entities FOR UPDATE TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor')))
      WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor'))) $p$;
    EXECUTE $p$ CREATE POLICY entities_delete_auth ON graph_entities FOR DELETE TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('owner'))) $p$;

    -- Graph observations
    EXECUTE $p$ CREATE POLICY observations_select_auth ON graph_observations FOR SELECT TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('viewer'))) $p$;
    EXECUTE $p$ CREATE POLICY observations_insert_auth ON graph_observations FOR INSERT TO authenticated
      WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor'))) $p$;
    EXECUTE $p$ CREATE POLICY observations_update_auth ON graph_observations FOR UPDATE TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor')))
      WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor'))) $p$;
    EXECUTE $p$ CREATE POLICY observations_delete_auth ON graph_observations FOR DELETE TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('owner'))) $p$;

    -- Graph relations
    EXECUTE $p$ CREATE POLICY relations_select_auth ON graph_relations FOR SELECT TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('viewer'))) $p$;
    EXECUTE $p$ CREATE POLICY relations_insert_auth ON graph_relations FOR INSERT TO authenticated
      WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor'))) $p$;
    EXECUTE $p$ CREATE POLICY relations_update_auth ON graph_relations FOR UPDATE TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor')))
      WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor'))) $p$;
    EXECUTE $p$ CREATE POLICY relations_delete_auth ON graph_relations FOR DELETE TO authenticated
      USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('owner'))) $p$;

    -- API keys
    EXECUTE $p$ CREATE POLICY api_keys_select_auth ON api_keys FOR SELECT TO authenticated
      USING (user_id = (SELECT app.current_user_id())) $p$;
    EXECUTE $p$ CREATE POLICY api_keys_insert_auth ON api_keys FOR INSERT TO authenticated
      WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_project_role('owner'))) $p$;
    EXECUTE $p$ CREATE POLICY api_keys_update_auth ON api_keys FOR UPDATE TO authenticated
      USING (user_id = (SELECT app.current_user_id())) $p$;
    EXECUTE $p$ CREATE POLICY api_keys_delete_auth ON api_keys FOR DELETE TO authenticated
      USING (user_id = (SELECT app.current_user_id())) $p$;

    -- Sessions
    EXECUTE $p$ CREATE POLICY sessions_select_auth ON sessions FOR SELECT TO authenticated
      USING (user_id = (SELECT app.current_user_id())) $p$;
    EXECUTE $p$ CREATE POLICY sessions_insert_auth ON sessions FOR INSERT TO authenticated
      WITH CHECK (user_id = (SELECT app.current_user_id())) $p$;
    EXECUTE $p$ CREATE POLICY sessions_update_auth ON sessions FOR UPDATE TO authenticated
      USING (user_id = (SELECT app.current_user_id())) $p$;
    EXECUTE $p$ CREATE POLICY sessions_delete_auth ON sessions FOR DELETE TO authenticated
      USING (user_id = (SELECT app.current_user_id())) $p$;

    -- Memberships
    EXECUTE $p$ CREATE POLICY memberships_select_auth ON memberships FOR SELECT TO authenticated
      USING (user_id = (SELECT app.current_user_id())) $p$;
    EXECUTE $p$ CREATE POLICY memberships_insert_auth ON memberships FOR INSERT TO authenticated
      WITH CHECK ((SELECT app.has_project_role('owner'))) $p$;
    EXECUTE $p$ CREATE POLICY memberships_update_auth ON memberships FOR UPDATE TO authenticated
      USING ((SELECT app.has_project_role('owner'))) $p$;
    EXECUTE $p$ CREATE POLICY memberships_delete_auth ON memberships FOR DELETE TO authenticated
      USING ((SELECT app.has_project_role('owner'))) $p$;

    -- Projects
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

-- =============================================================================
-- Track migration
-- =============================================================================

INSERT INTO schema_migrations (version) VALUES ('003_policies');

COMMIT;
