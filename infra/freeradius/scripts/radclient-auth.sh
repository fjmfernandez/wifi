#!/bin/sh
set -eu

. /usr/local/bin/lab-common.sh

auth_mode="${1:-pap}"
server="${RADIUS_SERVER:-radius-a}"
port="${RADIUS_AUTH_PORT:-1812}"
nas_identifier="${RADIUS_NAS_IDENTIFIER:-lab-router}"
username="${RADIUS_TEST_USERNAME:-lab-user}"
password="$(lab_test_password)"
secret_file="$(lab_secret_file)"
request_file="/tmp/radius-auth-request"
response_file="/tmp/radius-auth-response"

case "$auth_mode" in
  pap) password_attribute="User-Password" ;;
  chap) password_attribute="CHAP-Password" ;;
  *) lab_die "usage: radclient-auth [pap|chap]" ;;
esac

umask 077
{
  printf 'User-Name = "%s"\n' "$username"
  printf '%s = "%s"\n' "$password_attribute" "$password"
  printf 'NAS-Identifier = "%s"\n' "$nas_identifier"
  printf 'NAS-IP-Address = 172.31.50.10\n'
  printf 'Calling-Station-Id = "02:00:00:00:00:01"\n'
  printf 'Called-Station-Id = "02:00:00:00:10:01:lab-ssid"\n'
  printf 'Message-Authenticator = 0x00\n'
} > "$request_file"
unset password

radclient -b -x -r 1 -t 3 -S "$secret_file" -f "$request_file" "$server:$port" auth \
  2>&1 | tee "$response_file"

grep -q 'Access-Accept' "$response_file" || lab_die "$auth_mode did not return Access-Accept"
grep -q 'Port-Limit = 1' "$response_file" || lab_die "Port-Limit was not returned"
grep -q 'Acct-Interim-Interval = 300' "$response_file" || lab_die "interim interval was not returned"
if grep -q 'Simultaneous-Use' "$response_file"; then
  lab_die "Simultaneous-Use must never be sent to RouterOS"
fi

printf '%s\n' "$auth_mode lab request passed; production protocol choice remains BLOCKED_BY_LAB_VALIDATION."
