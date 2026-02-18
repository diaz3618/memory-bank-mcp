-- Migration 004: Make users.email nullable, make users.name required
-- Compatible with: PostgreSQL 16+ and Supabase
-- Rationale: Email is not mandatory for API key management.
--            Username (name) is the primary identifier for users.

BEGIN;

-- Make email nullable (was NOT NULL)
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- Make name required (was nullable)
ALTER TABLE users ALTER COLUMN name SET NOT NULL;

-- Add unique index on name for find-or-create lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name ON users(name);

INSERT INTO schema_migrations (version) VALUES ('004_email_nullable');

COMMIT;
