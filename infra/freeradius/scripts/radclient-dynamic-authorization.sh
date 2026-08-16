#!/bin/sh
set -eu

. /usr/local/bin/lab-common.sh

[ "${ALLOW_BLOCKED_COA_LAB:-}" = "1" ] \
  || lab_die "BLOCKED_BY_LAB_VALIDATION: set ALLOW_BLOCKED_COA_LAB=1 only inside L16/L17"

packet_kind="${1:-disconnect}"
router_ip="${RADIUS_COA_TARGET_IP:-}"
coa_port="$(lab_validate_coa_port "${RADIUS_COA_PORT:-1700}")"
session_id="${RADIUS_COA_ACCT_SESSION_ID:-}"
username="${RADIUS_COA_USER_NAME:-}"
nas_identifier="${RADIUS_NAS_IDENTIFIER:-lab-router}"
secret_file="$(lab_secret_file)"
request_file="/tmp/radius-dynamic-authorization"

[ -n "$router_ip" ] || lab_die "RADIUS_COA_TARGET_IP is required"
[ -n "$session_id" ] || lab_die "RADIUS_COA_ACCT_SESSION_ID is required"
[ -n "$username" ] || lab_die "RADIUS_COA_USER_NAME is required"

case "$packet_kind" in
  disconnect|coa) ;;
  *) lab_die "usage: radclient-dynamic-authorization [disconnect|coa]" ;;
esac

{
  printf 'User-Name = "%s"\n' "$username"
  printf 'Acct-Session-Id = "%s"\n' "$session_id"
  printf 'NAS-Identifier = "%s"\n' "$nas_identifier"
  printf 'Message-Authenticator = 0x00\n'
  if [ "$packet_kind" = "coa" ]; then
    [ -n "${RADIUS_COA_RATE_LIMIT:-}" ] || lab_die "RADIUS_COA_RATE_LIMIT is required for a CoA lab request"
    printf 'Mikrotik-Rate-Limit = "%s"\n' "$RADIUS_COA_RATE_LIMIT"
  fi
} > "$request_file"

printf '%s\n' "BLOCKED_BY_LAB_VALIDATION: verify the exact target and a neighbouring session before recording support."
radclient -b -x -r 1 -t 3 -S "$secret_file" -f "$request_file" \
  "$router_ip:$coa_port" "$packet_kind"
