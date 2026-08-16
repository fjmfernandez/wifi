-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "agent_runtime";

-- CreateTable
CREATE TABLE "agent_runtime"."site_agent_enrollment_tokens" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "gateway_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL DEFAULT uuidv7(),
    "token_hash" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_agent_enrollment_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runtime"."site_agent_identities" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "gateway_id" UUID NOT NULL,
    "enrollment_token_id" UUID NOT NULL,
    "protocol_version" SMALLINT NOT NULL,
    "agent_version" VARCHAR(64) NOT NULL,
    "hostname" VARCHAR(253) NOT NULL,
    "public_key_spki" BYTEA NOT NULL,
    "public_key_sha256" BYTEA NOT NULL,
    "enrollment_nonce_hash" BYTEA NOT NULL,
    "capabilities" TEXT[],
    "status" VARCHAR(24) NOT NULL DEFAULT 'active',
    "certificate_pem" TEXT NOT NULL,
    "certificate_serial" VARCHAR(160) NOT NULL,
    "certificate_fingerprint_sha256" BYTEA NOT NULL,
    "certificate_not_before" TIMESTAMPTZ(6) NOT NULL,
    "certificate_not_after" TIMESTAMPTZ(6) NOT NULL,
    "last_issued_command_sequence" BIGINT NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMPTZ(6),
    "last_heartbeat_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" VARCHAR(300),
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "site_agent_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runtime"."site_agent_commands" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "gateway_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "protocol_version" SMALLINT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "signature" VARCHAR(688) NOT NULL,
    "command_digest" CHAR(64) NOT NULL,
    "state" VARCHAR(24) NOT NULL DEFAULT 'queued',
    "lease_count" INTEGER NOT NULL DEFAULT 0,
    "leased_at" TIMESTAMPTZ(6),
    "lease_expires_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_agent_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runtime"."site_agent_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "gateway_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "protocol_version" SMALLINT NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "payload" JSONB NOT NULL,
    "event_fingerprint" CHAR(64) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_agent_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runtime"."site_agent_command_results" (
    "event_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "command_id" UUID NOT NULL,
    "command_sequence" BIGINT NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "completed_at" TIMESTAMPTZ(6) NOT NULL,
    "evidence" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_agent_command_results_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "agent_runtime"."site_agent_heartbeats" (
    "event_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "agent_version" VARCHAR(64) NOT NULL,
    "build_sha" VARCHAR(64) NOT NULL,
    "mode" VARCHAR(24) NOT NULL,
    "apply_status" VARCHAR(40) NOT NULL,
    "pending_commands" BIGINT NOT NULL,
    "pending_outbox_events" BIGINT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_agent_heartbeats_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_enrollment_tokens_identity_id_key" ON "agent_runtime"."site_agent_enrollment_tokens"("identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_enrollment_tokens_token_hash_key" ON "agent_runtime"."site_agent_enrollment_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "site_agent_enrollment_tokens_tenant_id_gateway_id_expires_a_idx" ON "agent_runtime"."site_agent_enrollment_tokens"("tenant_id", "gateway_id", "expires_at");

-- CreateIndex
CREATE INDEX "site_agent_enrollment_tokens_expires_at_consumed_at_revoked_idx" ON "agent_runtime"."site_agent_enrollment_tokens"("expires_at", "consumed_at", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_enrollment_tokens_tenant_id_id_key" ON "agent_runtime"."site_agent_enrollment_tokens"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_enrollment_tokens_tenant_id_id_site_id_gateway_i_key" ON "agent_runtime"."site_agent_enrollment_tokens"("tenant_id", "id", "site_id", "gateway_id", "identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_identities_enrollment_token_id_key" ON "agent_runtime"."site_agent_identities"("enrollment_token_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_identities_public_key_sha256_key" ON "agent_runtime"."site_agent_identities"("public_key_sha256");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_identities_enrollment_nonce_hash_key" ON "agent_runtime"."site_agent_identities"("enrollment_nonce_hash");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_identities_certificate_serial_key" ON "agent_runtime"."site_agent_identities"("certificate_serial");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_identities_certificate_fingerprint_sha256_key" ON "agent_runtime"."site_agent_identities"("certificate_fingerprint_sha256");

-- CreateIndex
CREATE INDEX "site_agent_identities_tenant_id_gateway_id_status_idx" ON "agent_runtime"."site_agent_identities"("tenant_id", "gateway_id", "status");

-- CreateIndex
CREATE INDEX "site_agent_identities_status_certificate_not_after_idx" ON "agent_runtime"."site_agent_identities"("status", "certificate_not_after");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_identities_tenant_id_id_key" ON "agent_runtime"."site_agent_identities"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_identities_tenant_id_id_site_id_gateway_id_key" ON "agent_runtime"."site_agent_identities"("tenant_id", "id", "site_id", "gateway_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_identities_tenant_id_enrollment_token_id_site_id_key" ON "agent_runtime"."site_agent_identities"("tenant_id", "enrollment_token_id", "site_id", "gateway_id", "id");

-- CreateIndex
CREATE INDEX "site_agent_commands_tenant_id_identity_id_state_sequence_idx" ON "agent_runtime"."site_agent_commands"("tenant_id", "identity_id", "state", "sequence");

-- CreateIndex
CREATE INDEX "site_agent_commands_state_lease_expires_at_sequence_idx" ON "agent_runtime"."site_agent_commands"("state", "lease_expires_at", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_commands_tenant_id_id_key" ON "agent_runtime"."site_agent_commands"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_commands_tenant_id_identity_id_sequence_key" ON "agent_runtime"."site_agent_commands"("tenant_id", "identity_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_commands_tenant_id_identity_id_id_sequence_key" ON "agent_runtime"."site_agent_commands"("tenant_id", "identity_id", "id", "sequence");

-- CreateIndex
CREATE INDEX "site_agent_events_tenant_id_identity_id_occurred_at_idx" ON "agent_runtime"."site_agent_events"("tenant_id", "identity_id", "occurred_at");

-- CreateIndex
CREATE INDEX "site_agent_events_type_received_at_idx" ON "agent_runtime"."site_agent_events"("type", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_events_tenant_id_id_key" ON "agent_runtime"."site_agent_events"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_events_tenant_id_identity_id_id_key" ON "agent_runtime"."site_agent_events"("tenant_id", "identity_id", "id");

-- CreateIndex
CREATE INDEX "site_agent_command_results_tenant_id_identity_id_completed__idx" ON "agent_runtime"."site_agent_command_results"("tenant_id", "identity_id", "completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_command_results_tenant_id_event_id_key" ON "agent_runtime"."site_agent_command_results"("tenant_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_command_results_tenant_id_command_id_key" ON "agent_runtime"."site_agent_command_results"("tenant_id", "command_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_command_results_tenant_id_identity_id_event_id_key" ON "agent_runtime"."site_agent_command_results"("tenant_id", "identity_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_command_results_tenant_id_identity_id_command_id_key" ON "agent_runtime"."site_agent_command_results"("tenant_id", "identity_id", "command_id", "command_sequence");

-- CreateIndex
CREATE INDEX "site_agent_heartbeats_tenant_id_identity_id_occurred_at_idx" ON "agent_runtime"."site_agent_heartbeats"("tenant_id", "identity_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_heartbeats_tenant_id_event_id_key" ON "agent_runtime"."site_agent_heartbeats"("tenant_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_agent_heartbeats_tenant_id_identity_id_event_id_key" ON "agent_runtime"."site_agent_heartbeats"("tenant_id", "identity_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "gateways_tenant_id_id_site_id_key" ON "app"."gateways"("tenant_id", "id", "site_id");

-- AddForeignKey
ALTER TABLE "agent_runtime"."site_agent_enrollment_tokens" ADD CONSTRAINT "site_agent_enrollment_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runtime"."site_agent_enrollment_tokens" ADD CONSTRAINT "site_agent_enrollment_tokens_tenant_id_site_id_fkey" FOREIGN KEY ("tenant_id", "site_id") REFERENCES "app"."sites"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runtime"."site_agent_enrollment_tokens" ADD CONSTRAINT "site_agent_enrollment_tokens_tenant_id_gateway_id_site_id_fkey" FOREIGN KEY ("tenant_id", "gateway_id", "site_id") REFERENCES "app"."gateways"("tenant_id", "id", "site_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runtime"."site_agent_identities" ADD CONSTRAINT "site_agent_identities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runtime"."site_agent_identities" ADD CONSTRAINT "site_agent_identities_tenant_id_gateway_id_site_id_fkey" FOREIGN KEY ("tenant_id", "gateway_id", "site_id") REFERENCES "app"."gateways"("tenant_id", "id", "site_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runtime"."site_agent_identities" ADD CONSTRAINT "site_agent_identities_tenant_id_enrollment_token_id_site_i_fkey" FOREIGN KEY ("tenant_id", "enrollment_token_id", "site_id", "gateway_id", "id") REFERENCES "agent_runtime"."site_agent_enrollment_tokens"("tenant_id", "id", "site_id", "gateway_id", "identity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runtime"."site_agent_commands" ADD CONSTRAINT "site_agent_commands_tenant_id_identity_id_site_id_gateway__fkey" FOREIGN KEY ("tenant_id", "identity_id", "site_id", "gateway_id") REFERENCES "agent_runtime"."site_agent_identities"("tenant_id", "id", "site_id", "gateway_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runtime"."site_agent_events" ADD CONSTRAINT "site_agent_events_tenant_id_identity_id_site_id_gateway_id_fkey" FOREIGN KEY ("tenant_id", "identity_id", "site_id", "gateway_id") REFERENCES "agent_runtime"."site_agent_identities"("tenant_id", "id", "site_id", "gateway_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runtime"."site_agent_command_results" ADD CONSTRAINT "site_agent_command_results_tenant_id_identity_id_event_id_fkey" FOREIGN KEY ("tenant_id", "identity_id", "event_id") REFERENCES "agent_runtime"."site_agent_events"("tenant_id", "identity_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runtime"."site_agent_command_results" ADD CONSTRAINT "site_agent_command_results_tenant_id_identity_id_command_i_fkey" FOREIGN KEY ("tenant_id", "identity_id", "command_id", "command_sequence") REFERENCES "agent_runtime"."site_agent_commands"("tenant_id", "identity_id", "id", "sequence") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runtime"."site_agent_heartbeats" ADD CONSTRAINT "site_agent_heartbeats_tenant_id_identity_id_event_id_fkey" FOREIGN KEY ("tenant_id", "identity_id", "event_id") REFERENCES "agent_runtime"."site_agent_events"("tenant_id", "identity_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row level security for agent_runtime.
-- The pr03_core loop only covered app, audit and radius_runtime, so every table
-- created above would otherwise be readable across tenants. The predicate and the
-- policy name are identical to pr03_core so the isolation contract stays uniform.
DO $rls$
DECLARE
    target record;
BEGIN
    FOR target IN
        SELECT DISTINCT table_schema, table_name
        FROM information_schema.columns
        WHERE column_name = 'tenant_id'
          AND table_schema = 'agent_runtime'
    LOOP
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', target.table_schema, target.table_name);
        EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', target.table_schema, target.table_name);
        IF NOT EXISTS (
            SELECT 1
            FROM pg_policies
            WHERE schemaname = target.table_schema
              AND tablename = target.table_name
              AND policyname = 'tenant_isolation'
        ) THEN
            EXECUTE format(
                'CREATE POLICY tenant_isolation ON %I.%I USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id())',
                target.table_schema,
                target.table_name
            );
        END IF;
    END LOOP;
END
$rls$;

-- Privileges. wifi_radius_runtime is deliberately excluded: the RADIUS role has no
-- reason to read agent identities, signed commands or enrollment tokens.
REVOKE ALL ON ALL TABLES IN SCHEMA agent_runtime FROM PUBLIC;

GRANT USAGE ON SCHEMA agent_runtime TO wifi_app_runtime, wifi_worker, wifi_backup, wifi_monitoring;
GRANT USAGE, CREATE ON SCHEMA agent_runtime TO wifi_migrator;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA agent_runtime TO wifi_app_runtime, wifi_worker;
GRANT SELECT ON ALL TABLES IN SCHEMA agent_runtime TO wifi_backup;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA agent_runtime TO wifi_migrator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA agent_runtime TO wifi_migrator;

ALTER DEFAULT PRIVILEGES IN SCHEMA agent_runtime REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA agent_runtime REVOKE ALL ON FUNCTIONS FROM PUBLIC;
