\set ON_ERROR_STOP on

-- Run once per PostgreSQL cluster as the deployment-only bootstrap login.
-- Passwords are read from the psql process environment and are never persisted
-- in this repository or printed by this script.
\unset wifi_api_password
\unset wifi_jobs_password
\unset wifi_radius_password
\getenv wifi_api_password WIFI_API_PASSWORD
\getenv wifi_jobs_password WIFI_JOBS_PASSWORD
\getenv wifi_radius_password WIFI_RADIUS_PASSWORD

\if :{?wifi_api_password}
\else
  \echo 'WIFI_API_PASSWORD is required' >&2
  \quit
\endif
\if :{?wifi_jobs_password}
\else
  \echo 'WIFI_JOBS_PASSWORD is required' >&2
  \quit
\endif
\if :{?wifi_radius_password}
\else
  \echo 'WIFI_RADIUS_PASSWORD is required' >&2
  \quit
\endif

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wifi_app_runtime') THEN
        CREATE ROLE wifi_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wifi_worker') THEN
        CREATE ROLE wifi_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wifi_radius_runtime') THEN
        CREATE ROLE wifi_radius_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wifi_audit_writer') THEN
        CREATE ROLE wifi_audit_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wifi_export_worker') THEN
        CREATE ROLE wifi_export_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wifi_migrator') THEN
        CREATE ROLE wifi_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS NOREPLICATION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wifi_backup') THEN
        CREATE ROLE wifi_backup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS NOREPLICATION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wifi_monitoring') THEN
        CREATE ROLE wifi_monitoring NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wifi_api') THEN
        CREATE ROLE wifi_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wifi_jobs') THEN
        CREATE ROLE wifi_jobs LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wifi_radius') THEN
        CREATE ROLE wifi_radius LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
    END IF;
END
$roles$;

ALTER ROLE wifi_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
ALTER ROLE wifi_jobs LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
ALTER ROLE wifi_radius LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS NOREPLICATION;

SELECT format('ALTER ROLE wifi_api PASSWORD %L', :'wifi_api_password') \gexec
SELECT format('ALTER ROLE wifi_jobs PASSWORD %L', :'wifi_jobs_password') \gexec
SELECT format('ALTER ROLE wifi_radius PASSWORD %L', :'wifi_radius_password') \gexec

GRANT wifi_app_runtime TO wifi_api WITH INHERIT FALSE, SET TRUE;
GRANT wifi_worker TO wifi_jobs WITH INHERIT FALSE, SET TRUE;
GRANT wifi_radius_runtime TO wifi_radius WITH INHERIT TRUE, SET TRUE;

ALTER ROLE wifi_api SET row_security = on;
ALTER ROLE wifi_jobs SET row_security = on;
ALTER ROLE wifi_radius SET row_security = on;
ALTER ROLE wifi_api SET statement_timeout = '30s';
ALTER ROLE wifi_jobs SET statement_timeout = '5min';
ALTER ROLE wifi_radius SET statement_timeout = '10s';
ALTER ROLE wifi_api SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE wifi_jobs SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE wifi_radius SET idle_in_transaction_session_timeout = '10s';

COMMENT ON ROLE wifi_api IS 'LOGIN only; must SET ROLE wifi_app_runtime after connecting.';
COMMENT ON ROLE wifi_jobs IS 'LOGIN only; must SET ROLE wifi_worker after connecting.';
COMMENT ON ROLE wifi_radius IS 'LOGIN only; inherits the narrow wifi_radius_runtime role used by FreeRADIUS.';
