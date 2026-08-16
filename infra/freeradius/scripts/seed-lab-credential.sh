#!/bin/sh
set -eu

radius_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
compose_file="$radius_root/compose.lab.yml"

docker compose -f "$compose_file" exec -T postgres \
  psql --set=ON_ERROR_STOP=1 --username lab_owner --dbname wifi_entelsat <<'SQL'
\set test_password `tr -d '\r\n' < /run/secrets/radius_test_password`

INSERT INTO radius_runtime.credentials (
    credential_id,
    tenant_id,
    gateway_id,
    authorization_id,
    username,
    nas_identifier,
    verifier_attribute,
    verifier_value,
    not_before,
    expires_at,
    enabled
)
VALUES (
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'lab-user',
    'lab-router',
    'Cleartext-Password',
    :'test_password',
    clock_timestamp() - interval '1 minute',
    clock_timestamp() + interval '1 day',
    true
)
ON CONFLICT (username) DO UPDATE SET
    nas_identifier = EXCLUDED.nas_identifier,
    verifier_attribute = EXCLUDED.verifier_attribute,
    verifier_value = EXCLUDED.verifier_value,
    not_before = EXCLUDED.not_before,
    expires_at = EXCLUDED.expires_at,
    enabled = true;

INSERT INTO radius_runtime.reply_attributes (credential_id, attribute, value, priority)
VALUES
    ('10000000-0000-4000-8000-000000000001', 'Class', 'authorization:40000000-0000-4000-8000-000000000001', 10),
    ('10000000-0000-4000-8000-000000000001', 'Mikrotik-Rate-Limit', '2000k/10000k', 20),
    ('10000000-0000-4000-8000-000000000001', 'Session-Timeout', '3600', 30),
    ('10000000-0000-4000-8000-000000000001', 'Idle-Timeout', '600', 40),
    ('10000000-0000-4000-8000-000000000001', 'Acct-Interim-Interval', '300', 50),
    ('10000000-0000-4000-8000-000000000001', 'Port-Limit', '1', 60)
ON CONFLICT (credential_id, attribute) DO UPDATE SET
    value = EXCLUDED.value,
    priority = EXCLUDED.priority;

\unset test_password
SQL

printf '%s\n' "Seeded lab-user. PAP/CHAP is still BLOCKED_BY_LAB_VALIDATION for production."
