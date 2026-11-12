-- The 'workbench' database already exists (created by POSTGRES_DB env var).
-- The 'workbench' superuser already exists (created by POSTGRES_USER env var).

-- Schema for Unleash
CREATE SCHEMA IF NOT EXISTS unleash;

-- Dedicated Unleash user — owns the 'unleash' schema
CREATE USER unleash_user WITH PASSWORD 'unleash_pass';
GRANT ALL PRIVILEGES ON SCHEMA unleash TO unleash_user;
ALTER SCHEMA unleash OWNER TO unleash_user;

-- Ensure unleash_user's search_path defaults to its schema
ALTER USER unleash_user SET search_path TO unleash;
