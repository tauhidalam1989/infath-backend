-- Run this as a PostgreSQL superuser (e.g. postgres) to fix "permission denied for table screen_regions" and schedules.
-- Replace 'smg' with your actual DB_USER from .env if different.

\c screen

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO smg;

-- Tables that often fail due to ownership (created by postgres or another user)
GRANT SELECT, INSERT, UPDATE, DELETE ON screen_regions TO smg;
GRANT USAGE, SELECT ON SEQUENCE screen_regions_id_seq TO smg;

GRANT SELECT, INSERT, UPDATE, DELETE ON advertisement_schedules TO smg;
GRANT USAGE, SELECT ON SEQUENCE advertisement_schedules_id_seq TO smg;

-- Grant on all existing tables and sequences (so no other "permission denied" later)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO smg;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO smg;

-- Optional: default for future tables created by postgres in this schema
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO smg;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO smg;
