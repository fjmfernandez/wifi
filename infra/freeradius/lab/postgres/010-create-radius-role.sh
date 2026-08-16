#!/bin/sh
set -eu

password_file="${RADIUS_DB_PASSWORD_FILE:-/run/secrets/radius_db_password}"
[ -f "$password_file" ] || {
  printf '%s\n' "missing RADIUS DB password secret: $password_file" >&2
  exit 1
}

radius_password="$(tr -d '\r\n' < "$password_file")"
case "$radius_password" in
  ''|*[!A-Za-z0-9_.~-]*)
    printf '%s\n' "RADIUS DB password must be base64url-safe" >&2
    exit 1
    ;;
esac

psql --set=ON_ERROR_STOP=1 --set=radius_password="$radius_password" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
SELECT format(
    'CREATE ROLE radius_runtime_login LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT CONNECTION LIMIT 20',
    :'radius_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'radius_runtime_login')
\gexec

ALTER ROLE radius_runtime_login PASSWORD :'radius_password';
ALTER ROLE radius_runtime_login SET statement_timeout = '2s';
ALTER ROLE radius_runtime_login SET lock_timeout = '1s';
ALTER ROLE radius_runtime_login SET idle_in_transaction_session_timeout = '5s';
ALTER ROLE radius_runtime_login SET search_path = radius_runtime, pg_catalog;

GRANT CONNECT ON DATABASE :"DBNAME" TO radius_runtime_login;
GRANT USAGE ON SCHEMA radius_runtime TO radius_runtime_login;
GRANT SELECT ON
    radius_runtime.credentials,
    radius_runtime.reply_attributes,
    radius_runtime.radcheck_compat,
    radius_runtime.radreply_compat
TO radius_runtime_login;
GRANT INSERT ON
    radius_runtime.accounting_inbox,
    radius_runtime.post_auth_inbox
TO radius_runtime_login;
# PostgreSQL needs SELECT on the named conflict target to evaluate
# ON CONFLICT ... DO NOTHING.  Keep that read access column-scoped.
GRANT SELECT (tenant_id, event_fingerprint)
ON radius_runtime.accounting_inbox TO radius_runtime_login;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA radius_runtime TO radius_runtime_login;
SQL

unset radius_password
