#!/bin/sh

lab_die() {
  printf '%s\n' "radius-lab: $*" >&2
  exit 1
}

lab_require_file() {
  [ -f "$1" ] || lab_die "required secret file is missing: $1"
}

lab_secret_file() {
  clients_file="${RADIUS_CLIENTS_FILE:-/run/secrets/radius_clients}"
  client_name="${RADIUS_CLIENT_NAME:-lab_nas}"
  target="${RADCLIENT_SECRET_FILE:-/tmp/radclient.secret}"
  lab_require_file "$clients_file"

  client_secret="$(awk -F '\t' -v wanted="$client_name" '
    $1 == wanted { if (found++) exit 2; print $3 }
    END { if (found == 0) exit 3 }
  ' "$clients_file")" || lab_die "client $client_name is missing or duplicated"

  case "$client_secret" in
    ''|*[!A-Za-z0-9_.~-]*) lab_die "client secret has an invalid format" ;;
  esac
  umask 077
  printf '%s\n' "$client_secret" > "$target"
  unset client_secret
  printf '%s' "$target"
}

lab_test_password() {
  password_file="${RADIUS_TEST_PASSWORD_FILE:-/run/secrets/radius_test_password}"
  lab_require_file "$password_file"
  tr -d '\r\n' < "$password_file"
}

lab_validate_coa_port() {
  case "$1" in
    1700|3799) printf '%s' "$1" ;;
    *) lab_die "RADIUS_COA_PORT must be 1700 or 3799" ;;
  esac
}
