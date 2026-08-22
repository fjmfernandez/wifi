#!/bin/sh
set -eu

umask 077

runtime_dir="${SSTP_RUNTIME_DIR:-/run/entelsat-sstp}"
config_file="$runtime_dir/accel-ppp.conf"
chap_file="$runtime_dir/chap-secrets"
cert_file="$runtime_dir/server.crt"
key_file="$runtime_dir/server.key"
pid_file="$runtime_dir/accel-ppp.pid"

sstp_bind="${SSTP_BIND:-0.0.0.0}"
sstp_port="${SSTP_PORT:-4443}"
sstp_public_host="${SSTP_PUBLIC_HOST:-62.84.190.174}"
sstp_local_ip="${SSTP_LOCAL_IP:-10.255.0.1}"
sstp_pool="${SSTP_POOL:-10.255.0.2-254}"
sstp_dns1="${SSTP_DNS1:-1.1.1.1}"
sstp_dns2="${SSTP_DNS2:-8.8.8.8}"
radius_host="${RADIUS_HOST:-radius}"

die() {
  printf '%s\n' "sstp-entrypoint: $*" >&2
  exit 1
}

validate_ipv4() {
  label="$1"
  value="$2"
  printf '%s' "$value" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$' || die "$label must be IPv4"
  old_ifs="$IFS"
  IFS=.
  set -- $value
  IFS="$old_ifs"
  for octet in "$@"; do
    [ "$octet" -ge 0 ] && [ "$octet" -le 255 ] || die "$label octet is out of range"
  done
}

validate_identifier() {
  label="$1"
  value="$2"
  case "$value" in
    ''|*[!A-Za-z0-9_.@:-]*) die "$label contains unsupported characters" ;;
  esac
}

case "$runtime_dir" in
  /run/*) ;;
  *) die "SSTP_RUNTIME_DIR must stay below /run" ;;
esac

case "$sstp_port" in
  ''|*[!0-9]*) die "SSTP_PORT must be numeric" ;;
esac
[ "$sstp_port" -ge 1 ] && [ "$sstp_port" -le 65535 ] || die "SSTP_PORT is out of range"
validate_ipv4 "SSTP_LOCAL_IP" "$sstp_local_ip"
validate_ipv4 "SSTP_DNS1" "$sstp_dns1"
validate_ipv4 "SSTP_DNS2" "$sstp_dns2"

install -d -m 0750 "$runtime_dir"

if [ ! -c /dev/ppp ]; then
  rm -f /dev/ppp
  mknod /dev/ppp c 108 0 || die "could not create /dev/ppp; run the container as privileged or map /dev/ppp"
  chmod 0600 /dev/ppp
fi

if [ -n "${SSTP_CERT_PEM_BASE64:-}" ] && [ -n "${SSTP_KEY_PEM_BASE64:-}" ]; then
  printf '%s' "$SSTP_CERT_PEM_BASE64" | base64 -d > "$cert_file"
  printf '%s' "$SSTP_KEY_PEM_BASE64" | base64 -d > "$key_file"
else
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$key_file" \
    -out "$cert_file" \
    -days 825 \
    -subj "/CN=$sstp_public_host" >/dev/null 2>&1
fi
chmod 0600 "$cert_file" "$key_file"

users_source="$runtime_dir/users.tsv"
if [ -n "${SSTP_USERS_TSV:-}" ]; then
  printf '%s\n' "$SSTP_USERS_TSV" > "$users_source"
else
  generated_user="disabled-$(openssl rand -hex 6)"
  generated_password="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')"
  printf '%s\t%s\t10.255.0.254\n' "$generated_user" "$generated_password" > "$users_source"
fi
chmod 0600 "$users_source"

: > "$chap_file.tmp"
user_count=0
while IFS="$(printf '\t')" read -r username password client_ip extra; do
  case "$username" in
    ''|'#'*) continue ;;
  esac
  [ -z "${extra:-}" ] || die "SSTP_USERS_TSV must have exactly username<TAB>password<TAB>client_ip"
  validate_identifier "SSTP username" "$username"
  case "$password" in
    ''|*[!A-Za-z0-9_.~:@%+=,-]*) die "SSTP password contains unsupported characters" ;;
  esac
  [ "${#password}" -ge 8 ] || die "SSTP password must contain at least 8 characters"
  validate_ipv4 "SSTP client IP" "$client_ip"
  printf '%s\t*\t%s\t%s\n' "$username" "$password" "$client_ip" >> "$chap_file.tmp"
  user_count=$((user_count + 1))
done < "$users_source"
[ "$user_count" -gt 0 ] || die "SSTP_USERS_TSV did not contain users"
mv -f "$chap_file.tmp" "$chap_file"
chmod 0600 "$chap_file"
rm -f "$users_source"

radius_ip="$(getent hosts "$radius_host" | awk '{print $1; exit}')"
[ -n "$radius_ip" ] || die "could not resolve RADIUS_HOST=$radius_host"

sysctl -w net.ipv4.ip_forward=1 >/dev/null || true

iptables -t nat -C PREROUTING -i sstp+ -p udp --dport 1812 -j DNAT --to-destination "$radius_ip:1812" 2>/dev/null \
  || iptables -t nat -A PREROUTING -i sstp+ -p udp --dport 1812 -j DNAT --to-destination "$radius_ip:1812"
iptables -t nat -C PREROUTING -i sstp+ -p udp --dport 1813 -j DNAT --to-destination "$radius_ip:1813" 2>/dev/null \
  || iptables -t nat -A PREROUTING -i sstp+ -p udp --dport 1813 -j DNAT --to-destination "$radius_ip:1813"
iptables -t nat -C POSTROUTING -d "$radius_ip" -p udp -m multiport --dports 1812,1813 -j MASQUERADE 2>/dev/null \
  || iptables -t nat -A POSTROUTING -d "$radius_ip" -p udp -m multiport --dports 1812,1813 -j MASQUERADE
iptables -C FORWARD -i sstp+ -d "$radius_ip" -p udp -m multiport --dports 1812,1813 -j ACCEPT 2>/dev/null \
  || iptables -A FORWARD -i sstp+ -d "$radius_ip" -p udp -m multiport --dports 1812,1813 -j ACCEPT
iptables -C FORWARD -o sstp+ -s "$radius_ip" -p udp -m multiport --sports 1812,1813 -j ACCEPT 2>/dev/null \
  || iptables -A FORWARD -o sstp+ -s "$radius_ip" -p udp -m multiport --sports 1812,1813 -j ACCEPT

cat > "$config_file" <<EOF
[modules]
log_file
sstp
auth_mschap_v2
auth_mschap_v1
chap-secrets
ippool

[core]
log-error=/dev/stderr
thread-count=2

[common]
single-session=replace

[ppp]
verbose=1
min-mtu=1280
mtu=1400
mru=1400
ipv4=require
mppe=require

[sstp]
bind=$sstp_bind
port=$sstp_port
verbose=1
accept=ssl
ssl-pemfile=$cert_file
ssl-keyfile=$key_file
ifname=sstp%d
ip-pool=sstp
timeout=60
hello-interval=60
http-error=allow

[ip-pool]
gw-ip-address=$sstp_local_ip
$sstp_pool,sstp

[chap-secrets]
gw-ip-address=$sstp_local_ip
chap-secrets=$chap_file

[dns]
dns1=$sstp_dns1
dns2=$sstp_dns2

[log]
log-file=/dev/stdout
log-emerg=/dev/stderr
log-fail-file=/dev/stdout
copy=1
level=3
EOF

exec accel-pppd -d -c "$config_file" -p "$pid_file"
