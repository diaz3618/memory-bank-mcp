-- Supabase Setup: 002 Policies
-- 
-- For Supabase: uses 'authenticated' role instead of 'app_user'.
-- Adjust the TO clause if needed for your Supabase project.
-- 
-- Run order: 001_schema.sql → 002_policies.sql → 003_functions.sql

BEGIN;

-- Note: On Supabase, the 'authenticated' role already exists.
-- We create app_user as an alias via GRANT for local compatibility.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT USAGE ON SCHEMA app TO app_user;
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

-- Enable RLS
ALTER TABLE documents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_entities    ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_relations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects          ENABLE ROW LEVEL SECURITY;

-- Documents
CREATE POLICY documents_select ON documents FOR SELECT TO app_user
  USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('viewer')));
CREATE POLICY documents_insert ON documents FOR INSERT TO app_user
  WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor')));
CREATE POLICY documents_update ON documents FOR UPDATE TO app_user
  USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor')))
  WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor')));
CREATE POLICY documents_delete ON documents FOR DELETE TO app_user
  USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('owner')));

-- Graph entities
CREATE POLICY entities_select ON graph_entities FOR SELECT TO app_user
  USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('viewer')));
CREATE POLICY entities_insert ON graph_entities FOR INSERT TO app_user
  WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor')));
CREATE POLICY entities_update ON graph_entities FOR UPDATE TO app_user
  USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor')))
  WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor')));
CREATE POLICY entities_delete ON graph_entities FOR DELETE TO app_user
  USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('owner')));

-- Graph observations
CREATE POLICY observations_select ON graph_observations FOR SELECT TO app_user
  USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('viewer')));
CREATE POLICY observations_insert ON graph_observations FOR INSERT TO app_user
  WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor')));
CREATE POLICY observations_update ON graph_observations FOR UPDATE TO app_user
  USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor')))
  WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor')));
CREATE POLICY observations_delete ON graph_observations FOR DELETE TO app_user
  USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('owner')));

-- Graph relations
CREATE POLICY relations_select ON graph_relations FOR SELECT TO app_user
  USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('viewer')));
CREATE POLICY relations_insert ON graph_relations FOR INSERT TO app_user
  WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor')));
CREATE POLICY relations_update ON graph_relations FOR UPDATE TO app_user
  USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor')))
  WITH CHECK (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('editor')));
CREATE POLICY relations_delete ON graph_relations FOR DELETE TO app_user
  USING (project_id = (SELECT app.current_project_id()) AND (SELECT app.has_project_role('owner')));

-- API keys
CREATE POLICY api_keys_select ON api_keys FOR SELECT TO app_user
  USING (user_id = (SELECT app.current_user_id()));
CREATE POLICY api_keys_insert ON api_keys FOR INSERT TO app_user
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_project_role('owner')));
CREATE POLICY api_keys_update ON api_keys FOR UPDATE TO app_user
  USING (user_id = (SELECT app.current_user_id()));

-- Sessions
CREATE POLICY sessions_select ON sessions FOR SELECT TO app_user
  USING (user_id = (SELECT app.current_user_id()));
CREATE POLICY sessions_insert ON sessions FOR INSERT TO app_user
  WITH CHECK (user_id = (SELECT app.current_user_id()));
CREATE POLICY sessions_update ON sessions FOR UPDATE TO app_user
  USING (user_id = (SELECT app.current_user_id()));
CREATE POLICY sessions_delete ON sessions FOR DELETE TO app_user
  USING (user_id = (SELECT app.current_user_id()));

-- Memberships
CREATE POLICY memberships_select ON memberships FOR SELECT TO app_user
  USING (user_id = (SELECT app.current_user_id()));
CREATE POLICY memberships_insert ON memberships FOR INSERT TO app_user
  WITH CHECK ((SELECT app.has_project_role('owner')));
CREATE POLICY memberships_update ON memberships FOR UPDATE TO app_user
  USING ((SELECT app.has_project_role('owner')));
CREATE POLICY memberships_delete ON memberships FOR DELETE TO app_user
  USING ((SELECT app.has_project_role('owner')));

-- Projects
CREATE POLICY projects_select ON projects FOR SELECT TO app_user
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.project_id = projects.id AND m.user_id = (SELECT app.current_user_id())));
CREATE POLICY projects_update ON projects FOR UPDATE TO app_user
  USING (owner_id = (SELECT app.current_user_id()))
  WITH CHECK (owner_id = (SELECT app.current_user_id()));
CREATE POLICY projects_insert ON projects FOR INSERT TO app_user
  WITH CHECK (owner_id = (SELECT app.current_user_id()));
CREATE POLICY projects_delete ON projects FOR DELETE TO app_user
  USING (owner_id = (SELECT app.current_user_id()));

INSERT INTO schema_migrations (version) VALUES ('002_policies');

COMMIT;
