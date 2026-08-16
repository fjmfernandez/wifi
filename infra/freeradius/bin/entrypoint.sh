#!/bin/sh
set -eu

umask 077

runtime_dir="${RADIUS_RUNTIME_DIR:-/run/freeradius}"
clients_secret="${RADIUS_CLIENTS_FILE:-/run/secrets/radius_clients}"
db_password_file="${RADIUS_DB_PASSWORD_FILE:-/run/secrets/radius_db_password}"
db_host="${RADIUS_DB_HOST:-postgres}"
db_port="${RADIUS_DB_PORT:-5432}"
db_name="${RADIUS_DB_NAME:-wifi_entelsat}"
db_user="${RADIUS_DB_USER:-radius_runtime_login}"
db_sslmode="${RADIUS_DB_SSLMODE:-verify-full}"
db_sslrootcert="${RADIUS_DB_SSLROOTCERT:-/run/secrets/postgres_ca}"

die() {
  printf '%s\n' "radius-entrypoint: $*" >&2
  exit 1
}

require_regular_secret() {
  secret_path="$1"
  [ -f "$secret_path" ] || die "required secret is not a regular file: $secret_path"
  [ ! -L "$secret_path" ] || die "secret path must not be a symlink: $secret_path"
}

validate_identifier() {
  label="$1"
  value="$2"
  case "$value" in
    ''|*[!A-Za-z0-9_.-]*) die "$label contains unsupported characters" ;;
  esac
}

case "$runtime_dir" in
  /run/*) ;;
  *) die "RADIUS_RUNTIME_DIR must stay below /run" ;;
esac

require_regular_secret "$clients_secret"
require_regular_secret "$db_password_file"
validate_identifier "RADIUS_DB_HOST" "$db_host"
validate_identifier "RADIUS_DB_NAME" "$db_name"
validate_identifier "RADIUS_DB_USER" "$db_user"

case "$db_port" in
  ''|*[!0-9]*) die "RADIUS_DB_PORT must be numeric" ;;
esac
[ "$db_port" -ge 1 ] && [ "$db_port" -le 65535 ] || die "RADIUS_DB_PORT is out of range"

db_password="$(tr -d '\r\n' < "$db_password_file")"
case "$db_password" in
  ''|*[!A-Za-z0-9_.~-]*) die "database password must be 32-128 base64url-safe characters" ;;
esac
[ "${#db_password}" -ge 32 ] && [ "${#db_password}" -le 128 ] \
  || die "database password must be 32-128 base64url-safe characters"

case "$db_sslmode" in
  verify-full|verify-ca)
    require_regular_secret "$db_sslrootcert"
    case "$db_sslrootcert" in
      /*) ;;
      *) die "RADIUS_DB_SSLROOTCERT must be an absolute path" ;;
    esac
    case "$db_sslrootcert" in
      *[!A-Za-z0-9_./-]*) die "RADIUS_DB_SSLROOTCERT contains unsupported characters" ;;
    esac
    export PGSSLROOTCERT="$db_sslrootcert"
    ;;
  disable)
    [ "${RADIUS_ALLOW_INSECURE_DB:-}" = "lab-only" ] \
      || die "sslmode=disable is accepted only with RADIUS_ALLOW_INSECURE_DB=lab-only"
    ;;
  *) die "RADIUS_DB_SSLMODE must be verify-full, verify-ca, or lab-only disable" ;;
esac
export PGSSLMODE="$db_sslmode"

# The container intentionally drops every Linux capability.  In particular,
# root cannot chown a tmpfs after CAP_CHOWN is removed, so create the runtime
# directory with its final mode and keep the rendered configuration root-only.
install -d -m 0750 "$runtime_dir"

sql_runtime_tmp="$runtime_dir/sql-runtime.conf.tmp"
sql_runtime="$runtime_dir/sql-runtime.conf"
# Keep the password in FreeRADIUS' dedicated secret field.  Putting it in a
# libpq radius_db DSN makes rlm_sql print it in normal startup diagnostics.
# TLS parameters are inherited by libpq from PGSSLMODE/PGSSLROOTCERT.
{
  printf 'server = "%s"\n' "$db_host"
  printf 'port = %s\n' "$db_port"
  printf 'login = "%s"\n' "$db_user"
  printf 'password = "%s"\n' "$db_password"
  printf 'radius_db = "%s"\n' "$db_name"
} > "$sql_runtime_tmp"
chmod 0600 "$sql_runtime_tmp"
mv -f "$sql_runtime_tmp" "$sql_runtime"
unset db_password

clients_normalized="$runtime_dir/clients.tsv"
tr -d '\r' < "$clients_secret" > "$clients_normalized"
chmod 0600 "$clients_normalized"

clients_runtime_tmp="$runtime_dir/clients-runtime.conf.tmp"
clients_runtime="$runtime_dir/clients-runtime.conf"
: > "$clients_runtime_tmp"
client_count=0

while IFS="$(printf '\t')" read -r client_name client_ip client_secret extra; do
  case "$client_name" in
    ''|'#'*) continue ;;
  esac
  [ -z "${extra:-}" ] || die "client secret file must have exactly three tab-separated fields"
  validate_identifier "client name" "$client_name"
  case "$client_ip" in
    ''|0.0.0.0|::|*[!0-9A-Fa-f:.]*) die "client $client_name must use one exact IPv4 or IPv6 source address" ;;
  esac
  case "$client_secret" in
    ''|*[!A-Za-z0-9_.~-]*) die "client $client_name secret must be base64url-safe" ;;
  esac
  [ "${#client_secret}" -ge 32 ] && [ "${#client_secret}" -le 128 ] \
    || die "client $client_name secret must contain 32-128 characters"

  cat >> "$clients_runtime_tmp" <<EOF
client ${client_name} {
    ipaddr = ${client_ip}
    shortname = ${client_name}
    secret = ${client_secret}
    nas_type = other
    require_message_authenticator = yes
}
EOF
  client_count=$((client_count + 1))
done < "$clients_normalized"

[ "$client_count" -gt 0 ] || die "client secret file did not contain a NAS client"
chmod 0600 "$clients_runtime_tmp"
mv -f "$clients_runtime_tmp" "$clients_runtime"
rm -f "$clients_normalized"

# This path is pre-created with freerad ownership in the image and copied with
# that ownership into the named log volume on first use.
[ -d /var/log/freeradius/radacct/entelsat ] \
  || die "accounting detail spool directory is missing"

# Validate the rendered secret-backed configuration before accepting traffic.
# Do not add -X here: debug configuration dumps can expose the libpq DSN.
freeradius -C

exec /docker-entrypoint.sh "$@"
