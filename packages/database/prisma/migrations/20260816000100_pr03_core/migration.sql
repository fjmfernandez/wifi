-- WiFi ENTELSAT PR03 core schema.
-- PostgreSQL 18 is mandatory: UUIDv7 defaults intentionally use uuidv7().
-- This bootstrap section requires a controlled migration identity with CREATEROLE
-- and CREATE EXTENSION. It creates NOLOGIN group roles only; credentials are an
-- operations responsibility and never belong in migrations.

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wifi_app_runtime') THEN
        CREATE ROLE wifi_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wifi_worker') THEN
        CREATE ROLE wifi_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wifi_radius_runtime') THEN
        CREATE ROLE wifi_radius_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wifi_audit_writer') THEN
        CREATE ROLE wifi_audit_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wifi_export_worker') THEN
        CREATE ROLE wifi_export_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wifi_migrator') THEN
        CREATE ROLE wifi_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS NOREPLICATION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wifi_backup') THEN
        CREATE ROLE wifi_backup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS NOREPLICATION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wifi_monitoring') THEN
        CREATE ROLE wifi_monitoring NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
    END IF;
END
$roles$;

-- Reassert attributes if a role already existed. Only the non-interactive
-- migrator and backup identities may bypass RLS.
ALTER ROLE wifi_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
ALTER ROLE wifi_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
ALTER ROLE wifi_radius_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
ALTER ROLE wifi_audit_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
ALTER ROLE wifi_export_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
ALTER ROLE wifi_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS NOREPLICATION;
ALTER ROLE wifi_backup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS NOREPLICATION;
ALTER ROLE wifi_monitoring NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "audit";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "radius_runtime";

