import { createHash } from "node:crypto";

import pg from "pg";

import { SYNTHETIC_IDS as id } from "./seed-data.js";

const { Pool } = pg;

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Synthetic seed is forbidden in production");
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const now = new Date();
  const inTenMinutes = new Date(now.getTime() + 10 * 60_000);
  const inThirtyMinutes = new Date(now.getTime() + 30 * 60_000);
  const inEightHours = new Date(now.getTime() + 8 * 60 * 60_000);
  const inTwoHours = new Date(now.getTime() + 2 * 60 * 60_000);
  const inThirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60_000);
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL row_security = off");

    await client.query(
      `INSERT INTO app.tenants
         (id, slug, name, status, data_region, default_timezone, created_at, updated_at)
       VALUES
         ($1, 'synthetic-alpha', 'Synthetic Alpha Hotel', 'active', 'eu-es', 'Europe/Madrid', $3, $3),
         ($2, 'synthetic-beta', 'Synthetic Beta Company', 'active', 'eu-es', 'Europe/Madrid', $3, $3)
       ON CONFLICT (id) DO NOTHING`,
      [id.tenantA, id.tenantB, now],
    );

    await client.query(
      `INSERT INTO app.admin_users
         (id, email_ciphertext, email_key_version, email_hmac, status, created_at, updated_at)
       VALUES
         ($1, $3, 'synthetic-kek-v1', $5, 'active', $7, $7),
         ($2, $4, 'synthetic-kek-v1', $6, 'active', $7, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        id.adminUser,
        id.adminUserB,
        Buffer.from("synthetic-ciphertext-not-production", "utf8"),
        Buffer.from("synthetic-ciphertext-b-not-production", "utf8"),
        sha256("synthetic.admin@example.invalid"),
        sha256("synthetic.admin.b@example.invalid"),
        now,
      ],
    );

    await client.query(
      `INSERT INTO app.tenant_memberships
         (id, tenant_id, user_id, status, created_at, updated_at)
       VALUES
         ($1, $3, $5, 'active', $6, $6),
         ($2, $4, $7, 'active', $6, $6)
       ON CONFLICT (id) DO NOTHING`,
      [id.membershipA, id.membershipB, id.tenantA, id.tenantB, id.adminUser, now, id.adminUserB],
    );

    await client.query(
      `INSERT INTO app.admin_credentials
         (id, user_id, password_hash, hash_algorithm, hash_version, password_changed_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'scrypt', 1, $4, $4, $4)
       ON CONFLICT (id) DO NOTHING`,
      [
        id.adminCredentialA,
        id.adminUser,
        "$scrypt$ln=17,r=8,p=1,l=32$mDqgGlaMFklqak2nLzCwvQ$IFsPNd-alc97eoaMG-tecl__b4sm97RXUQzKleFaRNo",
        now,
      ],
    );

    await client.query(
      `INSERT INTO app.admin_sessions
         (id, user_id, token_hash, auth_strength, mfa_verified_at,
          ip_ciphertext, ip_hmac, user_agent_ciphertext, user_agent_hmac,
          last_seen_at, idle_expires_at, expires_at, created_at)
       VALUES ($1, $2, $3, 'totp', $4, $5, $6, $7, $8, $4, $9, $10, $4)
       ON CONFLICT (id) DO NOTHING`,
      [
        id.adminSessionA,
        id.adminUser,
        sha256("synthetic-session-token-never-used"),
        now,
        Buffer.from("synthetic-encrypted-documentation-ip", "utf8"),
        sha256("192.0.2.10"),
        Buffer.from("synthetic-encrypted-user-agent", "utf8"),
        sha256("Synthetic Test Agent"),
        inThirtyMinutes,
        inEightHours,
      ],
    );

    await client.query(
      `INSERT INTO app.admin_totp_factors
         (id, user_id, label, secret_ciphertext, key_version, recovery_code_hashes,
          verified_at, created_at)
       VALUES ($1, $2, 'Synthetic authenticator', $3, 'synthetic-kek-v1', $4::bytea[], $5, $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        id.adminTotpA,
        id.adminUser,
        Buffer.from("synthetic-ciphertext-not-a-totp-secret", "utf8"),
        [sha256("synthetic-recovery-code-already-hashed")],
        now,
      ],
    );

    await client.query(
      `INSERT INTO app.admin_webauthn_credentials
         (id, user_id, label, credential_id, public_key_cose, sign_count,
          transports, backup_eligible, backup_state, created_at)
       VALUES ($1, $2, 'Synthetic passkey', $3, $4, 0,
               ARRAY['internal']::text[], true, false, $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        id.adminWebAuthnA,
        id.adminUser,
        sha256("synthetic-webauthn-credential-id"),
        Buffer.from("synthetic-cose-public-key-not-valid", "utf8"),
        now,
      ],
    );

    await client.query(
      `INSERT INTO app.organizations
         (id, tenant_id, code, name, status, created_at, updated_at)
       VALUES
         ($1, $3, 'ALPHA', 'Synthetic Alpha Chain', 'active', $5, $5),
         ($2, $4, 'BETA', 'Synthetic Beta Organization', 'active', $5, $5)
       ON CONFLICT (id) DO NOTHING`,
      [id.organizationA, id.organizationB, id.tenantA, id.tenantB, now],
    );

    await client.query(
      `INSERT INTO app.site_groups
         (id, tenant_id, organization_id, name, created_at, updated_at)
       VALUES ($1, $2, $3, 'Synthetic Madrid Region', $4, $4)
       ON CONFLICT (id) DO NOTHING`,
      [id.siteGroupA, id.tenantA, id.organizationA, now],
    );

    await client.query(
      `INSERT INTO app.sites
         (id, tenant_id, organization_id, config_parent_group_id, code, name, status,
          timezone, country_code, languages, branding, created_at, updated_at)
       VALUES
         ($1, $3, $5, $7, 'MAD-001', 'Synthetic Alpha Madrid', 'active',
          'Europe/Madrid', 'ES', ARRAY['es','en'], '{"primary":"#003B5C"}'::jsonb, $8, $8),
         ($2, $4, $6, NULL, 'BCN-001', 'Synthetic Beta Barcelona', 'active',
          'Europe/Madrid', 'ES', ARRAY['es'], '{}'::jsonb, $8, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        id.siteA,
        id.siteB,
        id.tenantA,
        id.tenantB,
        id.organizationA,
        id.organizationB,
        id.siteGroupA,
        now,
      ],
    );

    await client.query(
      `INSERT INTO app.site_group_sites
         (id, tenant_id, site_group_id, site_id, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [id.siteGroupSiteA, id.tenantA, id.siteGroupA, id.siteA, now],
    );

    await client.query(
      `INSERT INTO app.zones
         (id, tenant_id, site_id, name, kind, created_at, updated_at)
       VALUES
         ($1, $3, $5, 'Guest Lobby', 'guest', $7, $7),
         ($2, $4, $6, 'Guest Office', 'guest', $7, $7)
       ON CONFLICT (id) DO NOTHING`,
      [id.zoneA, id.zoneB, id.tenantA, id.tenantB, id.siteA, id.siteB, now],
    );

    await client.query(
      `INSERT INTO app.ssids (id, tenant_id, zone_id, name, instructions, created_at)
       VALUES ($1, $2, $3, 'ENTELSAT-SYNTHETIC', '{}'::jsonb, $4)
       ON CONFLICT (id) DO NOTHING`,
      [id.ssidA, id.tenantA, id.zoneA, now],
    );

    await client.query(
      `INSERT INTO app.gateways
         (id, tenant_id, site_id, name, model, serial, routeros_version, architecture,
          nas_identifier, status, created_at, updated_at)
       VALUES
         ($1, $3, $5, 'Synthetic Gateway A', 'CHR', 'SYNTH-A', '7.x-lab', 'x86_64', 'nas-synthetic-alpha', 'online', $7, $7),
         ($2, $4, $6, 'Synthetic Gateway B', 'CHR', 'SYNTH-B', '7.x-lab', 'x86_64', 'nas-synthetic-beta', 'pending', $7, $7)
       ON CONFLICT (id) DO NOTHING`,
      [id.gatewayA, id.gatewayB, id.tenantA, id.tenantB, id.siteA, id.siteB, now],
    );

    await client.query(
      `INSERT INTO app.gateway_captive_locators
         (id, tenant_id, gateway_id, locator_hash, allowed_login_origins,
          not_before, expires_at, created_at)
       VALUES ($1, $2, $3, $4, ARRAY['https://portal.synthetic.invalid']::text[],
               $5, $6, $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        id.gatewayCaptiveLocatorA,
        id.tenantA,
        id.gatewayA,
        sha256("synthetic-public-captive-locator-never-used"),
        now,
        inThirtyDays,
      ],
    );

    await client.query(
      `INSERT INTO app.gateway_zone_bindings
         (id, tenant_id, gateway_id, zone_id, bridge_name, vlan_id, subnet_cidr, pool_range, created_at)
       VALUES ($1, $2, $3, $4, 'bridge-guest', 100, '10.77.0.1/24'::inet, '10.77.0.10-10.77.0.200', $5)
       ON CONFLICT (id) DO NOTHING`,
      [id.gatewayBindingA, id.tenantA, id.gatewayA, id.zoneA, now],
    );

    await client.query(
      `INSERT INTO app.access_policies
         (id, tenant_id, name, status, created_at, updated_at)
       VALUES ($1, $2, 'Synthetic Guest 2h', 'active', $3, $3)
       ON CONFLICT (id) DO NOTHING`,
      [id.policyA, id.tenantA, now],
    );

    await client.query(
      `INSERT INTO app.access_policy_versions
         (id, tenant_id, policy_id, version, status, total_duration_seconds,
          session_timeout_seconds, idle_timeout_seconds, download_kbps, upload_kbps,
          max_concurrent_devices, snapshot, published_at, created_at)
       VALUES ($1, $2, $3, 1, 'published', 7200, 7200, 600, 10000, 2000, 1,
               '{"synthetic":true}'::jsonb, $4, $4)
       ON CONFLICT (id) DO NOTHING`,
      [id.policyVersionA, id.tenantA, id.policyA, now],
    );

    await client.query(
      `INSERT INTO app.policy_assignments
         (id, tenant_id, policy_version_id, scope_type, site_id, priority, is_default,
          valid_from)
       VALUES ($1, $2, $3, 'site', $4, 100, true, $5)
       ON CONFLICT (id) DO NOTHING`,
      [id.policyAssignmentA, id.tenantA, id.policyVersionA, id.siteA, now],
    );

    await client.query(
      `INSERT INTO app.login_methods
         (id, tenant_id, site_id, policy_version_id, kind, label, display_order,
          enabled, config, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'click', 'Conectar', 1, true, '{}'::jsonb, $5, $5)
       ON CONFLICT (id) DO NOTHING`,
      [id.loginMethodA, id.tenantA, id.siteA, id.policyVersionA, now],
    );

    await client.query(
      `INSERT INTO app.portals (id, tenant_id, name, kind, created_at, updated_at)
       VALUES ($1, $2, 'Synthetic Portal', 'wifi', $3, $3)
       ON CONFLICT (id) DO NOTHING`,
      [id.portalA, id.tenantA, now],
    );

    await client.query(
      `INSERT INTO app.portal_versions
         (id, tenant_id, portal_id, version, status, fallback_locale, theme, published_at, created_at)
       VALUES ($1, $2, $3, 1, 'published', 'es', '{"synthetic":true}'::jsonb, $4, $4)
       ON CONFLICT (id) DO NOTHING`,
      [id.portalVersionA, id.tenantA, id.portalA, now],
    );

    await client.query(
      `INSERT INTO app.portal_blocks
         (id, tenant_id, portal_version_id, kind, display_order, props, created_at)
       VALUES ($1, $2, $3, 'text', 1, '{"text":"Synthetic welcome"}'::jsonb, $4)
       ON CONFLICT (id) DO NOTHING`,
      [id.portalBlockA, id.tenantA, id.portalVersionA, now],
    );

    await client.query(
      `INSERT INTO app.processing_purposes
         (id, tenant_id, code, name, lawful_basis, retention_class, active, created_at)
       VALUES ($1, $2, 'marketing_email', 'Synthetic marketing consent', 'consent', 'marketing_12m', true, $3)
       ON CONFLICT (id) DO NOTHING`,
      [id.purposeA, id.tenantA, now],
    );

    await client.query(
      `INSERT INTO app.legal_documents (id, tenant_id, kind, name, created_at)
       VALUES ($1, $2, 'terms', 'Synthetic Terms', $3)
       ON CONFLICT (id) DO NOTHING`,
      [id.legalDocumentA, id.tenantA, now],
    );

    await client.query(
      `INSERT INTO app.legal_versions
         (id, tenant_id, document_id, version, locale, status, content, content_hash, published_at, created_at)
       VALUES ($1, $2, $3, 1, 'es', 'published', 'Synthetic terms; never production copy.', $4, $5, $5)
       ON CONFLICT (id) DO NOTHING`,
      [id.legalVersionA, id.tenantA, id.legalDocumentA, sha256Hex("synthetic-terms-v1"), now],
    );

    await client.query(
      `INSERT INTO app.identity_spaces
         (id, tenant_id, name, controller_ref, key_version, merge_policy, created_at)
       VALUES ($1, $2, 'Synthetic Alpha Identity Space', 'synthetic-controller', 'synthetic-key-v1', '{}', $3)
       ON CONFLICT (id) DO NOTHING`,
      [id.identitySpaceA, id.tenantA, now],
    );

    await client.query(
      `INSERT INTO app.end_users
         (id, tenant_id, identity_space_id, status, retention_anchor, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', $4, $4, $4)
       ON CONFLICT (id) DO NOTHING`,
      [id.endUserA, id.tenantA, id.identitySpaceA, now],
    );

    await client.query(
      `INSERT INTO app.client_devices
         (id, tenant_id, identity_space_id, mac_ciphertext, mac_hmac, key_version,
          private_mac, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, 'synthetic-key-v1', true, $6, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        id.deviceA,
        id.tenantA,
        id.identitySpaceA,
        Buffer.from("synthetic-mac-ciphertext", "utf8"),
        sha256("02:00:00:00:00:01"),
        now,
      ],
    );

    await client.query(
      `INSERT INTO app.captive_attempts
         (id, tenant_id, gateway_id, device_id, state_hash, nonce_hash, return_intent,
          status, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, '{"synthetic":true}'::jsonb,
               'pending', $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        id.attemptA,
        id.tenantA,
        id.gatewayA,
        id.deviceA,
        sha256("synthetic-state"),
        sha256("synthetic-nonce"),
        inTenMinutes,
        now,
      ],
    );

    await client.query(
      `INSERT INTO app.access_authorizations
         (id, tenant_id, attempt_id, gateway_id, policy_version_id, end_user_id,
          device_id, method, status, effective_attributes, starts_at, expires_at,
          evidence_hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'click', 'issued',
               '{"Session-Timeout":7200}'::jsonb, $8, $9, $10, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        id.authorizationA,
        id.tenantA,
        id.attemptA,
        id.gatewayA,
        id.policyVersionA,
        id.endUserA,
        id.deviceA,
        now,
        inTwoHours,
        sha256Hex("synthetic-authorization-evidence"),
      ],
    );

    await client.query(
      `INSERT INTO app.legal_acceptances
         (id, tenant_id, end_user_id, authorization_id, legal_version_id, locale, evidence, occurred_at)
       VALUES ($1, $2, $3, $4, $5, 'es', '{"synthetic":true}'::jsonb, $6)
       ON CONFLICT (id) DO NOTHING`,
      [id.legalAcceptanceA, id.tenantA, id.endUserA, id.authorizationA, id.legalVersionA, now],
    );

    await client.query(
      `INSERT INTO app.consent_events
         (id, tenant_id, end_user_id, purpose_id, legal_version_id, decision, evidence, occurred_at)
       VALUES ($1, $2, $3, $4, $5, 'rejected', '{"synthetic":true}'::jsonb, $6)
       ON CONFLICT (id) DO NOTHING`,
      [id.consentEventA, id.tenantA, id.endUserA, id.purposeA, id.legalVersionA, now],
    );

    await client.query(
      `INSERT INTO app.voucher_batches
         (id, tenant_id, site_id, policy_version_id, name, quantity, starts_at,
          expires_at, default_max_uses, default_max_devices, created_at)
       VALUES ($1, $2, $3, $4, 'Synthetic Batch', 1, $5, $6, 1, 1, $5)
       ON CONFLICT (id) DO NOTHING`,
      [id.voucherBatchA, id.tenantA, id.siteA, id.policyVersionA, now, inThirtyDays],
    );

    await client.query(
      `INSERT INTO app.vouchers
         (id, tenant_id, batch_id, code_hmac, display_hint, state, max_uses,
          used_count, max_devices, expires_at, created_at)
       VALUES ($1, $2, $3, $4, 'SYN…01', 'available', 1, 0, 1, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        id.voucherA,
        id.tenantA,
        id.voucherBatchA,
        sha256("SYNTHETIC-NOT-A-SECRET"),
        inThirtyDays,
        now,
      ],
    );

    await client.query(
      `INSERT INTO radius_runtime.credentials
         (id, tenant_id, authorization_id, gateway_id, username, nas_identifier,
          calling_station_id, verifier_attribute, verifier_value, not_before,
          expires_at, enabled, max_uses, used_count, created_at)
       VALUES ($1, $2, $3, $4, 'synthetic-radius-user-a', 'nas-synthetic-alpha',
               NULL, 'Crypt-Password', $5, $6, $7, true, 1, 0, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        id.radiusCredentialA,
        id.tenantA,
        id.authorizationA,
        id.gatewayA,
        "$6$synthetic$not-a-valid-production-verifier",
        now,
        inTwoHours,
      ],
    );

    await client.query(
      `INSERT INTO radius_runtime.reply_attributes
         (id, tenant_id, credential_id, attribute, op, value, priority)
       VALUES ($1, $2, $3, 'Session-Timeout', ':=', '7200', 100)
       ON CONFLICT (id) DO NOTHING`,
      [id.radiusReplyA, id.tenantA, id.radiusCredentialA],
    );

    await client.query(
      `INSERT INTO radius_runtime.nas_registry
         (id, tenant_id, gateway_id, nas_identifier, active, created_at)
       VALUES ($1, $2, $3, 'nas-synthetic-alpha', true, $4)
       ON CONFLICT (id) DO NOTHING`,
      [id.radiusNasA, id.tenantA, id.gatewayA, now],
    );

    await client.query(
      `INSERT INTO radius_runtime.accounting_inbox
         (id, tenant_id, gateway_id, authorization_id, username, nas_identifier,
          packet_source_ip, nas_ip_address, acct_session_id, status_type,
          received_at, nas_event_at, session_time_seconds, nas_input_octets,
          nas_output_octets, acct_delay_seconds, calling_station_id,
          framed_ip_address, class_value, redacted_payload, event_fingerprint)
       VALUES ($1, $2, $3, $4, 'synthetic-radius-user-a', 'nas-synthetic-alpha',
               '192.0.2.10'::inet, '192.0.2.1'::inet, 'synthetic-session-a', 'Start',
               $5, $5, 0, 0, 0, 0, NULL, '198.51.100.10'::inet,
               'synthetic-class-a', '{"synthetic":true}'::jsonb, $6)
       ON CONFLICT (tenant_id, event_fingerprint) DO NOTHING`,
      [
        id.radiusAccountingA,
        id.tenantA,
        id.gatewayA,
        id.authorizationA,
        now,
        sha256Hex("synthetic-radius-accounting-event-a"),
      ],
    );

    await client.query(
      `INSERT INTO radius_runtime.post_auth_inbox
         (id, tenant_id, gateway_id, authorization_id, username, nas_identifier,
          packet_source_ip, calling_station_id, reply_packet_type, class_value, received_at)
       VALUES ($1, $2, $3, $4, 'synthetic-radius-user-a', 'nas-synthetic-alpha',
               '192.0.2.10'::inet, NULL, 'Access-Accept', 'synthetic-class-a', $5)
       ON CONFLICT (id) DO NOTHING`,
      [id.radiusPostAuthA, id.tenantA, id.gatewayA, id.authorizationA, now],
    );

    await client.query(
      `INSERT INTO app.outbox_events
         (id, tenant_id, aggregate_type, aggregate_id, event_type, event_version,
          payload, occurred_at, available_at)
       VALUES ($1, $2, 'site', $3, 'site.synthetic_seeded', 1,
               '{"synthetic":true}'::jsonb, $4, $4)
       ON CONFLICT (id) DO NOTHING`,
      [id.outboxA, id.tenantA, id.siteA, now],
    );

    await client.query(
      `INSERT INTO audit.audit_logs
         (id, tenant_id, actor_type, actor_id, action, resource_type, resource_id,
          scope, after_redacted, correlation_id, reason, occurred_at)
       VALUES ($1, $2, 'service', NULL, 'synthetic.seed', 'tenant', $2,
               '{"synthetic":true}'::jsonb, '{"seeded":true}'::jsonb,
               '0198a000-0000-7000-8000-000000001399', 'Synthetic data only', $3)
       ON CONFLICT (id) DO NOTHING`,
      [id.auditA, id.tenantA, now],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
