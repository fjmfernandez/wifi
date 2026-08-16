CREATE SCHEMA IF NOT EXISTS radius_runtime;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

CREATE TABLE radius_runtime.credentials (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    credential_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    tenant_id uuid NOT NULL,
    gateway_id uuid NOT NULL,
    authorization_id uuid NOT NULL,
    username text NOT NULL UNIQUE,
    nas_identifier text NOT NULL,
    calling_station_id text,
    verifier_attribute text NOT NULL,
    verifier_value text NOT NULL,
    not_before timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT credentials_time_order CHECK (expires_at > not_before),
    CONSTRAINT credentials_username_nonempty CHECK (length(username) BETWEEN 1 AND 253),
    CONSTRAINT credentials_nas_nonempty CHECK (length(nas_identifier) BETWEEN 1 AND 253),
    CONSTRAINT credentials_mac_normalized CHECK (
        calling_station_id IS NULL OR calling_station_id ~ '^[0-9a-f]{12}$'
    ),
    CONSTRAINT credentials_verifier_allowlist CHECK (
        verifier_attribute IN ('Cleartext-Password', 'Crypt-Password')
    )
);

CREATE INDEX credentials_authorize_lookup
    ON radius_runtime.credentials (username, nas_identifier, enabled, expires_at);

CREATE TABLE radius_runtime.reply_attributes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    credential_id uuid NOT NULL REFERENCES radius_runtime.credentials (credential_id) ON DELETE CASCADE,
    attribute text NOT NULL,
    op text NOT NULL DEFAULT ':=',
    value text NOT NULL,
    priority smallint NOT NULL DEFAULT 100,
    CONSTRAINT reply_attributes_allowlist CHECK (
        attribute IN (
            'Class',
            'Mikrotik-Rate-Limit',
            'Session-Timeout',
            'Idle-Timeout',
            'Acct-Interim-Interval',
            'Port-Limit'
        )
    ),
    CONSTRAINT reply_attributes_operator CHECK (op = ':='),
    CONSTRAINT reply_attributes_value_nonempty CHECK (length(value) BETWEEN 1 AND 253),
    UNIQUE (credential_id, attribute)
);

CREATE VIEW radius_runtime.radcheck_compat
WITH (security_barrier = true)
AS
SELECT
    c.id,
    c.username,
    c.verifier_attribute AS attribute,
    c.verifier_value AS value,
    ':='::text AS op,
    c.nas_identifier,
    c.calling_station_id,
    c.enabled,
    c.not_before,
    c.expires_at
FROM radius_runtime.credentials c;

CREATE VIEW radius_runtime.radreply_compat
WITH (security_barrier = true)
AS
SELECT
    a.id,
    c.username,
    a.attribute,
    a.value,
    a.op,
    a.priority,
    c.nas_identifier,
    c.calling_station_id,
    c.enabled,
    c.not_before,
    c.expires_at
FROM radius_runtime.reply_attributes a
JOIN radius_runtime.credentials c USING (credential_id);

CREATE TABLE radius_runtime.accounting_inbox (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id uuid NOT NULL,
    gateway_id uuid NOT NULL,
    authorization_id uuid,
    username text NOT NULL,
    nas_identifier text NOT NULL,
    packet_source_ip inet NOT NULL,
    nas_ip_address inet,
    acct_session_id text NOT NULL,
    status_type text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    nas_event_at timestamptz,
    session_time_seconds bigint,
    nas_input_octets numeric(20, 0) NOT NULL,
    nas_output_octets numeric(20, 0) NOT NULL,
    acct_delay_seconds integer NOT NULL DEFAULT 0,
    calling_station_id text,
    framed_ip_address inet,
    class_value text,
    terminate_cause text,
    redacted_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    event_fingerprint text NOT NULL,
    CONSTRAINT accounting_status_allowlist CHECK (
        status_type IN ('Start', 'Interim-Update', 'Stop')
    ),
    CONSTRAINT accounting_session_nonempty CHECK (length(acct_session_id) BETWEEN 1 AND 253),
    CONSTRAINT accounting_counters_nonnegative CHECK (
        nas_input_octets >= 0 AND nas_output_octets >= 0
    ),
    CONSTRAINT accounting_delay_nonnegative CHECK (acct_delay_seconds >= 0),
    CONSTRAINT accounting_fingerprint_sha256 CHECK (event_fingerprint ~ '^[0-9a-f]{64}$'),
    UNIQUE (tenant_id, event_fingerprint)
);

CREATE INDEX accounting_inbox_unprocessed_order
    ON radius_runtime.accounting_inbox (tenant_id, received_at, id);
CREATE INDEX accounting_inbox_session_lookup
    ON radius_runtime.accounting_inbox (tenant_id, gateway_id, acct_session_id, received_at);

CREATE TABLE radius_runtime.post_auth_inbox (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id uuid NOT NULL,
    gateway_id uuid NOT NULL,
    authorization_id uuid,
    username text NOT NULL,
    nas_identifier text NOT NULL,
    packet_source_ip inet NOT NULL,
    calling_station_id text,
    reply_packet_type text NOT NULL,
    class_value text,
    received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT post_auth_reply_allowlist CHECK (
        reply_packet_type IN ('Access-Accept', 'Access-Reject', 'Access-Challenge')
    )
);

CREATE OR REPLACE FUNCTION radius_runtime.reject_inbox_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER accounting_inbox_append_only
BEFORE UPDATE OR DELETE ON radius_runtime.accounting_inbox
FOR EACH ROW EXECUTE FUNCTION radius_runtime.reject_inbox_mutation();

CREATE TRIGGER post_auth_inbox_append_only
BEFORE UPDATE OR DELETE ON radius_runtime.post_auth_inbox
FOR EACH ROW EXECUTE FUNCTION radius_runtime.reject_inbox_mutation();

COMMENT ON SCHEMA radius_runtime IS
    'Disposable PR05 lab contract. The packages/database migration is the production source of truth.';
COMMENT ON COLUMN radius_runtime.credentials.verifier_attribute IS
    'BLOCKED_BY_LAB_VALIDATION: PAP/CHAP production choice is intentionally not fixed.';
COMMENT ON COLUMN radius_runtime.accounting_inbox.nas_input_octets IS
    'Raw NAS direction; do not relabel as upload/download before physical-lab evidence.';
COMMENT ON COLUMN radius_runtime.accounting_inbox.nas_output_octets IS
    'Raw NAS direction; do not relabel as upload/download before physical-lab evidence.';
