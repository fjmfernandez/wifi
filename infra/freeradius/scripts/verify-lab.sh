#!/bin/sh
set -eu

radius_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
compose_file="$radius_root/compose.lab.yml"

docker compose -f "$compose_file" --profile tools up -d postgres radius-a radius-b nas-simulator
sh "$radius_root/scripts/seed-lab-credential.sh"

post_auth_before="$(docker compose -f "$compose_file" exec -T postgres \
  psql --tuples-only --no-align --username lab_owner --dbname wifi_entelsat \
  --command "SELECT count(*) FROM radius_runtime.post_auth_inbox")"

docker compose -f "$compose_file" exec -T nas-simulator radclient-auth pap
docker compose -f "$compose_file" exec -T nas-simulator radclient-auth chap
docker compose -f "$compose_file" exec -T -e RADIUS_SERVER=radius-b nas-simulator radclient-auth pap

# A fresh session id keeps repeated verification runs independent while the
# accounting inbox remains correctly append-only.
session_id="lab-session-$(date +%s)-$$"
docker compose -f "$compose_file" exec -T \
  -e RADIUS_ACCT_SESSION_ID="$session_id" nas-simulator radclient-accounting

event_count="$(docker compose -f "$compose_file" exec -T postgres \
  psql --tuples-only --no-align --username lab_owner --dbname wifi_entelsat \
  --command "SELECT count(*) FROM radius_runtime.accounting_inbox WHERE acct_session_id = '$session_id'")"
[ "$event_count" = "3" ] || {
  printf '%s\n' "expected 3 idempotent accounting rows, found $event_count" >&2
  exit 1
}

class_mismatch_count="$(docker compose -f "$compose_file" exec -T postgres \
  psql --tuples-only --no-align --username lab_owner --dbname wifi_entelsat \
  --command "SELECT count(*) FROM radius_runtime.accounting_inbox WHERE acct_session_id = '$session_id' AND class_value IS DISTINCT FROM 'authorization:40000000-0000-4000-8000-000000000001'")"
[ "$class_mismatch_count" = "0" ] || {
  printf '%s\n' "Class was not preserved byte-for-byte in accounting" >&2
  exit 1
}

post_auth_after="$(docker compose -f "$compose_file" exec -T postgres \
  psql --tuples-only --no-align --username lab_owner --dbname wifi_entelsat \
  --command "SELECT count(*) FROM radius_runtime.post_auth_inbox")"
[ "$((post_auth_after - post_auth_before))" = "3" ] || {
  printf '%s\n' "expected three append-only post-auth rows" >&2
  exit 1
}

forbidden_count="$(docker compose -f "$compose_file" exec -T postgres \
  psql --tuples-only --no-align --username lab_owner --dbname wifi_entelsat \
  --command "SELECT count(*) FROM radius_runtime.reply_attributes WHERE attribute IN ('Simultaneous-Use', 'Mikrotik-Total-Limit', 'Mikrotik-Total-Limit-Gigawords')")"
[ "$forbidden_count" = "0" ] || {
  printf '%s\n' "a blocked reply attribute reached the runtime projection" >&2
  exit 1
}

printf '%s\n' "RADIUS lab smoke tests passed on both nodes; physical RouterOS gates remain open."
