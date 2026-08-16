#!/bin/sh
set -eu

. /usr/local/bin/lab-common.sh

server="${RADIUS_SERVER:-radius-a}"
port="${RADIUS_ACCT_PORT:-1813}"
nas_identifier="${RADIUS_NAS_IDENTIFIER:-lab-router}"
secret_file="$(lab_secret_file)"
session_id="${RADIUS_ACCT_SESSION_ID:-lab-session-0001}"
class_value="authorization:40000000-0000-4000-8000-000000000001"

send_event() {
  status="$1"
  session_time="$2"
  input_octets="$3"
  output_octets="$4"
  request_file="/tmp/radius-acct-${status}"
  response_file="/tmp/radius-acct-${status}.response"

  {
    printf 'User-Name = "lab-user"\n'
    printf 'NAS-Identifier = "%s"\n' "$nas_identifier"
    printf 'NAS-IP-Address = 172.31.50.10\n'
    printf 'Acct-Session-Id = "%s"\n' "$session_id"
    printf 'Acct-Status-Type = %s\n' "$status"
    printf 'Acct-Session-Time = %s\n' "$session_time"
    printf 'Acct-Input-Octets = %s\n' "$input_octets"
    printf 'Acct-Input-Gigawords = 0\n'
    printf 'Acct-Output-Octets = %s\n' "$output_octets"
    printf 'Acct-Output-Gigawords = 0\n'
    printf 'Acct-Delay-Time = 0\n'
    printf 'Calling-Station-Id = "02:00:00:00:00:01"\n'
    printf 'Framed-IP-Address = 172.31.50.100\n'
    printf 'Class = "%s"\n' "$class_value"
    printf 'Message-Authenticator = 0x00\n'
  } > "$request_file"

  radclient -x -r 1 -t 3 -S "$secret_file" -f "$request_file" "$server:$port" acct \
    2>&1 | tee "$response_file"
  grep -q 'Accounting-Response' "$response_file" || lab_die "$status was not durably acknowledged"
}

send_event Start 0 0 0
send_event Interim-Update 300 1000 2000
# Exact retransmission: the database fingerprint must collapse this row.
send_event Interim-Update 300 1000 2000
send_event Stop 600 1500 3000

printf '%s\n' "Sent Start, duplicated Interim-Update, and Stop to $server."
