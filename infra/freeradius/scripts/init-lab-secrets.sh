#!/bin/sh
set -eu

radius_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
secrets_dir="$radius_root/secrets"
umask 077
mkdir -p "$secrets_dir"

generate_secret_file() {
  target="$1"
  if [ ! -s "$target" ]; then
    openssl rand -hex 32 > "$target"
    chmod 0600 "$target"
  fi
}

generate_secret_file "$secrets_dir/postgres_owner_password"
generate_secret_file "$secrets_dir/radius_db_password"
generate_secret_file "$secrets_dir/radius_test_password"

clients_file="$secrets_dir/radius_clients.tsv"
if [ ! -s "$clients_file" ]; then
  nas_secret="$(openssl rand -hex 32)"
  printf 'lab_nas\t172.31.50.10\t%s\n' "$nas_secret" > "$clients_file"
  unset nas_secret
  chmod 0600 "$clients_file"
fi

printf '%s\n' "Lab secrets are ready in $secrets_dir (contents intentionally not printed)."