-- CreateTable
CREATE TABLE "app"."tenants" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'active',
    "data_region" VARCHAR(32) NOT NULL,
    "default_timezone" VARCHAR(64) NOT NULL DEFAULT 'Europe/Madrid',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."admin_users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "email_ciphertext" BYTEA NOT NULL,
    "email_key_version" VARCHAR(80) NOT NULL,
    "email_hmac" BYTEA NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."admin_credentials" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "hash_algorithm" VARCHAR(32) NOT NULL DEFAULT 'scrypt',
    "hash_version" INTEGER NOT NULL DEFAULT 1,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "password_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "password_expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "admin_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."admin_sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "auth_strength" VARCHAR(32) NOT NULL DEFAULT 'password',
    "mfa_verified_at" TIMESTAMPTZ(6),
    "ip_ciphertext" BYTEA,
    "ip_hmac" BYTEA,
    "user_agent_ciphertext" BYTEA,
    "user_agent_hmac" BYTEA,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idle_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" VARCHAR(160),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."admin_totp_factors" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "secret_ciphertext" BYTEA NOT NULL,
    "key_version" VARCHAR(80) NOT NULL,
    "recovery_code_hashes" BYTEA[] DEFAULT ARRAY[]::BYTEA[],
    "verified_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_totp_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."admin_webauthn_credentials" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "credential_id" BYTEA NOT NULL,
    "public_key_cose" BYTEA NOT NULL,
    "sign_count" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aaguid" UUID,
    "backup_eligible" BOOLEAN NOT NULL DEFAULT false,
    "backup_state" BOOLEAN NOT NULL DEFAULT false,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_webauthn_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."tenant_memberships" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."permission_catalog" (
    "code" VARCHAR(120) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_catalog_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "app"."tenant_roles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "system_role" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."role_permissions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_code" VARCHAR(120) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."role_assignments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID,
    "site_group_id" UUID,
    "site_id" UUID,
    "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."organizations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "legal_name" VARCHAR(200),
    "status" VARCHAR(24) NOT NULL DEFAULT 'active',
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."site_groups" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID,
    "name" VARCHAR(160) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "site_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."sites" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "config_parent_group_id" UUID,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'active',
    "timezone" VARCHAR(64) NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "languages" TEXT[] DEFAULT ARRAY['es']::TEXT[],
    "branding" JSONB NOT NULL DEFAULT '{}',
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."site_group_sites" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "site_group_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_group_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."zones" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."ssids" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "instructions" JSONB NOT NULL DEFAULT '{}',
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ssids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."gateways" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "model" VARCHAR(100),
    "serial" VARCHAR(100),
    "routeros_version" VARCHAR(40),
    "architecture" VARCHAR(40),
    "nas_identifier" VARCHAR(128) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'pending',
    "last_seen_at" TIMESTAMPTZ(6),
    "retired_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gateways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."gateway_captive_locators" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "gateway_id" UUID NOT NULL,
    "locator_hash" BYTEA NOT NULL,
    "allowed_login_origins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "replaces_locator_id" UUID,
    "not_before" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_captive_locators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."gateway_zone_bindings" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "gateway_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "bridge_name" VARCHAR(64),
    "vlan_id" INTEGER,
    "subnet_cidr" INET,
    "pool_range" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_zone_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."gateway_secret_versions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "gateway_id" UUID NOT NULL,
    "purpose" VARCHAR(40) NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "key_version" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retired_at" TIMESTAMPTZ(6),

    CONSTRAINT "gateway_secret_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."gateway_config_revisions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "gateway_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "mode" VARCHAR(32) NOT NULL,
    "desired_state" JSONB NOT NULL,
    "snapshot_hash" CHAR(64) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_config_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."gateway_deployments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "state" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "idempotency_key" VARCHAR(120) NOT NULL,
    "preflight" JSONB,
    "diff" JSONB,
    "evidence_hash" CHAR(64),
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."access_policies" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'active',
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "access_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."access_policy_versions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
    "valid_from" TIMESTAMPTZ(6),
    "valid_until" TIMESTAMPTZ(6),
    "total_duration_seconds" INTEGER,
    "session_timeout_seconds" INTEGER,
    "idle_timeout_seconds" INTEGER,
    "download_kbps" INTEGER,
    "upload_kbps" INTEGER,
    "quota_bytes" BIGINT,
    "max_concurrent_devices" INTEGER NOT NULL DEFAULT 1,
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."policy_assignments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID,
    "site_group_id" UUID,
    "site_id" UUID,
    "zone_id" UUID,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "policy_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."login_methods" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "available_from" TIMESTAMPTZ(6),
    "available_until" TIMESTAMPTZ(6),
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "login_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."portals" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "kind" VARCHAR(32) NOT NULL DEFAULT 'wifi',
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "portals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."portal_versions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "portal_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
    "fallback_locale" VARCHAR(12) NOT NULL DEFAULT 'es',
    "theme" JSONB NOT NULL DEFAULT '{}',
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."portal_blocks" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "portal_version_id" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "props" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."portal_publications" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "portal_version_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "zone_id" UUID,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "snapshot_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."processing_purposes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "lawful_basis" VARCHAR(40) NOT NULL,
    "retention_class" VARCHAR(80) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processing_purposes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."legal_documents" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."legal_versions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "locale" VARCHAR(12) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
    "content" TEXT NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."identity_spaces" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "controller_ref" VARCHAR(160) NOT NULL,
    "key_version" VARCHAR(80) NOT NULL,
    "merge_policy" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."end_users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "identity_space_id" UUID NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'active',
    "retention_anchor" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anonymized_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "end_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."end_user_identifiers" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "identity_space_id" UUID NOT NULL,
    "end_user_id" UUID NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "value_hmac" BYTEA NOT NULL,
    "key_version" VARCHAR(80) NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "end_user_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."client_devices" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "identity_space_id" UUID NOT NULL,
    "mac_ciphertext" BYTEA NOT NULL,
    "mac_hmac" BYTEA NOT NULL,
    "key_version" VARCHAR(80) NOT NULL,
    "private_mac" BOOLEAN NOT NULL DEFAULT false,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "client_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."end_user_device_links" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "end_user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "end_user_device_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."captive_attempts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "gateway_id" UUID NOT NULL,
    "device_id" UUID,
    "state_hash" BYTEA NOT NULL,
    "nonce_hash" BYTEA NOT NULL,
    "claimed_mac_hmac" BYTEA,
    "claimed_ip_hmac" BYTEA,
    "return_intent" JSONB NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "captive_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."access_authorizations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "gateway_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "end_user_id" UUID,
    "device_id" UUID,
    "method" VARCHAR(32) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'issued',
    "effective_attributes" JSONB NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "evidence_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."legal_acceptances" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "end_user_id" UUID,
    "authorization_id" UUID NOT NULL,
    "legal_version_id" UUID NOT NULL,
    "locale" VARCHAR(12) NOT NULL,
    "evidence" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."consent_events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "end_user_id" UUID NOT NULL,
    "purpose_id" UUID NOT NULL,
    "legal_version_id" UUID,
    "decision" VARCHAR(24) NOT NULL,
    "evidence" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."data_subject_requests" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "identity_space_id" UUID NOT NULL,
    "end_user_id" UUID,
    "kind" VARCHAR(24) NOT NULL,
    "state" VARCHAR(24) NOT NULL DEFAULT 'received',
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "approved_by" UUID,
    "executed_at" TIMESTAMPTZ(6),
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."voucher_batches" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "default_max_uses" INTEGER NOT NULL DEFAULT 1,
    "default_max_devices" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voucher_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."vouchers" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "code_hmac" BYTEA NOT NULL,
    "display_hint" VARCHAR(16),
    "state" VARCHAR(24) NOT NULL DEFAULT 'available',
    "max_uses" INTEGER NOT NULL DEFAULT 1,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "max_devices" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."voucher_redemptions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "authorization_id" UUID,
    "outcome" VARCHAR(24) NOT NULL,
    "redeemed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voucher_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."authorized_devices" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authorized_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."blocked_entities" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "scope_id" UUID,
    "subject_type" VARCHAR(24) NOT NULL,
    "subject_hmac" BYTEA NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radius_runtime"."credentials" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "runtime_id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "authorization_id" UUID NOT NULL,
    "gateway_id" UUID NOT NULL,
    "username" VARCHAR(253) NOT NULL,
    "nas_identifier" VARCHAR(253) NOT NULL,
    "calling_station_id" VARCHAR(12),
    "verifier_attribute" VARCHAR(32) NOT NULL,
    "verifier_value" TEXT NOT NULL,
    "not_before" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "max_uses" INTEGER NOT NULL DEFAULT 1,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radius_runtime"."reply_attributes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "runtime_id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "attribute" VARCHAR(128) NOT NULL,
    "op" VARCHAR(4) NOT NULL DEFAULT ':=',
    "value" TEXT NOT NULL,
    "priority" SMALLINT NOT NULL DEFAULT 100,

    CONSTRAINT "reply_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radius_runtime"."nas_registry" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "gateway_id" UUID NOT NULL,
    "nas_identifier" VARCHAR(128) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nas_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."radius_sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "gateway_id" UUID NOT NULL,
    "authorization_id" UUID,
    "acct_session_id" VARCHAR(128) NOT NULL,
    "class_value" VARCHAR(253),
    "state" VARCHAR(24) NOT NULL DEFAULT 'active',
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "last_interim_at" TIMESTAMPTZ(6),
    "stopped_at" TIMESTAMPTZ(6),
    "input_octets" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "output_octets" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "terminate_cause" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "radius_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radius_runtime"."accounting_inbox" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "gateway_id" UUID NOT NULL,
    "authorization_id" UUID,
    "session_id" UUID,
    "username" VARCHAR(253) NOT NULL,
    "nas_identifier" VARCHAR(253) NOT NULL,
    "packet_source_ip" INET NOT NULL,
    "nas_ip_address" INET,
    "acct_session_id" VARCHAR(253) NOT NULL,
    "status_type" VARCHAR(24) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nas_event_at" TIMESTAMPTZ(6),
    "session_time_seconds" BIGINT,
    "nas_input_octets" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "nas_output_octets" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "acct_delay_seconds" INTEGER NOT NULL DEFAULT 0,
    "calling_station_id" VARCHAR(253),
    "framed_ip_address" INET,
    "class_value" VARCHAR(253),
    "terminate_cause" VARCHAR(80),
    "redacted_payload" JSONB NOT NULL DEFAULT '{}',
    "event_fingerprint" CHAR(64) NOT NULL,
    "claim_token" UUID,
    "claimed_by" UUID,
    "claimed_at" TIMESTAMPTZ(6),
    "lease_expires_at" TIMESTAMPTZ(6),
    "processing_attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "processing_error" TEXT,

    CONSTRAINT "accounting_inbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radius_runtime"."post_auth_inbox" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "gateway_id" UUID NOT NULL,
    "authorization_id" UUID,
    "username" VARCHAR(253) NOT NULL,
    "nas_identifier" VARCHAR(253) NOT NULL,
    "packet_source_ip" INET NOT NULL,
    "calling_station_id" VARCHAR(253),
    "reply_packet_type" VARCHAR(32) NOT NULL,
    "class_value" VARCHAR(253),
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_auth_inbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."idempotency_keys" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "actor_id" UUID,
    "operation" VARCHAR(100) NOT NULL,
    "key" VARCHAR(160) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "response_code" INTEGER,
    "response_body" JSONB,
    "state" VARCHAR(24) NOT NULL DEFAULT 'started',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."outbox_events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "aggregate_type" VARCHAR(80) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(120) NOT NULL,
    "event_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "claim_token" UUID,
    "claimed_by" UUID,
    "claimed_at" TIMESTAMPTZ(6),
    "lease_expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."exports" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "dsr_id" UUID,
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "reason" VARCHAR(300) NOT NULL,
    "scope" JSONB NOT NULL,
    "contains_pii" BOOLEAN NOT NULL DEFAULT false,
    "object_key" VARCHAR(600),
    "object_hash" CHAR(64),
    "state" VARCHAR(24) NOT NULL DEFAULT 'requested',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "downloaded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit"."audit_logs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "actor_type" VARCHAR(24) NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "resource_type" VARCHAR(80) NOT NULL,
    "resource_id" UUID,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "before_redacted" JSONB,
    "after_redacted" JSONB,
    "source_ip_hmac" BYTEA,
    "correlation_id" UUID NOT NULL,
    "reason" VARCHAR(300),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previous_hash" CHAR(64),
    "row_hash" CHAR(64) NOT NULL DEFAULT repeat('0'::text, 64),

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "app"."tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_hmac_key" ON "app"."admin_users"("email_hmac");

-- CreateIndex
CREATE UNIQUE INDEX "admin_credentials_user_id_key" ON "app"."admin_credentials"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "app"."admin_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "admin_sessions_user_id_revoked_at_expires_at_idx" ON "app"."admin_sessions"("user_id", "revoked_at", "expires_at");

-- CreateIndex
CREATE INDEX "admin_totp_factors_user_id_revoked_at_idx" ON "app"."admin_totp_factors"("user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_totp_factors_user_id_label_key" ON "app"."admin_totp_factors"("user_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "admin_webauthn_credentials_credential_id_key" ON "app"."admin_webauthn_credentials"("credential_id");

-- CreateIndex
CREATE INDEX "admin_webauthn_credentials_user_id_revoked_at_idx" ON "app"."admin_webauthn_credentials"("user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_webauthn_credentials_user_id_label_key" ON "app"."admin_webauthn_credentials"("user_id", "label");

-- CreateIndex
CREATE INDEX "tenant_memberships_user_id_status_idx" ON "app"."tenant_memberships"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_memberships_tenant_id_id_key" ON "app"."tenant_memberships"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_memberships_tenant_id_user_id_key" ON "app"."tenant_memberships"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_roles_tenant_id_id_key" ON "app"."tenant_roles"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_roles_tenant_id_code_key" ON "app"."tenant_roles"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_tenant_id_id_key" ON "app"."role_permissions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_tenant_id_role_id_permission_code_key" ON "app"."role_permissions"("tenant_id", "role_id", "permission_code");

-- CreateIndex
CREATE INDEX "role_assignments_tenant_id_membership_id_expires_at_idx" ON "app"."role_assignments"("tenant_id", "membership_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "role_assignments_tenant_id_id_key" ON "app"."role_assignments"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "organizations_tenant_id_status_idx" ON "app"."organizations"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_tenant_id_id_key" ON "app"."organizations"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "site_groups_tenant_id_organization_id_idx" ON "app"."site_groups"("tenant_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_groups_tenant_id_id_key" ON "app"."site_groups"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "sites_tenant_id_organization_id_status_idx" ON "app"."sites"("tenant_id", "organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sites_tenant_id_id_key" ON "app"."sites"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "site_group_sites_tenant_id_id_key" ON "app"."site_group_sites"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "site_group_sites_tenant_id_site_group_id_site_id_key" ON "app"."site_group_sites"("tenant_id", "site_group_id", "site_id");

-- CreateIndex
CREATE INDEX "zones_tenant_id_site_id_idx" ON "app"."zones"("tenant_id", "site_id");

-- CreateIndex
CREATE UNIQUE INDEX "zones_tenant_id_id_key" ON "app"."zones"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ssids_tenant_id_zone_id_idx" ON "app"."ssids"("tenant_id", "zone_id");

-- CreateIndex
CREATE UNIQUE INDEX "ssids_tenant_id_id_key" ON "app"."ssids"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "gateways_nas_identifier_key" ON "app"."gateways"("nas_identifier");

-- CreateIndex
CREATE INDEX "gateways_tenant_id_site_id_status_last_seen_at_idx" ON "app"."gateways"("tenant_id", "site_id", "status", "last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "gateways_tenant_id_id_key" ON "app"."gateways"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_captive_locators_locator_hash_key" ON "app"."gateway_captive_locators"("locator_hash");

-- CreateIndex
CREATE INDEX "gateway_captive_locators_tenant_id_gateway_id_expires_at_idx" ON "app"."gateway_captive_locators"("tenant_id", "gateway_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_captive_locators_tenant_id_id_key" ON "app"."gateway_captive_locators"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_zone_bindings_tenant_id_id_key" ON "app"."gateway_zone_bindings"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_zone_bindings_tenant_id_gateway_id_zone_id_key" ON "app"."gateway_zone_bindings"("tenant_id", "gateway_id", "zone_id");

-- CreateIndex
CREATE INDEX "gateway_secret_versions_tenant_id_gateway_id_purpose_retire_idx" ON "app"."gateway_secret_versions"("tenant_id", "gateway_id", "purpose", "retired_at");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_secret_versions_tenant_id_id_key" ON "app"."gateway_secret_versions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_config_revisions_tenant_id_id_key" ON "app"."gateway_config_revisions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_config_revisions_tenant_id_gateway_id_version_key" ON "app"."gateway_config_revisions"("tenant_id", "gateway_id", "version");

-- CreateIndex
CREATE INDEX "gateway_deployments_tenant_id_state_created_at_idx" ON "app"."gateway_deployments"("tenant_id", "state", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_deployments_tenant_id_id_key" ON "app"."gateway_deployments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_deployments_tenant_id_idempotency_key_key" ON "app"."gateway_deployments"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "access_policies_tenant_id_status_idx" ON "app"."access_policies"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "access_policies_tenant_id_id_key" ON "app"."access_policies"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "access_policy_versions_tenant_id_policy_id_status_idx" ON "app"."access_policy_versions"("tenant_id", "policy_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "access_policy_versions_tenant_id_id_key" ON "app"."access_policy_versions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "access_policy_versions_tenant_id_policy_id_version_key" ON "app"."access_policy_versions"("tenant_id", "policy_id", "version");

-- CreateIndex
CREATE INDEX "policy_assignments_tenant_id_scope_type_priority_idx" ON "app"."policy_assignments"("tenant_id", "scope_type", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "policy_assignments_tenant_id_id_key" ON "app"."policy_assignments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "login_methods_tenant_id_id_key" ON "app"."login_methods"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "login_methods_tenant_id_site_id_kind_key" ON "app"."login_methods"("tenant_id", "site_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "portals_tenant_id_id_key" ON "app"."portals"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "portal_versions_tenant_id_id_key" ON "app"."portal_versions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "portal_versions_tenant_id_portal_id_version_key" ON "app"."portal_versions"("tenant_id", "portal_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "portal_blocks_tenant_id_id_key" ON "app"."portal_blocks"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "portal_blocks_tenant_id_portal_version_id_display_order_key" ON "app"."portal_blocks"("tenant_id", "portal_version_id", "display_order");

-- CreateIndex
CREATE INDEX "portal_publications_tenant_id_site_id_zone_id_starts_at_idx" ON "app"."portal_publications"("tenant_id", "site_id", "zone_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "portal_publications_tenant_id_id_key" ON "app"."portal_publications"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "processing_purposes_tenant_id_id_key" ON "app"."processing_purposes"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "processing_purposes_tenant_id_code_key" ON "app"."processing_purposes"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_tenant_id_id_key" ON "app"."legal_documents"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "legal_versions_tenant_id_id_key" ON "app"."legal_versions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "legal_versions_tenant_id_document_id_version_locale_key" ON "app"."legal_versions"("tenant_id", "document_id", "version", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "identity_spaces_tenant_id_id_key" ON "app"."identity_spaces"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "end_users_tenant_id_identity_space_id_status_idx" ON "app"."end_users"("tenant_id", "identity_space_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "end_users_tenant_id_id_key" ON "app"."end_users"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "end_user_identifiers_tenant_id_end_user_id_idx" ON "app"."end_user_identifiers"("tenant_id", "end_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "end_user_identifiers_tenant_id_id_key" ON "app"."end_user_identifiers"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "end_user_identifiers_tenant_id_identity_space_id_kind_value_key" ON "app"."end_user_identifiers"("tenant_id", "identity_space_id", "kind", "value_hmac");

-- CreateIndex
CREATE INDEX "client_devices_tenant_id_last_seen_at_idx" ON "app"."client_devices"("tenant_id", "last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "client_devices_tenant_id_id_key" ON "app"."client_devices"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "client_devices_tenant_id_identity_space_id_mac_hmac_key" ON "app"."client_devices"("tenant_id", "identity_space_id", "mac_hmac");

-- CreateIndex
CREATE INDEX "end_user_device_links_tenant_id_end_user_id_ends_at_idx" ON "app"."end_user_device_links"("tenant_id", "end_user_id", "ends_at");

-- CreateIndex
CREATE INDEX "end_user_device_links_tenant_id_device_id_ends_at_idx" ON "app"."end_user_device_links"("tenant_id", "device_id", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "end_user_device_links_tenant_id_id_key" ON "app"."end_user_device_links"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "captive_attempts_state_hash_key" ON "app"."captive_attempts"("state_hash");

-- CreateIndex
CREATE UNIQUE INDEX "captive_attempts_nonce_hash_key" ON "app"."captive_attempts"("nonce_hash");

-- CreateIndex
CREATE INDEX "captive_attempts_tenant_id_gateway_id_status_expires_at_idx" ON "app"."captive_attempts"("tenant_id", "gateway_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "captive_attempts_tenant_id_id_key" ON "app"."captive_attempts"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "access_authorizations_tenant_id_gateway_id_status_expires_a_idx" ON "app"."access_authorizations"("tenant_id", "gateway_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "access_authorizations_tenant_id_id_key" ON "app"."access_authorizations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "access_authorizations_tenant_id_attempt_id_key" ON "app"."access_authorizations"("tenant_id", "attempt_id");

-- CreateIndex
CREATE INDEX "legal_acceptances_tenant_id_authorization_id_occurred_at_idx" ON "app"."legal_acceptances"("tenant_id", "authorization_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "legal_acceptances_tenant_id_id_key" ON "app"."legal_acceptances"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "consent_events_tenant_id_end_user_id_purpose_id_occurred_at_idx" ON "app"."consent_events"("tenant_id", "end_user_id", "purpose_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "consent_events_tenant_id_id_key" ON "app"."consent_events"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "data_subject_requests_tenant_id_state_due_at_idx" ON "app"."data_subject_requests"("tenant_id", "state", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "data_subject_requests_tenant_id_id_key" ON "app"."data_subject_requests"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "voucher_batches_tenant_id_site_id_expires_at_idx" ON "app"."voucher_batches"("tenant_id", "site_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_batches_tenant_id_id_key" ON "app"."voucher_batches"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "vouchers_tenant_id_batch_id_state_expires_at_idx" ON "app"."vouchers"("tenant_id", "batch_id", "state", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_tenant_id_id_key" ON "app"."vouchers"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_tenant_id_code_hmac_key" ON "app"."vouchers"("tenant_id", "code_hmac");

-- CreateIndex
CREATE INDEX "voucher_redemptions_tenant_id_voucher_id_redeemed_at_idx" ON "app"."voucher_redemptions"("tenant_id", "voucher_id", "redeemed_at");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_redemptions_tenant_id_id_key" ON "app"."voucher_redemptions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_redemptions_tenant_id_authorization_id_key" ON "app"."voucher_redemptions"("tenant_id", "authorization_id");

-- CreateIndex
CREATE INDEX "authorized_devices_tenant_id_site_id_device_id_expires_at_idx" ON "app"."authorized_devices"("tenant_id", "site_id", "device_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "authorized_devices_tenant_id_id_key" ON "app"."authorized_devices"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "blocked_entities_tenant_id_scope_type_scope_id_subject_type_idx" ON "app"."blocked_entities"("tenant_id", "scope_type", "scope_id", "subject_type", "subject_hmac");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_entities_tenant_id_id_key" ON "app"."blocked_entities"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "credentials_runtime_id_key" ON "radius_runtime"."credentials"("runtime_id");

-- CreateIndex
CREATE UNIQUE INDEX "credentials_username_key" ON "radius_runtime"."credentials"("username");

-- CreateIndex
CREATE INDEX "credentials_username_nas_identifier_enabled_expires_at_idx" ON "radius_runtime"."credentials"("username", "nas_identifier", "enabled", "expires_at");

-- CreateIndex
CREATE INDEX "credentials_tenant_id_gateway_id_expires_at_idx" ON "radius_runtime"."credentials"("tenant_id", "gateway_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "credentials_tenant_id_id_key" ON "radius_runtime"."credentials"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "credentials_tenant_id_authorization_id_key" ON "radius_runtime"."credentials"("tenant_id", "authorization_id");

-- CreateIndex
CREATE UNIQUE INDEX "reply_attributes_runtime_id_key" ON "radius_runtime"."reply_attributes"("runtime_id");

-- CreateIndex
CREATE UNIQUE INDEX "reply_attributes_tenant_id_id_key" ON "radius_runtime"."reply_attributes"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "reply_attributes_tenant_id_credential_id_attribute_key" ON "radius_runtime"."reply_attributes"("tenant_id", "credential_id", "attribute");

-- CreateIndex
CREATE UNIQUE INDEX "nas_registry_nas_identifier_key" ON "radius_runtime"."nas_registry"("nas_identifier");

-- CreateIndex
CREATE UNIQUE INDEX "nas_registry_tenant_id_id_key" ON "radius_runtime"."nas_registry"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "nas_registry_tenant_id_gateway_id_key" ON "radius_runtime"."nas_registry"("tenant_id", "gateway_id");

-- CreateIndex
CREATE INDEX "radius_sessions_tenant_id_gateway_id_acct_session_id_starte_idx" ON "app"."radius_sessions"("tenant_id", "gateway_id", "acct_session_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "radius_sessions_tenant_id_id_key" ON "app"."radius_sessions"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "accounting_inbox_tenant_id_session_id_received_at_idx" ON "radius_runtime"."accounting_inbox"("tenant_id", "session_id", "received_at");

-- CreateIndex
CREATE INDEX "accounting_inbox_tenant_id_gateway_id_acct_session_id_recei_idx" ON "radius_runtime"."accounting_inbox"("tenant_id", "gateway_id", "acct_session_id", "received_at");

-- CreateIndex
CREATE INDEX "accounting_inbox_tenant_id_processed_at_received_at_idx" ON "radius_runtime"."accounting_inbox"("tenant_id", "processed_at", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_inbox_tenant_id_id_key" ON "radius_runtime"."accounting_inbox"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_inbox_tenant_id_event_fingerprint_key" ON "radius_runtime"."accounting_inbox"("tenant_id", "event_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_inbox_claim_token_key" ON "radius_runtime"."accounting_inbox"("claim_token");

-- CreateIndex
CREATE INDEX "accounting_inbox_processed_at_lease_expires_at_available_at_idx" ON "radius_runtime"."accounting_inbox"("processed_at", "lease_expires_at", "available_at", "received_at");

-- CreateIndex
CREATE INDEX "post_auth_inbox_tenant_id_received_at_id_idx" ON "radius_runtime"."post_auth_inbox"("tenant_id", "received_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "post_auth_inbox_tenant_id_id_key" ON "radius_runtime"."post_auth_inbox"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "idempotency_keys_tenant_id_expires_at_idx" ON "app"."idempotency_keys"("tenant_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_tenant_id_id_key" ON "app"."idempotency_keys"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_tenant_id_operation_key_key" ON "app"."idempotency_keys"("tenant_id", "operation", "key");

-- CreateIndex
CREATE INDEX "outbox_events_published_at_available_at_idx" ON "app"."outbox_events"("published_at", "available_at");

-- CreateIndex
CREATE INDEX "outbox_events_tenant_id_aggregate_type_aggregate_id_occurre_idx" ON "app"."outbox_events"("tenant_id", "aggregate_type", "aggregate_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_claim_token_key" ON "app"."outbox_events"("claim_token");

-- CreateIndex
CREATE INDEX "outbox_events_published_at_lease_expires_at_available_at_idx" ON "app"."outbox_events"("published_at", "lease_expires_at", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_tenant_id_id_key" ON "app"."outbox_events"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "exports_tenant_id_state_expires_at_idx" ON "app"."exports"("tenant_id", "state", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "exports_tenant_id_id_key" ON "app"."exports"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_occurred_at_idx" ON "audit"."audit_logs"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_actor_id_occurred_at_idx" ON "audit"."audit_logs"("tenant_id", "actor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_resource_type_resource_id_occurred_at_idx" ON "audit"."audit_logs"("tenant_id", "resource_type", "resource_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_tenant_id_id_key" ON "audit"."audit_logs"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "app"."admin_credentials" ADD CONSTRAINT "admin_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."admin_sessions" ADD CONSTRAINT "admin_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."admin_totp_factors" ADD CONSTRAINT "admin_totp_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."admin_webauthn_credentials" ADD CONSTRAINT "admin_webauthn_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tenant_roles" ADD CONSTRAINT "tenant_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."role_permissions" ADD CONSTRAINT "role_permissions_tenant_id_role_id_fkey" FOREIGN KEY ("tenant_id", "role_id") REFERENCES "app"."tenant_roles"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."role_permissions" ADD CONSTRAINT "role_permissions_permission_code_fkey" FOREIGN KEY ("permission_code") REFERENCES "app"."permission_catalog"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."role_assignments" ADD CONSTRAINT "role_assignments_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "app"."tenant_memberships"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."role_assignments" ADD CONSTRAINT "role_assignments_tenant_id_role_id_fkey" FOREIGN KEY ("tenant_id", "role_id") REFERENCES "app"."tenant_roles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."role_assignments" ADD CONSTRAINT "role_assignments_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "app"."organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."role_assignments" ADD CONSTRAINT "role_assignments_tenant_id_site_group_id_fkey" FOREIGN KEY ("tenant_id", "site_group_id") REFERENCES "app"."site_groups"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."role_assignments" ADD CONSTRAINT "role_assignments_tenant_id_site_id_fkey" FOREIGN KEY ("tenant_id", "site_id") REFERENCES "app"."sites"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."organizations" ADD CONSTRAINT "organizations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."site_groups" ADD CONSTRAINT "site_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."site_groups" ADD CONSTRAINT "site_groups_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "app"."organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."sites" ADD CONSTRAINT "sites_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "app"."organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."sites" ADD CONSTRAINT "sites_tenant_id_config_parent_group_id_fkey" FOREIGN KEY ("tenant_id", "config_parent_group_id") REFERENCES "app"."site_groups"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."site_group_sites" ADD CONSTRAINT "site_group_sites_tenant_id_site_group_id_fkey" FOREIGN KEY ("tenant_id", "site_group_id") REFERENCES "app"."site_groups"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."site_group_sites" ADD CONSTRAINT "site_group_sites_tenant_id_site_id_fkey" FOREIGN KEY ("tenant_id", "site_id") REFERENCES "app"."sites"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."zones" ADD CONSTRAINT "zones_tenant_id_site_id_fkey" FOREIGN KEY ("tenant_id", "site_id") REFERENCES "app"."sites"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ssids" ADD CONSTRAINT "ssids_tenant_id_zone_id_fkey" FOREIGN KEY ("tenant_id", "zone_id") REFERENCES "app"."zones"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."gateways" ADD CONSTRAINT "gateways_tenant_id_site_id_fkey" FOREIGN KEY ("tenant_id", "site_id") REFERENCES "app"."sites"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."gateway_captive_locators" ADD CONSTRAINT "gateway_captive_locators_tenant_id_gateway_id_fkey" FOREIGN KEY ("tenant_id", "gateway_id") REFERENCES "app"."gateways"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."gateway_captive_locators" ADD CONSTRAINT "gateway_captive_locators_tenant_id_replaces_locator_id_fkey" FOREIGN KEY ("tenant_id", "replaces_locator_id") REFERENCES "app"."gateway_captive_locators"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."gateway_zone_bindings" ADD CONSTRAINT "gateway_zone_bindings_tenant_id_gateway_id_fkey" FOREIGN KEY ("tenant_id", "gateway_id") REFERENCES "app"."gateways"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."gateway_zone_bindings" ADD CONSTRAINT "gateway_zone_bindings_tenant_id_zone_id_fkey" FOREIGN KEY ("tenant_id", "zone_id") REFERENCES "app"."zones"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."gateway_secret_versions" ADD CONSTRAINT "gateway_secret_versions_tenant_id_gateway_id_fkey" FOREIGN KEY ("tenant_id", "gateway_id") REFERENCES "app"."gateways"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."gateway_config_revisions" ADD CONSTRAINT "gateway_config_revisions_tenant_id_gateway_id_fkey" FOREIGN KEY ("tenant_id", "gateway_id") REFERENCES "app"."gateways"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."gateway_deployments" ADD CONSTRAINT "gateway_deployments_tenant_id_revision_id_fkey" FOREIGN KEY ("tenant_id", "revision_id") REFERENCES "app"."gateway_config_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."access_policies" ADD CONSTRAINT "access_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."access_policy_versions" ADD CONSTRAINT "access_policy_versions_tenant_id_policy_id_fkey" FOREIGN KEY ("tenant_id", "policy_id") REFERENCES "app"."access_policies"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."policy_assignments" ADD CONSTRAINT "policy_assignments_tenant_id_policy_version_id_fkey" FOREIGN KEY ("tenant_id", "policy_version_id") REFERENCES "app"."access_policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."policy_assignments" ADD CONSTRAINT "policy_assignments_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "app"."organizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."policy_assignments" ADD CONSTRAINT "policy_assignments_tenant_id_site_group_id_fkey" FOREIGN KEY ("tenant_id", "site_group_id") REFERENCES "app"."site_groups"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."policy_assignments" ADD CONSTRAINT "policy_assignments_tenant_id_site_id_fkey" FOREIGN KEY ("tenant_id", "site_id") REFERENCES "app"."sites"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."policy_assignments" ADD CONSTRAINT "policy_assignments_tenant_id_zone_id_fkey" FOREIGN KEY ("tenant_id", "zone_id") REFERENCES "app"."zones"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."login_methods" ADD CONSTRAINT "login_methods_tenant_id_site_id_fkey" FOREIGN KEY ("tenant_id", "site_id") REFERENCES "app"."sites"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."login_methods" ADD CONSTRAINT "login_methods_tenant_id_policy_version_id_fkey" FOREIGN KEY ("tenant_id", "policy_version_id") REFERENCES "app"."access_policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portals" ADD CONSTRAINT "portals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_versions" ADD CONSTRAINT "portal_versions_tenant_id_portal_id_fkey" FOREIGN KEY ("tenant_id", "portal_id") REFERENCES "app"."portals"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_blocks" ADD CONSTRAINT "portal_blocks_tenant_id_portal_version_id_fkey" FOREIGN KEY ("tenant_id", "portal_version_id") REFERENCES "app"."portal_versions"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_publications" ADD CONSTRAINT "portal_publications_tenant_id_portal_version_id_fkey" FOREIGN KEY ("tenant_id", "portal_version_id") REFERENCES "app"."portal_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_publications" ADD CONSTRAINT "portal_publications_tenant_id_site_id_fkey" FOREIGN KEY ("tenant_id", "site_id") REFERENCES "app"."sites"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_publications" ADD CONSTRAINT "portal_publications_tenant_id_zone_id_fkey" FOREIGN KEY ("tenant_id", "zone_id") REFERENCES "app"."zones"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."processing_purposes" ADD CONSTRAINT "processing_purposes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."legal_documents" ADD CONSTRAINT "legal_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."legal_versions" ADD CONSTRAINT "legal_versions_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id", "document_id") REFERENCES "app"."legal_documents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."identity_spaces" ADD CONSTRAINT "identity_spaces_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."end_users" ADD CONSTRAINT "end_users_tenant_id_identity_space_id_fkey" FOREIGN KEY ("tenant_id", "identity_space_id") REFERENCES "app"."identity_spaces"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."end_user_identifiers" ADD CONSTRAINT "end_user_identifiers_tenant_id_identity_space_id_fkey" FOREIGN KEY ("tenant_id", "identity_space_id") REFERENCES "app"."identity_spaces"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."end_user_identifiers" ADD CONSTRAINT "end_user_identifiers_tenant_id_end_user_id_fkey" FOREIGN KEY ("tenant_id", "end_user_id") REFERENCES "app"."end_users"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."client_devices" ADD CONSTRAINT "client_devices_tenant_id_identity_space_id_fkey" FOREIGN KEY ("tenant_id", "identity_space_id") REFERENCES "app"."identity_spaces"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."end_user_device_links" ADD CONSTRAINT "end_user_device_links_tenant_id_end_user_id_fkey" FOREIGN KEY ("tenant_id", "end_user_id") REFERENCES "app"."end_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."end_user_device_links" ADD CONSTRAINT "end_user_device_links_tenant_id_device_id_fkey" FOREIGN KEY ("tenant_id", "device_id") REFERENCES "app"."client_devices"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."captive_attempts" ADD CONSTRAINT "captive_attempts_tenant_id_gateway_id_fkey" FOREIGN KEY ("tenant_id", "gateway_id") REFERENCES "app"."gateways"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."captive_attempts" ADD CONSTRAINT "captive_attempts_tenant_id_device_id_fkey" FOREIGN KEY ("tenant_id", "device_id") REFERENCES "app"."client_devices"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."access_authorizations" ADD CONSTRAINT "access_authorizations_tenant_id_attempt_id_fkey" FOREIGN KEY ("tenant_id", "attempt_id") REFERENCES "app"."captive_attempts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."access_authorizations" ADD CONSTRAINT "access_authorizations_tenant_id_gateway_id_fkey" FOREIGN KEY ("tenant_id", "gateway_id") REFERENCES "app"."gateways"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."access_authorizations" ADD CONSTRAINT "access_authorizations_tenant_id_policy_version_id_fkey" FOREIGN KEY ("tenant_id", "policy_version_id") REFERENCES "app"."access_policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."access_authorizations" ADD CONSTRAINT "access_authorizations_tenant_id_end_user_id_fkey" FOREIGN KEY ("tenant_id", "end_user_id") REFERENCES "app"."end_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."access_authorizations" ADD CONSTRAINT "access_authorizations_tenant_id_device_id_fkey" FOREIGN KEY ("tenant_id", "device_id") REFERENCES "app"."client_devices"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."legal_acceptances" ADD CONSTRAINT "legal_acceptances_tenant_id_end_user_id_fkey" FOREIGN KEY ("tenant_id", "end_user_id") REFERENCES "app"."end_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."legal_acceptances" ADD CONSTRAINT "legal_acceptances_tenant_id_authorization_id_fkey" FOREIGN KEY ("tenant_id", "authorization_id") REFERENCES "app"."access_authorizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."legal_acceptances" ADD CONSTRAINT "legal_acceptances_tenant_id_legal_version_id_fkey" FOREIGN KEY ("tenant_id", "legal_version_id") REFERENCES "app"."legal_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."consent_events" ADD CONSTRAINT "consent_events_tenant_id_end_user_id_fkey" FOREIGN KEY ("tenant_id", "end_user_id") REFERENCES "app"."end_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."consent_events" ADD CONSTRAINT "consent_events_tenant_id_purpose_id_fkey" FOREIGN KEY ("tenant_id", "purpose_id") REFERENCES "app"."processing_purposes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."consent_events" ADD CONSTRAINT "consent_events_tenant_id_legal_version_id_fkey" FOREIGN KEY ("tenant_id", "legal_version_id") REFERENCES "app"."legal_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."data_subject_requests" ADD CONSTRAINT "data_subject_requests_tenant_id_identity_space_id_fkey" FOREIGN KEY ("tenant_id", "identity_space_id") REFERENCES "app"."identity_spaces"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."data_subject_requests" ADD CONSTRAINT "data_subject_requests_tenant_id_end_user_id_fkey" FOREIGN KEY ("tenant_id", "end_user_id") REFERENCES "app"."end_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."voucher_batches" ADD CONSTRAINT "voucher_batches_tenant_id_site_id_fkey" FOREIGN KEY ("tenant_id", "site_id") REFERENCES "app"."sites"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."voucher_batches" ADD CONSTRAINT "voucher_batches_tenant_id_policy_version_id_fkey" FOREIGN KEY ("tenant_id", "policy_version_id") REFERENCES "app"."access_policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."vouchers" ADD CONSTRAINT "vouchers_tenant_id_batch_id_fkey" FOREIGN KEY ("tenant_id", "batch_id") REFERENCES "app"."voucher_batches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_tenant_id_voucher_id_fkey" FOREIGN KEY ("tenant_id", "voucher_id") REFERENCES "app"."vouchers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_tenant_id_attempt_id_fkey" FOREIGN KEY ("tenant_id", "attempt_id") REFERENCES "app"."captive_attempts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_tenant_id_authorization_id_fkey" FOREIGN KEY ("tenant_id", "authorization_id") REFERENCES "app"."access_authorizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."authorized_devices" ADD CONSTRAINT "authorized_devices_tenant_id_site_id_fkey" FOREIGN KEY ("tenant_id", "site_id") REFERENCES "app"."sites"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."authorized_devices" ADD CONSTRAINT "authorized_devices_tenant_id_device_id_fkey" FOREIGN KEY ("tenant_id", "device_id") REFERENCES "app"."client_devices"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."authorized_devices" ADD CONSTRAINT "authorized_devices_tenant_id_policy_version_id_fkey" FOREIGN KEY ("tenant_id", "policy_version_id") REFERENCES "app"."access_policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."blocked_entities" ADD CONSTRAINT "blocked_entities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radius_runtime"."credentials" ADD CONSTRAINT "credentials_tenant_id_authorization_id_fkey" FOREIGN KEY ("tenant_id", "authorization_id") REFERENCES "app"."access_authorizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radius_runtime"."credentials" ADD CONSTRAINT "credentials_tenant_id_gateway_id_fkey" FOREIGN KEY ("tenant_id", "gateway_id") REFERENCES "app"."gateways"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radius_runtime"."reply_attributes" ADD CONSTRAINT "reply_attributes_tenant_id_credential_id_fkey" FOREIGN KEY ("tenant_id", "credential_id") REFERENCES "radius_runtime"."credentials"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radius_runtime"."nas_registry" ADD CONSTRAINT "nas_registry_tenant_id_gateway_id_fkey" FOREIGN KEY ("tenant_id", "gateway_id") REFERENCES "app"."gateways"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."radius_sessions" ADD CONSTRAINT "radius_sessions_tenant_id_gateway_id_fkey" FOREIGN KEY ("tenant_id", "gateway_id") REFERENCES "app"."gateways"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."radius_sessions" ADD CONSTRAINT "radius_sessions_tenant_id_authorization_id_fkey" FOREIGN KEY ("tenant_id", "authorization_id") REFERENCES "app"."access_authorizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radius_runtime"."accounting_inbox" ADD CONSTRAINT "accounting_inbox_tenant_id_gateway_id_fkey" FOREIGN KEY ("tenant_id", "gateway_id") REFERENCES "app"."gateways"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radius_runtime"."accounting_inbox" ADD CONSTRAINT "accounting_inbox_tenant_id_authorization_id_fkey" FOREIGN KEY ("tenant_id", "authorization_id") REFERENCES "app"."access_authorizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radius_runtime"."accounting_inbox" ADD CONSTRAINT "accounting_inbox_tenant_id_session_id_fkey" FOREIGN KEY ("tenant_id", "session_id") REFERENCES "app"."radius_sessions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radius_runtime"."post_auth_inbox" ADD CONSTRAINT "post_auth_inbox_tenant_id_gateway_id_fkey" FOREIGN KEY ("tenant_id", "gateway_id") REFERENCES "app"."gateways"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radius_runtime"."post_auth_inbox" ADD CONSTRAINT "post_auth_inbox_tenant_id_authorization_id_fkey" FOREIGN KEY ("tenant_id", "authorization_id") REFERENCES "app"."access_authorizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."idempotency_keys" ADD CONSTRAINT "idempotency_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."outbox_events" ADD CONSTRAINT "outbox_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."exports" ADD CONSTRAINT "exports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."exports" ADD CONSTRAINT "exports_tenant_id_dsr_id_fkey" FOREIGN KEY ("tenant_id", "dsr_id") REFERENCES "app"."data_subject_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit"."audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- PostgreSQL-native integrity checks not expressible in Prisma schema syntax.
-- ---------------------------------------------------------------------------

ALTER TABLE app.tenants
    ADD CONSTRAINT tenants_slug_format_ck CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
    ADD CONSTRAINT tenants_status_ck CHECK (status IN ('active', 'suspended', 'closed'));

ALTER TABLE app.admin_users
    ADD CONSTRAINT admin_users_email_ciphertext_ck CHECK (octet_length(email_ciphertext) > 0),
    ADD CONSTRAINT admin_users_email_key_version_ck CHECK (length(btrim(email_key_version)) BETWEEN 1 AND 80),
    ADD CONSTRAINT admin_users_email_hmac_ck CHECK (octet_length(email_hmac) >= 16),
    ADD CONSTRAINT admin_users_status_ck CHECK (status IN ('invited', 'active', 'suspended', 'revoked'));

CREATE OR REPLACE FUNCTION app.valid_recovery_hashes(hashes bytea[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
    SELECT cardinality(hashes) <= 16
       AND NOT EXISTS (
           SELECT 1 FROM unnest(hashes) AS recovery(hash)
           WHERE octet_length(hash) <> 32
       )
$function$;

ALTER TABLE app.admin_credentials
    ADD CONSTRAINT admin_credentials_password_hash_ck CHECK (
        length(password_hash) BETWEEN 32 AND 1024 AND
        password_hash ~ '^\$scrypt\$ln=[0-9]+,r=[0-9]+,p=[0-9]+,l=[0-9]+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$'
    ),
    ADD CONSTRAINT admin_credentials_algorithm_ck CHECK (hash_algorithm = 'scrypt'),
    ADD CONSTRAINT admin_credentials_version_ck CHECK (hash_version > 0),
    ADD CONSTRAINT admin_credentials_attempts_ck CHECK (failed_attempts BETWEEN 0 AND 100),
    ADD CONSTRAINT admin_credentials_expiry_ck CHECK (password_expires_at IS NULL OR password_expires_at > password_changed_at);

ALTER TABLE app.admin_sessions
    ADD CONSTRAINT admin_sessions_token_hash_ck CHECK (octet_length(token_hash) = 32),
    ADD CONSTRAINT admin_sessions_auth_strength_ck CHECK (auth_strength IN ('password', 'totp', 'webauthn', 'recovery_code')),
    ADD CONSTRAINT admin_sessions_time_ck CHECK (
        idle_expires_at > created_at AND expires_at > created_at AND idle_expires_at <= expires_at AND
        (revoked_at IS NULL OR revoked_at >= created_at) AND
        (mfa_verified_at IS NULL OR (mfa_verified_at >= created_at AND mfa_verified_at <= expires_at)) AND
        (auth_strength = 'password' OR mfa_verified_at IS NOT NULL)
    ),
    ADD CONSTRAINT admin_sessions_ip_pair_ck CHECK (
        (ip_ciphertext IS NULL) = (ip_hmac IS NULL) AND
        (ip_ciphertext IS NULL OR (octet_length(ip_ciphertext) > 0 AND octet_length(ip_hmac) >= 16))
    ),
    ADD CONSTRAINT admin_sessions_user_agent_pair_ck CHECK (
        (user_agent_ciphertext IS NULL) = (user_agent_hmac IS NULL) AND
        (user_agent_ciphertext IS NULL OR (octet_length(user_agent_ciphertext) > 0 AND octet_length(user_agent_hmac) >= 16))
    );

ALTER TABLE app.admin_totp_factors
    ALTER COLUMN recovery_code_hashes SET NOT NULL,
    ADD CONSTRAINT admin_totp_secret_ck CHECK (octet_length(secret_ciphertext) > 0),
    ADD CONSTRAINT admin_totp_key_version_ck CHECK (length(key_version) BETWEEN 1 AND 80),
    ADD CONSTRAINT admin_totp_recovery_hashes_ck CHECK (app.valid_recovery_hashes(recovery_code_hashes)),
    ADD CONSTRAINT admin_totp_time_ck CHECK (revoked_at IS NULL OR revoked_at >= created_at);

ALTER TABLE app.admin_webauthn_credentials
    ALTER COLUMN transports SET NOT NULL,
    ADD CONSTRAINT admin_webauthn_credential_id_ck CHECK (octet_length(credential_id) BETWEEN 16 AND 1024),
    ADD CONSTRAINT admin_webauthn_public_key_ck CHECK (octet_length(public_key_cose) BETWEEN 16 AND 4096),
    ADD CONSTRAINT admin_webauthn_sign_count_ck CHECK (sign_count >= 0),
    ADD CONSTRAINT admin_webauthn_backup_state_ck CHECK (NOT backup_state OR backup_eligible),
    ADD CONSTRAINT admin_webauthn_transports_ck CHECK (transports <@ ARRAY['usb', 'nfc', 'ble', 'internal', 'hybrid']::text[]),
    ADD CONSTRAINT admin_webauthn_time_ck CHECK (revoked_at IS NULL OR revoked_at >= created_at);

ALTER TABLE app.tenant_memberships
    ADD CONSTRAINT tenant_memberships_status_ck CHECK (status IN ('invited', 'active', 'suspended', 'revoked'));

ALTER TABLE app.role_assignments
    ADD CONSTRAINT role_assignments_scope_ck CHECK (
        (scope_type = 'tenant' AND organization_id IS NULL AND site_group_id IS NULL AND site_id IS NULL) OR
        (scope_type = 'organization' AND organization_id IS NOT NULL AND site_group_id IS NULL AND site_id IS NULL) OR
        (scope_type = 'site_group' AND organization_id IS NULL AND site_group_id IS NOT NULL AND site_id IS NULL) OR
        (scope_type = 'site' AND organization_id IS NULL AND site_group_id IS NULL AND site_id IS NOT NULL)
    ),
    ADD CONSTRAINT role_assignments_time_ck CHECK (expires_at IS NULL OR expires_at > starts_at);

CREATE UNIQUE INDEX organizations_tenant_code_active_uq
    ON app.organizations (tenant_id, lower(code)) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX site_groups_tenant_name_active_uq
    ON app.site_groups (tenant_id, lower(name)) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX sites_tenant_org_code_active_uq
    ON app.sites (tenant_id, organization_id, lower(code)) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX zones_tenant_site_name_active_uq
    ON app.zones (tenant_id, site_id, lower(name)) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX ssids_tenant_zone_name_active_uq
    ON app.ssids (tenant_id, zone_id, lower(name)) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX gateways_tenant_serial_uq
    ON app.gateways (tenant_id, serial) WHERE serial IS NOT NULL;

ALTER TABLE app.gateways
    ADD CONSTRAINT gateways_status_ck CHECK (status IN (
        'pending', 'provisioning', 'online', 'degraded', 'offline',
        'out_of_sync', 'blocked', 'retired'
    ));

CREATE OR REPLACE FUNCTION app.valid_https_origins(origins text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
    SELECT cardinality(origins) BETWEEN 1 AND 16
       AND NOT EXISTS (
           SELECT 1
           FROM unnest(origins) AS origin(value)
           WHERE value !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]{1,5})?$'
       )
$function$;

ALTER TABLE app.gateway_captive_locators
    ALTER COLUMN allowed_login_origins SET NOT NULL,
    ADD CONSTRAINT gateway_captive_locators_hash_ck CHECK (octet_length(locator_hash) = 32),
    ADD CONSTRAINT gateway_captive_locators_origins_ck CHECK (app.valid_https_origins(allowed_login_origins)),
    ADD CONSTRAINT gateway_captive_locators_time_ck CHECK (
        expires_at > not_before AND (revoked_at IS NULL OR revoked_at >= created_at)
    ),
    ADD CONSTRAINT gateway_captive_locators_rotation_ck CHECK (replaces_locator_id IS NULL OR replaces_locator_id <> id);

ALTER TABLE app.gateway_zone_bindings
    ADD CONSTRAINT gateway_zone_bindings_vlan_ck CHECK (vlan_id IS NULL OR vlan_id BETWEEN 1 AND 4094);

ALTER TABLE app.gateway_secret_versions
    ADD CONSTRAINT gateway_secret_versions_ciphertext_ck CHECK (octet_length(ciphertext) > 0),
    ADD CONSTRAINT gateway_secret_versions_time_ck CHECK (retired_at IS NULL OR retired_at > created_at);

ALTER TABLE app.gateway_config_revisions
    ADD CONSTRAINT gateway_config_revisions_version_ck CHECK (version > 0),
    ADD CONSTRAINT gateway_config_revisions_mode_ck CHECK (mode IN ('new_router', 'integrate_existing', 'hotspot_only')),
    ADD CONSTRAINT gateway_config_revisions_hash_ck CHECK (snapshot_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE app.gateway_deployments
    ADD CONSTRAINT gateway_deployments_state_ck CHECK (state IN (
        'pending', 'preflight', 'awaiting_approval', 'applying', 'applied',
        'rolling_back', 'rolled_back', 'failed', 'manual_recovery'
    )),
    ADD CONSTRAINT gateway_deployments_time_ck CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at),
    ADD CONSTRAINT gateway_deployments_evidence_hash_ck CHECK (evidence_hash IS NULL OR evidence_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE app.access_policy_versions
    ADD CONSTRAINT access_policy_versions_version_ck CHECK (version > 0),
    ADD CONSTRAINT access_policy_versions_status_ck CHECK (status IN ('draft', 'published', 'retired')),
    ADD CONSTRAINT access_policy_versions_validity_ck CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from),
    ADD CONSTRAINT access_policy_versions_limits_ck CHECK (
        (total_duration_seconds IS NULL OR total_duration_seconds > 0) AND
        (session_timeout_seconds IS NULL OR session_timeout_seconds > 0) AND
        (idle_timeout_seconds IS NULL OR idle_timeout_seconds > 0) AND
        (download_kbps IS NULL OR download_kbps > 0) AND
        (upload_kbps IS NULL OR upload_kbps > 0) AND
        (quota_bytes IS NULL OR quota_bytes > 0) AND
        max_concurrent_devices > 0
    );

ALTER TABLE app.policy_assignments
    ADD CONSTRAINT policy_assignments_scope_ck CHECK (
        (scope_type = 'tenant' AND organization_id IS NULL AND site_group_id IS NULL AND site_id IS NULL AND zone_id IS NULL) OR
        (scope_type = 'organization' AND organization_id IS NOT NULL AND site_group_id IS NULL AND site_id IS NULL AND zone_id IS NULL) OR
        (scope_type = 'site_group' AND organization_id IS NULL AND site_group_id IS NOT NULL AND site_id IS NULL AND zone_id IS NULL) OR
        (scope_type = 'site' AND organization_id IS NULL AND site_group_id IS NULL AND site_id IS NOT NULL AND zone_id IS NULL) OR
        (scope_type = 'zone' AND organization_id IS NULL AND site_group_id IS NULL AND site_id IS NULL AND zone_id IS NOT NULL)
    ),
    ADD CONSTRAINT policy_assignments_validity_ck CHECK (valid_until IS NULL OR valid_until > valid_from);

CREATE UNIQUE INDEX policy_assignments_one_active_default_uq
    ON app.policy_assignments (
        tenant_id,
        scope_type,
        COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(site_group_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(zone_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) WHERE is_default AND archived_at IS NULL;

ALTER TABLE app.login_methods
    ADD CONSTRAINT login_methods_kind_ck CHECK (kind IN ('click', 'email', 'email_otp', 'pin', 'voucher')),
    ADD CONSTRAINT login_methods_availability_ck CHECK (available_until IS NULL OR available_from IS NULL OR available_until > available_from);

ALTER TABLE app.portal_versions
    ADD CONSTRAINT portal_versions_version_ck CHECK (version > 0),
    ADD CONSTRAINT portal_versions_status_ck CHECK (status IN ('draft', 'published', 'retired'));

ALTER TABLE app.portal_publications
    ADD CONSTRAINT portal_publications_time_ck CHECK (ends_at IS NULL OR ends_at > starts_at),
    ADD CONSTRAINT portal_publications_hash_ck CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT portal_publications_no_overlap EXCLUDE USING gist (
        tenant_id WITH =,
        site_id WITH =,
        (COALESCE(zone_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
        (tstzrange(starts_at, COALESCE(ends_at, 'infinity'::timestamptz), '[)')) WITH &&
    );

ALTER TABLE app.processing_purposes
    ADD CONSTRAINT processing_purposes_lawful_basis_ck CHECK (lawful_basis IN (
        'consent', 'contract', 'legal_obligation', 'vital_interests',
        'public_task', 'legitimate_interests'
    ));

ALTER TABLE app.legal_versions
    ADD CONSTRAINT legal_versions_version_ck CHECK (version > 0),
    ADD CONSTRAINT legal_versions_status_ck CHECK (status IN ('draft', 'published', 'retired')),
    ADD CONSTRAINT legal_versions_hash_ck CHECK (content_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE app.end_user_identifiers
    ADD CONSTRAINT end_user_identifiers_ciphertext_ck CHECK (octet_length(ciphertext) > 0),
    ADD CONSTRAINT end_user_identifiers_hmac_ck CHECK (octet_length(value_hmac) >= 16);

ALTER TABLE app.end_user_device_links
    ADD CONSTRAINT end_user_device_links_time_ck CHECK (ends_at IS NULL OR ends_at > starts_at);

ALTER TABLE app.captive_attempts
    ADD CONSTRAINT captive_attempts_status_ck CHECK (status IN ('pending', 'authorized', 'rejected', 'expired', 'consumed')),
    ADD CONSTRAINT captive_attempts_expiry_ck CHECK (expires_at > created_at),
    ADD CONSTRAINT captive_attempts_state_hash_ck CHECK (octet_length(state_hash) = 32),
    ADD CONSTRAINT captive_attempts_nonce_hash_ck CHECK (octet_length(nonce_hash) = 32);

ALTER TABLE app.access_authorizations
    ADD CONSTRAINT access_authorizations_status_ck CHECK (status IN ('issued', 'active', 'expired', 'revoked', 'consumed')),
    ADD CONSTRAINT access_authorizations_time_ck CHECK (expires_at > starts_at),
    ADD CONSTRAINT access_authorizations_hash_ck CHECK (evidence_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE app.consent_events
    ADD CONSTRAINT consent_events_decision_ck CHECK (decision IN ('granted', 'rejected', 'withdrawn'));

ALTER TABLE app.data_subject_requests
    ADD CONSTRAINT data_subject_requests_kind_ck CHECK (kind IN ('access', 'rectification', 'erasure', 'restriction', 'portability', 'objection')),
    ADD CONSTRAINT data_subject_requests_state_ck CHECK (state IN ('received', 'identity_verification', 'approved', 'rejected', 'executing', 'completed', 'cancelled'));

ALTER TABLE app.voucher_batches
    ADD CONSTRAINT voucher_batches_quantity_ck CHECK (quantity > 0),
    ADD CONSTRAINT voucher_batches_limits_ck CHECK (default_max_uses > 0 AND default_max_devices > 0),
    ADD CONSTRAINT voucher_batches_time_ck CHECK (expires_at > starts_at);

ALTER TABLE app.vouchers
    ADD CONSTRAINT vouchers_code_hmac_ck CHECK (octet_length(code_hmac) >= 16),
    ADD CONSTRAINT vouchers_state_ck CHECK (state IN ('available', 'active', 'exhausted', 'expired', 'revoked', 'refunded')),
    ADD CONSTRAINT vouchers_usage_ck CHECK (max_uses > 0 AND used_count >= 0 AND used_count <= max_uses AND max_devices > 0);

ALTER TABLE app.voucher_redemptions
    ADD CONSTRAINT voucher_redemptions_outcome_ck CHECK (outcome IN ('accepted', 'rejected', 'replayed', 'expired', 'revoked', 'exhausted'));

ALTER TABLE app.authorized_devices
    ADD CONSTRAINT authorized_devices_time_ck CHECK (expires_at > starts_at AND (revoked_at IS NULL OR revoked_at >= starts_at));

ALTER TABLE app.blocked_entities
    ADD CONSTRAINT blocked_entities_scope_ck CHECK (
        (scope_type = 'tenant' AND scope_id IS NULL) OR
        (scope_type IN ('organization', 'site') AND scope_id IS NOT NULL)
    ),
    ADD CONSTRAINT blocked_entities_subject_ck CHECK (subject_type IN ('user', 'email', 'mac', 'ip', 'fingerprint', 'abuse')),
    ADD CONSTRAINT blocked_entities_hmac_ck CHECK (octet_length(subject_hmac) >= 16),
    ADD CONSTRAINT blocked_entities_time_ck CHECK (expires_at IS NULL OR expires_at > starts_at);

ALTER TABLE radius_runtime.credentials
    ADD CONSTRAINT radius_credentials_username_ck CHECK (length(username) BETWEEN 1 AND 253),
    ADD CONSTRAINT radius_credentials_nas_ck CHECK (length(nas_identifier) BETWEEN 1 AND 253),
    ADD CONSTRAINT radius_credentials_mac_ck CHECK (calling_station_id IS NULL OR calling_station_id ~ '^[0-9a-f]{12}$'),
    ADD CONSTRAINT radius_credentials_verifier_attribute_ck CHECK (verifier_attribute IN ('Cleartext-Password', 'Crypt-Password')),
    ADD CONSTRAINT radius_credentials_verifier_value_ck CHECK (length(verifier_value) BETWEEN 1 AND 1024),
    ADD CONSTRAINT radius_credentials_usage_ck CHECK (max_uses > 0 AND used_count >= 0 AND used_count <= max_uses),
    ADD CONSTRAINT radius_credentials_expiry_ck CHECK (expires_at > not_before),
    ADD CONSTRAINT radius_credentials_revocation_ck CHECK (revoked_at IS NULL OR NOT enabled);

ALTER TABLE radius_runtime.reply_attributes
    ADD CONSTRAINT radius_reply_attributes_operator_ck CHECK (op = ':='),
    ADD CONSTRAINT radius_reply_attributes_name_ck CHECK (attribute IN (
        'Class', 'Mikrotik-Rate-Limit', 'Session-Timeout', 'Idle-Timeout',
        'Acct-Interim-Interval', 'Port-Limit'
    )),
    ADD CONSTRAINT radius_reply_attributes_value_ck CHECK (length(value) BETWEEN 1 AND 253),
    ADD CONSTRAINT radius_reply_attributes_priority_ck CHECK (priority > 0);

ALTER TABLE app.radius_sessions
    ADD CONSTRAINT radius_sessions_state_ck CHECK (state IN ('active', 'stopped', 'orphaned', 'reconciled')),
    ADD CONSTRAINT radius_sessions_time_ck CHECK (stopped_at IS NULL OR stopped_at >= started_at),
    ADD CONSTRAINT radius_sessions_counters_ck CHECK (input_octets >= 0 AND output_octets >= 0);

CREATE UNIQUE INDEX radius_sessions_one_active_session_uq
    ON app.radius_sessions (tenant_id, gateway_id, acct_session_id)
    WHERE stopped_at IS NULL;

ALTER TABLE radius_runtime.accounting_inbox
    ADD CONSTRAINT accounting_inbox_status_ck CHECK (status_type IN ('Start', 'Interim-Update', 'Stop')),
    ADD CONSTRAINT accounting_inbox_username_ck CHECK (length(username) BETWEEN 1 AND 253),
    ADD CONSTRAINT accounting_inbox_session_ck CHECK (length(acct_session_id) BETWEEN 1 AND 253),
    ADD CONSTRAINT accounting_inbox_counters_ck CHECK (nas_input_octets >= 0 AND nas_output_octets >= 0),
    ADD CONSTRAINT accounting_inbox_session_time_ck CHECK (session_time_seconds IS NULL OR session_time_seconds >= 0),
    ADD CONSTRAINT accounting_inbox_delay_ck CHECK (acct_delay_seconds >= 0),
    ADD CONSTRAINT accounting_inbox_fingerprint_ck CHECK (event_fingerprint ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT accounting_inbox_claim_ck CHECK (
        (claim_token IS NULL AND claimed_by IS NULL AND claimed_at IS NULL AND lease_expires_at IS NULL) OR
        (claim_token IS NOT NULL AND claimed_by IS NOT NULL AND claimed_at IS NOT NULL AND lease_expires_at > claimed_at)
    ),
    ADD CONSTRAINT accounting_inbox_attempts_ck CHECK (processing_attempts >= 0);

ALTER TABLE radius_runtime.post_auth_inbox
    ADD CONSTRAINT post_auth_inbox_username_ck CHECK (length(username) BETWEEN 1 AND 253),
    ADD CONSTRAINT post_auth_inbox_reply_ck CHECK (reply_packet_type IN ('Access-Accept', 'Access-Reject', 'Access-Challenge'));

CREATE INDEX "accounting_inbox_received_at_idx"
    ON radius_runtime.accounting_inbox USING brin (received_at);

ALTER TABLE app.idempotency_keys
    ADD CONSTRAINT idempotency_keys_state_ck CHECK (state IN ('started', 'completed', 'failed')),
    ADD CONSTRAINT idempotency_keys_hash_ck CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT idempotency_keys_expiry_ck CHECK (expires_at > created_at);

ALTER TABLE app.outbox_events
    ADD CONSTRAINT outbox_events_version_ck CHECK (event_version > 0),
    ADD CONSTRAINT outbox_events_attempts_ck CHECK (attempts >= 0),
    ADD CONSTRAINT outbox_events_claim_ck CHECK (
        (claim_token IS NULL AND claimed_by IS NULL AND claimed_at IS NULL AND lease_expires_at IS NULL) OR
        (claim_token IS NOT NULL AND claimed_by IS NOT NULL AND claimed_at IS NOT NULL AND lease_expires_at > claimed_at)
    );

CREATE INDEX outbox_events_pending_idx
    ON app.outbox_events (available_at, occurred_at) WHERE published_at IS NULL;

ALTER TABLE app.exports
    ADD CONSTRAINT exports_state_ck CHECK (state IN ('requested', 'approved', 'generating', 'ready', 'downloaded', 'expired', 'failed', 'rejected')),
    ADD CONSTRAINT exports_approval_ck CHECK (approved_by IS NULL OR approved_by <> requested_by),
    ADD CONSTRAINT exports_object_hash_ck CHECK (object_hash IS NULL OR object_hash ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT exports_expiry_ck CHECK (expires_at > created_at);

-- ---------------------------------------------------------------------------
-- RLS tenant context and narrow global control-plane policies.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
    SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
$function$;

REVOKE ALL ON FUNCTION app.current_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_tenant_id() TO
    wifi_app_runtime, wifi_worker, wifi_radius_runtime, wifi_audit_writer,
    wifi_export_worker, wifi_monitoring;

DO $rls$
DECLARE
    target record;
BEGIN
    FOR target IN
        SELECT DISTINCT table_schema, table_name
        FROM information_schema.columns
        WHERE column_name = 'tenant_id'
          AND table_schema IN ('app', 'audit', 'radius_runtime')
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

ALTER TABLE app.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON app.tenants
    USING (id = app.current_tenant_id())
    WITH CHECK (id = app.current_tenant_id());

ALTER TABLE app.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.admin_users FORCE ROW LEVEL SECURITY;
CREATE POLICY admin_user_membership_read ON app.admin_users
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM app.tenant_memberships membership
            WHERE membership.user_id = admin_users.id
              AND membership.tenant_id = app.current_tenant_id()
              AND membership.status = 'active'
        )
    );

-- Authentication identity data is global because one administrator may belong
-- to multiple tenants. FORCE RLS projects it through an active membership in
-- the transaction's tenant; no plaintext email, session token, TOTP seed, IP or
-- user-agent value is stored.
ALTER TABLE app.admin_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.admin_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY admin_credentials_tenant_membership ON app.admin_credentials
    USING (
        EXISTS (
            SELECT 1 FROM app.tenant_memberships membership
            WHERE membership.user_id = admin_credentials.user_id
              AND membership.tenant_id = app.current_tenant_id()
              AND membership.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM app.tenant_memberships membership
            WHERE membership.user_id = admin_credentials.user_id
              AND membership.tenant_id = app.current_tenant_id()
              AND membership.status = 'active'
        )
    );

ALTER TABLE app.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.admin_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY admin_sessions_tenant_membership ON app.admin_sessions
    USING (
        EXISTS (
            SELECT 1 FROM app.tenant_memberships membership
            WHERE membership.user_id = admin_sessions.user_id
              AND membership.tenant_id = app.current_tenant_id()
              AND membership.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM app.tenant_memberships membership
            WHERE membership.user_id = admin_sessions.user_id
              AND membership.tenant_id = app.current_tenant_id()
              AND membership.status = 'active'
        )
    );

ALTER TABLE app.admin_totp_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.admin_totp_factors FORCE ROW LEVEL SECURITY;
CREATE POLICY admin_totp_factors_tenant_membership ON app.admin_totp_factors
    USING (
        EXISTS (
            SELECT 1 FROM app.tenant_memberships membership
            WHERE membership.user_id = admin_totp_factors.user_id
              AND membership.tenant_id = app.current_tenant_id()
              AND membership.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM app.tenant_memberships membership
            WHERE membership.user_id = admin_totp_factors.user_id
              AND membership.tenant_id = app.current_tenant_id()
              AND membership.status = 'active'
        )
    );

ALTER TABLE app.admin_webauthn_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.admin_webauthn_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY admin_webauthn_credentials_tenant_membership ON app.admin_webauthn_credentials
    USING (
        EXISTS (
            SELECT 1 FROM app.tenant_memberships membership
            WHERE membership.user_id = admin_webauthn_credentials.user_id
              AND membership.tenant_id = app.current_tenant_id()
              AND membership.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM app.tenant_memberships membership
            WHERE membership.user_id = admin_webauthn_credentials.user_id
              AND membership.tenant_id = app.current_tenant_id()
              AND membership.status = 'active'
        )
    );

-- FreeRADIUS is a deliberately cross-tenant infrastructure principal. It does
-- not bypass RLS: explicit narrow policies allow read-only authorization data
-- and append-only telemetry writes, while application roles remain tenant-bound.
CREATE POLICY radius_credentials_global_read ON radius_runtime.credentials
    FOR SELECT TO wifi_radius_runtime USING (true);
CREATE POLICY radius_reply_attributes_global_read ON radius_runtime.reply_attributes
    FOR SELECT TO wifi_radius_runtime USING (true);
CREATE POLICY radius_accounting_global_insert ON radius_runtime.accounting_inbox
    FOR INSERT TO wifi_radius_runtime WITH CHECK (true);
CREATE POLICY radius_accounting_conflict_read ON radius_runtime.accounting_inbox
    FOR SELECT TO wifi_radius_runtime USING (true);
CREATE POLICY radius_post_auth_global_insert ON radius_runtime.post_auth_inbox
    FOR INSERT TO wifi_radius_runtime WITH CHECK (true);

CREATE VIEW radius_runtime.radcheck_compat
WITH (security_barrier = true, security_invoker = true)
AS
SELECT
    credential.runtime_id AS id,
    credential.username,
    credential.verifier_attribute AS attribute,
    credential.verifier_value AS value,
    ':='::text AS op,
    credential.nas_identifier,
    credential.calling_station_id,
    credential.enabled,
    credential.not_before,
    credential.expires_at
FROM radius_runtime.credentials AS credential;

CREATE VIEW radius_runtime.radreply_compat
WITH (security_barrier = true, security_invoker = true)
AS
SELECT
    reply.runtime_id AS id,
    credential.username,
    reply.attribute,
    reply.value,
    reply.op,
    reply.priority,
    credential.nas_identifier,
    credential.calling_station_id,
    credential.enabled,
    credential.not_before,
    credential.expires_at
FROM radius_runtime.reply_attributes AS reply
JOIN radius_runtime.credentials AS credential
  ON credential.tenant_id = reply.tenant_id
 AND credential.id = reply.credential_id;

-- This is the only cross-tenant routing lookup. The table itself remains FORCE
-- RLS and is never granted directly to FreeRADIUS. The function exposes only an
-- active tenant/gateway pair for one exact NAS-Identifier.
CREATE OR REPLACE FUNCTION radius_runtime.resolve_nas(p_nas_identifier text)
RETURNS TABLE (tenant_id uuid, gateway_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, radius_runtime
SET row_security = off
AS $function$
    SELECT registry.tenant_id, registry.gateway_id
    FROM radius_runtime.nas_registry AS registry
    WHERE registry.nas_identifier = p_nas_identifier
      AND registry.active
    LIMIT 1
$function$;

ALTER FUNCTION radius_runtime.resolve_nas(text) OWNER TO wifi_migrator;
REVOKE ALL ON FUNCTION radius_runtime.resolve_nas(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION radius_runtime.resolve_nas(text) TO wifi_radius_runtime;

-- Public captive ingress hashes the opaque locator before calling this function.
-- No NAS identifier, tenant slug or underlying row is accepted as a locator.
CREATE OR REPLACE FUNCTION app.resolve_captive_locator(p_locator_hash bytea)
RETURNS TABLE (
    tenant_id uuid,
    gateway_id uuid,
    site_id uuid,
    allowed_login_origins text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
SET row_security = off
AS $function$
    SELECT
        locator.tenant_id,
        locator.gateway_id,
        gateway.site_id,
        locator.allowed_login_origins
    FROM app.gateway_captive_locators AS locator
    JOIN app.gateways AS gateway
      ON gateway.tenant_id = locator.tenant_id
     AND gateway.id = locator.gateway_id
    WHERE octet_length(p_locator_hash) = 32
      AND locator.locator_hash = p_locator_hash
      AND locator.revoked_at IS NULL
      AND locator.not_before <= CURRENT_TIMESTAMP
      AND locator.expires_at > CURRENT_TIMESTAMP
      AND gateway.retired_at IS NULL
      AND gateway.status IN ('online', 'degraded', 'out_of_sync')
    LIMIT 1
$function$;

ALTER FUNCTION app.resolve_captive_locator(bytea) OWNER TO wifi_migrator;
REVOKE ALL ON FUNCTION app.resolve_captive_locator(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_captive_locator(bytea) TO wifi_app_runtime;

CREATE OR REPLACE FUNCTION app.resolve_captive_attempt(p_state_hash bytea)
RETURNS TABLE (tenant_id uuid, attempt_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
SET row_security = off
AS $function$
    SELECT attempt.tenant_id, attempt.id
    FROM app.captive_attempts AS attempt
    WHERE octet_length(p_state_hash) = 32
      AND attempt.state_hash = p_state_hash
      AND attempt.status = 'pending'
      AND attempt.consumed_at IS NULL
      AND attempt.expires_at > CURRENT_TIMESTAMP
    LIMIT 1
$function$;

ALTER FUNCTION app.resolve_captive_attempt(bytea) OWNER TO wifi_migrator;
REVOKE ALL ON FUNCTION app.resolve_captive_attempt(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_captive_attempt(bytea) TO wifi_app_runtime;

-- Exact pre-tenant authentication lookups. Callers supply keyed HMAC/SHA-256
-- digests, never plaintext email addresses or bearer tokens. Returned columns
-- are the minimum required to verify credentials and select an active tenant.
CREATE OR REPLACE FUNCTION app.lookup_admin_auth(p_email_hmac bytea)
RETURNS TABLE (
    user_id uuid,
    user_status text,
    password_hash text,
    hash_algorithm text,
    hash_version integer,
    failed_attempts integer,
    locked_until timestamptz,
    active_tenant_ids uuid[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
SET row_security = off
AS $function$
    SELECT
        admin.id,
        admin.status::text,
        credential.password_hash,
        credential.hash_algorithm::text,
        credential.hash_version,
        credential.failed_attempts,
        credential.locked_until,
        COALESCE(
            array_agg(tenant.id ORDER BY tenant.id)
                FILTER (WHERE tenant.id IS NOT NULL),
            ARRAY[]::uuid[]
        )
    FROM app.admin_users AS admin
    JOIN app.admin_credentials AS credential ON credential.user_id = admin.id
    LEFT JOIN app.tenant_memberships AS membership
      ON membership.user_id = admin.id
     AND membership.status = 'active'
    LEFT JOIN app.tenants AS tenant
      ON tenant.id = membership.tenant_id
     AND tenant.status = 'active'
    WHERE octet_length(p_email_hmac) >= 16
      AND admin.email_hmac = p_email_hmac
    GROUP BY admin.id, credential.id
$function$;

CREATE OR REPLACE FUNCTION app.resolve_admin_session(p_token_hash bytea)
RETURNS TABLE (
    session_id uuid,
    user_id uuid,
    user_status text,
    auth_strength text,
    mfa_verified_at timestamptz,
    idle_expires_at timestamptz,
    expires_at timestamptz,
    active_tenant_ids uuid[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
SET row_security = off
AS $function$
    SELECT
        session.id,
        session.user_id,
        admin.status::text,
        session.auth_strength::text,
        session.mfa_verified_at,
        session.idle_expires_at,
        session.expires_at,
        COALESCE(
            array_agg(tenant.id ORDER BY tenant.id)
                FILTER (WHERE tenant.id IS NOT NULL),
            ARRAY[]::uuid[]
        )
    FROM app.admin_sessions AS session
    JOIN app.admin_users AS admin ON admin.id = session.user_id
    LEFT JOIN app.tenant_memberships AS membership
      ON membership.user_id = admin.id
     AND membership.status = 'active'
    LEFT JOIN app.tenants AS tenant
      ON tenant.id = membership.tenant_id
     AND tenant.status = 'active'
    WHERE octet_length(p_token_hash) = 32
      AND session.token_hash = p_token_hash
      AND session.revoked_at IS NULL
      AND session.idle_expires_at > CURRENT_TIMESTAMP
      AND session.expires_at > CURRENT_TIMESTAMP
      AND admin.status = 'active'
    GROUP BY session.id, admin.id
$function$;

ALTER FUNCTION app.lookup_admin_auth(bytea) OWNER TO wifi_migrator;
ALTER FUNCTION app.resolve_admin_session(bytea) OWNER TO wifi_migrator;
REVOKE ALL ON FUNCTION app.lookup_admin_auth(bytea), app.resolve_admin_session(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lookup_admin_auth(bytea), app.resolve_admin_session(bytea) TO wifi_app_runtime;

-- Cross-tenant worker queues. Each claim gets an unguessable per-row token;
-- complete/fail operations are compare-and-swap on that token. The caller has
-- no direct table privilege and cannot select another tenant's queued rows.
CREATE OR REPLACE FUNCTION app.claim_outbox_events(
    p_worker_id uuid,
    p_limit integer DEFAULT 100,
    p_lease_seconds integer DEFAULT 60
)
RETURNS TABLE (
    tenant_id uuid,
    event_id uuid,
    claim_token uuid,
    event jsonb,
    lease_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, audit
SET row_security = off
AS $function$
BEGIN
    IF p_worker_id IS NULL OR p_limit NOT BETWEEN 1 AND 500 OR p_lease_seconds NOT BETWEEN 5 AND 900 THEN
        RAISE EXCEPTION 'invalid outbox claim parameters' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH candidates AS (
        SELECT queued.tenant_id, queued.id
        FROM app.outbox_events AS queued
        WHERE queued.published_at IS NULL
          AND queued.available_at <= clock_timestamp()
          AND (queued.claim_token IS NULL OR queued.lease_expires_at <= clock_timestamp())
        ORDER BY queued.available_at, queued.occurred_at, queued.id
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    ), claimed AS (
        UPDATE app.outbox_events AS queued
           SET claim_token = uuidv7(),
               claimed_by = p_worker_id,
               claimed_at = clock_timestamp(),
               lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
               attempts = queued.attempts + 1
          FROM candidates
         WHERE queued.tenant_id = candidates.tenant_id
           AND queued.id = candidates.id
        RETURNING queued.*
    ), audited AS (
        INSERT INTO audit.audit_logs (
            tenant_id, actor_type, actor_id, action, resource_type, resource_id,
            scope, after_redacted, correlation_id, reason, occurred_at
        )
        SELECT
            claimed.tenant_id, 'service', p_worker_id, 'outbox.claim',
            'outbox_event', claimed.id,
            jsonb_build_object('claimToken', claimed.claim_token, 'attempt', claimed.attempts),
            jsonb_build_object('leaseExpiresAt', claimed.lease_expires_at),
            claimed.claim_token, 'Bounded SKIP LOCKED lease', clock_timestamp()
        FROM claimed
        RETURNING id
    )
    SELECT
        claimed.tenant_id,
        claimed.id,
        claimed.claim_token,
        jsonb_build_object(
            'aggregateType', claimed.aggregate_type,
            'aggregateId', claimed.aggregate_id,
            'eventType', claimed.event_type,
            'eventVersion', claimed.event_version,
            'payload', claimed.payload,
            'occurredAt', claimed.occurred_at,
            'attempt', claimed.attempts
        ),
        claimed.lease_expires_at
    FROM claimed;
END
$function$;

CREATE OR REPLACE FUNCTION app.complete_outbox_event(
    p_worker_id uuid,
    p_tenant_id uuid,
    p_event_id uuid,
    p_claim_token uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, audit
SET row_security = off
AS $function$
DECLARE
    completed app.outbox_events%ROWTYPE;
BEGIN
    UPDATE app.outbox_events AS queued
       SET published_at = clock_timestamp(),
           claim_token = NULL,
           claimed_by = NULL,
           claimed_at = NULL,
           lease_expires_at = NULL,
           last_error = NULL
     WHERE queued.tenant_id = p_tenant_id
       AND queued.id = p_event_id
       AND queued.claim_token = p_claim_token
       AND queued.claimed_by = p_worker_id
       AND queued.published_at IS NULL
    RETURNING queued.* INTO completed;

    IF NOT FOUND THEN
        IF NOT EXISTS (
            SELECT 1 FROM app.outbox_events AS queued
            WHERE queued.tenant_id = p_tenant_id AND queued.id = p_event_id
        ) THEN
            RETURN 'not_found';
        ELSIF EXISTS (
            SELECT 1 FROM app.outbox_events AS queued
            WHERE queued.tenant_id = p_tenant_id AND queued.id = p_event_id
              AND queued.published_at IS NOT NULL
        ) THEN
            RETURN 'already_applied';
        END IF;
        RETURN 'claim_lost';
    END IF;

    INSERT INTO audit.audit_logs (
        tenant_id, actor_type, actor_id, action, resource_type, resource_id,
        scope, correlation_id, reason, occurred_at
    ) VALUES (
        completed.tenant_id, 'service', p_worker_id, 'outbox.complete',
        'outbox_event', completed.id, jsonb_build_object('attempt', completed.attempts),
        p_claim_token, 'Claim token CAS', clock_timestamp()
    );
    RETURN 'completed';
END
$function$;

CREATE OR REPLACE FUNCTION app.read_claimed_outbox_event(
    p_worker_id uuid,
    p_tenant_id uuid,
    p_event_id uuid,
    p_claim_token uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
SET row_security = off
AS $function$
    SELECT COALESCE(
        (
            SELECT jsonb_build_object(
                'result', 'claimed',
                'event', jsonb_build_object(
                    'aggregateType', queued.aggregate_type,
                    'aggregateId', queued.aggregate_id,
                    'eventType', queued.event_type,
                    'eventVersion', queued.event_version,
                    'payload', queued.payload,
                    'occurredAt', queued.occurred_at,
                    'attempt', queued.attempts,
                    'leaseExpiresAt', queued.lease_expires_at
                )
            )
            FROM app.outbox_events AS queued
            WHERE queued.tenant_id = p_tenant_id
              AND queued.id = p_event_id
              AND queued.claimed_by = p_worker_id
              AND queued.claim_token = p_claim_token
              AND queued.published_at IS NULL
        ),
        (
            SELECT jsonb_build_object(
                'result', CASE WHEN queued.published_at IS NOT NULL
                    THEN 'already_applied' ELSE 'claim_lost' END
            )
            FROM app.outbox_events AS queued
            WHERE queued.tenant_id = p_tenant_id AND queued.id = p_event_id
        ),
        jsonb_build_object('result', 'not_found')
    )
$function$;

CREATE OR REPLACE FUNCTION app.fail_outbox_event(
    p_worker_id uuid,
    p_tenant_id uuid,
    p_event_id uuid,
    p_claim_token uuid,
    p_error text,
    p_retry_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, audit
SET row_security = off
AS $function$
DECLARE
    failed app.outbox_events%ROWTYPE;
BEGIN
    IF p_retry_at IS NULL THEN
        RAISE EXCEPTION 'retry timestamp is required' USING ERRCODE = '22023';
    END IF;
    UPDATE app.outbox_events AS queued
       SET available_at = GREATEST(p_retry_at, clock_timestamp()),
           claim_token = NULL,
           claimed_by = NULL,
           claimed_at = NULL,
           lease_expires_at = NULL,
           last_error = left(COALESCE(p_error, 'unspecified worker failure'), 2000)
     WHERE queued.tenant_id = p_tenant_id
       AND queued.id = p_event_id
       AND queued.claim_token = p_claim_token
       AND queued.claimed_by = p_worker_id
       AND queued.published_at IS NULL
    RETURNING queued.* INTO failed;
    IF NOT FOUND THEN RETURN false; END IF;

    INSERT INTO audit.audit_logs (
        tenant_id, actor_type, actor_id, action, resource_type, resource_id,
        scope, correlation_id, reason, occurred_at
    ) VALUES (
        failed.tenant_id, 'service', p_worker_id, 'outbox.fail',
        'outbox_event', failed.id,
        jsonb_build_object('attempt', failed.attempts, 'retryAt', failed.available_at),
        p_claim_token, left(COALESCE(p_error, 'unspecified worker failure'), 300), clock_timestamp()
    );
    RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION radius_runtime.claim_accounting_events(
    p_worker_id uuid,
    p_limit integer DEFAULT 100,
    p_lease_seconds integer DEFAULT 60
)
RETURNS TABLE (
    tenant_id uuid,
    event_id uuid,
    claim_token uuid,
    event jsonb,
    lease_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, radius_runtime, audit
SET row_security = off
AS $function$
BEGIN
    IF p_worker_id IS NULL OR p_limit NOT BETWEEN 1 AND 500 OR p_lease_seconds NOT BETWEEN 5 AND 900 THEN
        RAISE EXCEPTION 'invalid accounting claim parameters' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH candidates AS (
        SELECT inbox.tenant_id, inbox.id
        FROM radius_runtime.accounting_inbox AS inbox
        WHERE inbox.processed_at IS NULL
          AND inbox.available_at <= clock_timestamp()
          AND (inbox.claim_token IS NULL OR inbox.lease_expires_at <= clock_timestamp())
        ORDER BY inbox.received_at, inbox.id
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    ), claimed AS (
        UPDATE radius_runtime.accounting_inbox AS inbox
           SET claim_token = uuidv7(),
               claimed_by = p_worker_id,
               claimed_at = clock_timestamp(),
               lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
               processing_attempts = inbox.processing_attempts + 1
          FROM candidates
         WHERE inbox.tenant_id = candidates.tenant_id
           AND inbox.id = candidates.id
        RETURNING inbox.*
    ), audited AS (
        INSERT INTO audit.audit_logs (
            tenant_id, actor_type, actor_id, action, resource_type, resource_id,
            scope, correlation_id, reason, occurred_at
        )
        SELECT
            claimed.tenant_id, 'service', p_worker_id, 'accounting.claim',
            'accounting_event', claimed.id,
            jsonb_build_object('claimToken', claimed.claim_token, 'attempt', claimed.processing_attempts),
            claimed.claim_token, 'Bounded SKIP LOCKED lease', clock_timestamp()
        FROM claimed
        RETURNING id
    )
    SELECT
        claimed.tenant_id,
        claimed.id,
        claimed.claim_token,
        jsonb_build_object(
            'gatewayId', claimed.gateway_id,
            'authorizationId', claimed.authorization_id,
            'acctSessionId', claimed.acct_session_id,
            'statusType', claimed.status_type,
            'receivedAt', claimed.received_at,
            'nasEventAt', claimed.nas_event_at,
            'sessionTimeSeconds', claimed.session_time_seconds,
            'nasInputOctets', claimed.nas_input_octets,
            'nasOutputOctets', claimed.nas_output_octets,
            'classValue', claimed.class_value,
            'terminateCause', claimed.terminate_cause,
            'attempt', claimed.processing_attempts
        ),
        claimed.lease_expires_at
    FROM claimed;
END
$function$;

CREATE OR REPLACE FUNCTION radius_runtime.complete_accounting_event(
    p_worker_id uuid,
    p_tenant_id uuid,
    p_event_id uuid,
    p_claim_token uuid
)
RETURNS TABLE (result text, session_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, radius_runtime, audit
SET row_security = off
AS $function$
DECLARE
    source radius_runtime.accounting_inbox%ROWTYPE;
    session_row app.radius_sessions%ROWTYPE;
    effective_at timestamptz;
    inferred_start timestamptz;
BEGIN
    SELECT inbox.* INTO source
    FROM radius_runtime.accounting_inbox AS inbox
    WHERE inbox.tenant_id = p_tenant_id
      AND inbox.id = p_event_id
      AND inbox.claim_token = p_claim_token
      AND inbox.claimed_by = p_worker_id
      AND inbox.processed_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
        SELECT
            CASE
                WHEN inbox.processed_at IS NOT NULL THEN 'already_applied'
                ELSE 'claim_lost'
            END,
            inbox.session_id
          INTO result, session_id
          FROM radius_runtime.accounting_inbox AS inbox
         WHERE inbox.tenant_id = p_tenant_id AND inbox.id = p_event_id;
        IF NOT FOUND THEN result := 'not_found'; session_id := NULL; END IF;
        RETURN NEXT;
        RETURN;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
        concat_ws('|', source.tenant_id::text, source.gateway_id::text, source.acct_session_id), 0
    ));
    effective_at := COALESCE(source.nas_event_at, source.received_at - make_interval(secs => source.acct_delay_seconds));
    inferred_start := effective_at - make_interval(
        secs => LEAST(COALESCE(source.session_time_seconds, 0), 3155760000)::double precision
    );

    SELECT existing.* INTO session_row
    FROM app.radius_sessions AS existing
    WHERE existing.tenant_id = source.tenant_id
      AND existing.gateway_id = source.gateway_id
      AND existing.acct_session_id = source.acct_session_id
    ORDER BY (existing.stopped_at IS NULL) DESC, existing.started_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND
       AND session_row.stopped_at IS NOT NULL
       AND source.status_type = 'Start'
       AND effective_at > session_row.stopped_at + interval '5 minutes' THEN
        session_row.id := NULL;
    END IF;

    IF session_row.id IS NULL THEN
        INSERT INTO app.radius_sessions (
            id, tenant_id, gateway_id, authorization_id, acct_session_id,
            class_value, state, started_at, last_interim_at, stopped_at,
            input_octets, output_octets, terminate_cause, created_at, updated_at
        ) VALUES (
            uuidv7(), source.tenant_id, source.gateway_id, source.authorization_id,
            source.acct_session_id, source.class_value,
            CASE source.status_type WHEN 'Stop' THEN 'stopped' WHEN 'Interim-Update' THEN 'orphaned' ELSE 'active' END,
            CASE WHEN source.status_type = 'Start' THEN effective_at ELSE inferred_start END,
            CASE WHEN source.status_type = 'Interim-Update' THEN effective_at END,
            CASE WHEN source.status_type = 'Stop' THEN effective_at END,
            source.nas_input_octets, source.nas_output_octets,
            CASE WHEN source.status_type = 'Stop' THEN source.terminate_cause END,
            clock_timestamp(), clock_timestamp()
        ) RETURNING * INTO session_row;
    ELSE
        UPDATE app.radius_sessions AS existing
           SET authorization_id = COALESCE(existing.authorization_id, source.authorization_id),
               class_value = COALESCE(source.class_value, existing.class_value),
               state = CASE
                   WHEN source.status_type = 'Stop' THEN 'stopped'
                   WHEN existing.stopped_at IS NOT NULL THEN existing.state
                   WHEN source.status_type = 'Start' THEN 'active'
                   ELSE existing.state
               END,
               started_at = LEAST(existing.started_at,
                   CASE WHEN source.status_type = 'Start' THEN effective_at ELSE inferred_start END),
               last_interim_at = CASE WHEN source.status_type = 'Interim-Update'
                   THEN GREATEST(COALESCE(existing.last_interim_at, effective_at), effective_at)
                   ELSE existing.last_interim_at END,
               stopped_at = CASE WHEN source.status_type = 'Stop'
                   THEN GREATEST(COALESCE(existing.stopped_at, effective_at), effective_at)
                   ELSE existing.stopped_at END,
               input_octets = GREATEST(existing.input_octets, source.nas_input_octets),
               output_octets = GREATEST(existing.output_octets, source.nas_output_octets),
               terminate_cause = CASE WHEN source.status_type = 'Stop'
                   THEN COALESCE(source.terminate_cause, existing.terminate_cause)
                   ELSE existing.terminate_cause END,
               updated_at = clock_timestamp()
         WHERE existing.id = session_row.id
        RETURNING existing.* INTO session_row;
    END IF;

    UPDATE radius_runtime.accounting_inbox AS inbox
       SET session_id = session_row.id,
           processed_at = clock_timestamp(),
           processing_error = NULL,
           claim_token = NULL,
           claimed_by = NULL,
           claimed_at = NULL,
           lease_expires_at = NULL
     WHERE inbox.id = source.id AND inbox.tenant_id = source.tenant_id;

    INSERT INTO audit.audit_logs (
        tenant_id, actor_type, actor_id, action, resource_type, resource_id,
        scope, correlation_id, reason, occurred_at
    ) VALUES (
        source.tenant_id, 'service', p_worker_id, 'accounting.reconcile',
        'radius_session', session_row.id,
        jsonb_build_object('eventId', source.id, 'statusType', source.status_type),
        p_claim_token, 'Idempotent session projection', clock_timestamp()
    );
    result := 'completed';
    session_id := session_row.id;
    RETURN NEXT;
END
$function$;

CREATE OR REPLACE FUNCTION radius_runtime.fail_accounting_event(
    p_worker_id uuid,
    p_tenant_id uuid,
    p_event_id uuid,
    p_claim_token uuid,
    p_error text,
    p_retry_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, radius_runtime, audit
SET row_security = off
AS $function$
DECLARE
    failed radius_runtime.accounting_inbox%ROWTYPE;
BEGIN
    IF p_retry_at IS NULL THEN
        RAISE EXCEPTION 'retry timestamp is required' USING ERRCODE = '22023';
    END IF;
    UPDATE radius_runtime.accounting_inbox AS inbox
       SET processing_error = left(COALESCE(p_error, 'unspecified worker failure'), 2000),
           available_at = GREATEST(p_retry_at, clock_timestamp()),
           claim_token = NULL,
           claimed_by = NULL,
           claimed_at = NULL,
           lease_expires_at = NULL
     WHERE inbox.tenant_id = p_tenant_id
       AND inbox.id = p_event_id
       AND inbox.claim_token = p_claim_token
       AND inbox.claimed_by = p_worker_id
       AND inbox.processed_at IS NULL
    RETURNING inbox.* INTO failed;
    IF NOT FOUND THEN RETURN false; END IF;

    INSERT INTO audit.audit_logs (
        tenant_id, actor_type, actor_id, action, resource_type, resource_id,
        scope, correlation_id, reason, occurred_at
    ) VALUES (
        failed.tenant_id, 'service', p_worker_id, 'accounting.fail',
        'accounting_event', failed.id,
        jsonb_build_object('attempt', failed.processing_attempts),
        p_claim_token, left(COALESCE(p_error, 'unspecified worker failure'), 300), clock_timestamp()
    );
    RETURN true;
END
$function$;

ALTER FUNCTION app.claim_outbox_events(uuid, integer, integer) OWNER TO wifi_migrator;
ALTER FUNCTION app.complete_outbox_event(uuid, uuid, uuid, uuid) OWNER TO wifi_migrator;
ALTER FUNCTION app.read_claimed_outbox_event(uuid, uuid, uuid, uuid) OWNER TO wifi_migrator;
ALTER FUNCTION app.fail_outbox_event(uuid, uuid, uuid, uuid, text, timestamptz) OWNER TO wifi_migrator;
ALTER FUNCTION radius_runtime.claim_accounting_events(uuid, integer, integer) OWNER TO wifi_migrator;
ALTER FUNCTION radius_runtime.complete_accounting_event(uuid, uuid, uuid, uuid) OWNER TO wifi_migrator;
ALTER FUNCTION radius_runtime.fail_accounting_event(uuid, uuid, uuid, uuid, text, timestamptz) OWNER TO wifi_migrator;

REVOKE ALL ON FUNCTION
    app.claim_outbox_events(uuid, integer, integer),
    app.complete_outbox_event(uuid, uuid, uuid, uuid),
    app.read_claimed_outbox_event(uuid, uuid, uuid, uuid),
    app.fail_outbox_event(uuid, uuid, uuid, uuid, text, timestamptz),
    radius_runtime.claim_accounting_events(uuid, integer, integer),
    radius_runtime.complete_accounting_event(uuid, uuid, uuid, uuid),
    radius_runtime.fail_accounting_event(uuid, uuid, uuid, uuid, text, timestamptz)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    app.claim_outbox_events(uuid, integer, integer),
    app.complete_outbox_event(uuid, uuid, uuid, uuid),
    app.read_claimed_outbox_event(uuid, uuid, uuid, uuid),
    app.fail_outbox_event(uuid, uuid, uuid, uuid, text, timestamptz),
    radius_runtime.claim_accounting_events(uuid, integer, integer),
    radius_runtime.complete_accounting_event(uuid, uuid, uuid, uuid),
    radius_runtime.fail_accounting_event(uuid, uuid, uuid, uuid, text, timestamptz)
TO wifi_worker;

-- ---------------------------------------------------------------------------
-- Immutability and audit-integrity triggers.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.reject_row_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
    RAISE EXCEPTION '% is append-only: % is forbidden', TG_TABLE_NAME, TG_OP
        USING ERRCODE = '55000';
END
$function$;

CREATE TRIGGER legal_acceptances_append_only
    BEFORE UPDATE OR DELETE ON app.legal_acceptances
    FOR EACH ROW EXECUTE FUNCTION app.reject_row_mutation();
CREATE TRIGGER consent_events_append_only
    BEFORE UPDATE OR DELETE ON app.consent_events
    FOR EACH ROW EXECUTE FUNCTION app.reject_row_mutation();

CREATE OR REPLACE FUNCTION app.protect_published_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
    IF OLD.status = 'published' THEN
        RAISE EXCEPTION 'published % row cannot be changed or deleted', TG_TABLE_NAME
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER access_policy_versions_published_immutable
    BEFORE UPDATE OR DELETE ON app.access_policy_versions
    FOR EACH ROW EXECUTE FUNCTION app.protect_published_version();
CREATE TRIGGER portal_versions_published_immutable
    BEFORE UPDATE OR DELETE ON app.portal_versions
    FOR EACH ROW EXECUTE FUNCTION app.protect_published_version();
CREATE TRIGGER legal_versions_published_immutable
    BEFORE UPDATE OR DELETE ON app.legal_versions
    FOR EACH ROW EXECUTE FUNCTION app.protect_published_version();

CREATE OR REPLACE FUNCTION radius_runtime.protect_accounting_inbox()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'accounting_inbox is append-only: DELETE is forbidden'
            USING ERRCODE = '55000';
    END IF;
    IF (to_jsonb(NEW) - ARRAY[
           'session_id', 'claim_token', 'claimed_by', 'claimed_at',
           'lease_expires_at', 'processing_attempts', 'available_at', 'processed_at', 'processing_error'
       ])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY[
           'session_id', 'claim_token', 'claimed_by', 'claimed_at',
           'lease_expires_at', 'processing_attempts', 'available_at', 'processed_at', 'processing_error'
       ]) THEN
        RAISE EXCEPTION 'only accounting claim/projection metadata may be updated'
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER accounting_inbox_immutable_payload
    BEFORE UPDATE OR DELETE ON radius_runtime.accounting_inbox
    FOR EACH ROW EXECUTE FUNCTION radius_runtime.protect_accounting_inbox();

CREATE TRIGGER post_auth_inbox_append_only
    BEFORE UPDATE OR DELETE ON radius_runtime.post_auth_inbox
    FOR EACH ROW EXECUTE FUNCTION app.reject_row_mutation();

CREATE OR REPLACE FUNCTION audit.prepare_audit_hash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, audit
SET row_security = off
AS $function$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text, 0));

    SELECT log.row_hash
      INTO NEW.previous_hash
      FROM audit.audit_logs AS log
     WHERE log.tenant_id = NEW.tenant_id
     ORDER BY log.occurred_at DESC, log.id DESC
     LIMIT 1;

    NEW.row_hash := encode(
        sha256(
            convert_to(
                concat_ws('|',
                    NEW.tenant_id::text,
                    NEW.id::text,
                    COALESCE(NEW.previous_hash, ''),
                    NEW.actor_type,
                    COALESCE(NEW.actor_id::text, ''),
                    NEW.action,
                    NEW.resource_type,
                    COALESCE(NEW.resource_id::text, ''),
                    NEW.scope::text,
                    COALESCE(NEW.before_redacted::text, ''),
                    COALESCE(NEW.after_redacted::text, ''),
                    COALESCE(encode(NEW.source_ip_hmac, 'hex'), ''),
                    NEW.correlation_id::text,
                    COALESCE(NEW.reason, ''),
                    NEW.occurred_at::text
                ),
                'UTF8'
            )
        ),
        'hex'
    );
    RETURN NEW;
END
$function$;

ALTER FUNCTION audit.prepare_audit_hash() OWNER TO wifi_migrator;
REVOKE ALL ON FUNCTION audit.prepare_audit_hash() FROM PUBLIC;

CREATE TRIGGER audit_logs_hash_before_insert
    BEFORE INSERT ON audit.audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit.prepare_audit_hash();
CREATE TRIGGER audit_logs_append_only
    BEFORE UPDATE OR DELETE ON audit.audit_logs
    FOR EACH ROW EXECUTE FUNCTION app.reject_row_mutation();

-- ---------------------------------------------------------------------------
-- Privileges. Login identities are created outside migrations and receive one
-- group role only. Public receives no schema/table/function access.
-- ---------------------------------------------------------------------------

REVOKE ALL ON SCHEMA app, audit, radius_runtime FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA app, audit, radius_runtime FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app, audit, radius_runtime FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.valid_https_origins(text[]), app.valid_recovery_hashes(bytea[])
    TO wifi_app_runtime, wifi_worker;

GRANT USAGE ON SCHEMA app TO wifi_app_runtime, wifi_worker, wifi_export_worker, wifi_backup, wifi_monitoring;
GRANT USAGE ON SCHEMA audit TO wifi_app_runtime, wifi_worker, wifi_audit_writer, wifi_export_worker, wifi_backup;
GRANT USAGE ON SCHEMA radius_runtime TO wifi_app_runtime, wifi_worker, wifi_radius_runtime, wifi_backup, wifi_monitoring;
GRANT USAGE, CREATE ON SCHEMA app, audit, radius_runtime TO wifi_migrator;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO wifi_app_runtime, wifi_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON radius_runtime.credentials, radius_runtime.reply_attributes, radius_runtime.nas_registry TO wifi_app_runtime, wifi_worker;
GRANT SELECT ON radius_runtime.post_auth_inbox TO wifi_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA radius_runtime TO wifi_app_runtime, wifi_worker;

GRANT INSERT ON audit.audit_logs TO wifi_app_runtime, wifi_worker, wifi_audit_writer;
GRANT SELECT ON audit.audit_logs TO wifi_worker, wifi_export_worker;

GRANT SELECT ON app.permission_catalog TO wifi_app_runtime, wifi_worker;
GRANT SELECT ON ALL TABLES IN SCHEMA app, audit TO wifi_export_worker;
GRANT INSERT, UPDATE ON app.exports TO wifi_export_worker;
REVOKE ALL ON app.admin_credentials, app.admin_sessions, app.admin_totp_factors, app.admin_webauthn_credentials
    FROM wifi_worker;
REVOKE ALL ON app.outbox_events FROM wifi_worker;
REVOKE ALL ON radius_runtime.accounting_inbox FROM wifi_worker;
REVOKE SELECT ON app.admin_credentials, app.admin_sessions, app.admin_totp_factors, app.admin_webauthn_credentials
    FROM wifi_export_worker;

GRANT SELECT (
    id, runtime_id, tenant_id, gateway_id, authorization_id, username,
    nas_identifier, calling_station_id, verifier_attribute, verifier_value,
    not_before, expires_at, enabled
) ON radius_runtime.credentials TO wifi_radius_runtime;
GRANT SELECT (
    runtime_id, tenant_id, credential_id, attribute, op, value, priority
) ON radius_runtime.reply_attributes TO wifi_radius_runtime;
GRANT SELECT ON radius_runtime.radcheck_compat, radius_runtime.radreply_compat TO wifi_radius_runtime;
GRANT INSERT ON radius_runtime.accounting_inbox, radius_runtime.post_auth_inbox TO wifi_radius_runtime;
GRANT SELECT (tenant_id, event_fingerprint) ON radius_runtime.accounting_inbox TO wifi_radius_runtime;

GRANT SELECT ON ALL TABLES IN SCHEMA app, audit, radius_runtime TO wifi_backup;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA app, audit, radius_runtime TO wifi_migrator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA app, audit, radius_runtime TO wifi_migrator;

ALTER DEFAULT PRIVILEGES IN SCHEMA app, audit, radius_runtime REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app, audit, radius_runtime REVOKE ALL ON FUNCTIONS FROM PUBLIC;

COMMENT ON SCHEMA radius_runtime IS 'Versioned production FreeRADIUS contract; the lab schema must mirror this migration.';
COMMENT ON TABLE radius_runtime.credentials IS 'Ephemeral AAA verifier bound to NAS-Identifier and optional normalized Calling-Station-Id.';
COMMENT ON COLUMN radius_runtime.credentials.verifier_attribute IS 'Allowlisted FreeRADIUS PAP verifier attribute; prefer Crypt-Password unless a physical lab validates another choice.';
COMMENT ON TABLE radius_runtime.reply_attributes IS 'Precompiled, allowlisted RADIUS reply attributes linked to one credential.';
COMMENT ON TABLE radius_runtime.accounting_inbox IS 'Raw redacted accounting inbox; immutable payload with idempotent fingerprint.';
COMMENT ON COLUMN radius_runtime.accounting_inbox.nas_input_octets IS 'Raw NAS direction; map to user upload/download only after physical-lab evidence.';
COMMENT ON COLUMN radius_runtime.accounting_inbox.nas_output_octets IS 'Raw NAS direction; map to user upload/download only after physical-lab evidence.';
COMMENT ON TABLE radius_runtime.post_auth_inbox IS 'Append-only minimal post-auth telemetry without plaintext contact identifiers.';
COMMENT ON TABLE app.gateway_captive_locators IS 'Rotatable public captive locator; only a SHA-256 digest is stored, never NAS-Identifier or the bearer value.';
COMMENT ON FUNCTION app.resolve_captive_locator(bytea) IS 'Exact digest lookup exposing only tenant/gateway/site routing and allowlisted HTTPS login origins.';
COMMENT ON ROLE wifi_backup IS 'NOLOGIN automation role; explicit RLS-bypass exception for complete encrypted backups.';
