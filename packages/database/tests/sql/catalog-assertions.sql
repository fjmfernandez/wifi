\set ON_ERROR_STOP on

DO $assertions$
DECLARE
    missing text;
BEGIN
    SELECT string_agg(format('%I.%I', namespace.nspname, relation.relname), ', ')
      INTO missing
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE relation.relkind = 'r'
       AND namespace.nspname IN ('app', 'audit', 'radius_runtime')
       AND EXISTS (
           SELECT 1 FROM pg_attribute attribute
           WHERE attribute.attrelid = relation.oid
             AND attribute.attname = 'tenant_id'
             AND NOT attribute.attisdropped
       )
       AND (NOT relation.relrowsecurity OR NOT relation.relforcerowsecurity);

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'tenant tables without ENABLE/FORCE RLS: %', missing;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname IN ('wifi_app_runtime', 'wifi_worker', 'wifi_radius_runtime')
          AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolcanlogin)
    ) THEN
        RAISE EXCEPTION 'a runtime group role has elevated attributes';
    END IF;

    IF to_regclass('radius_runtime.radcheck_compat') IS NULL
       OR to_regclass('radius_runtime.radreply_compat') IS NULL
       OR to_regclass('radius_runtime.post_auth_inbox') IS NULL THEN
        RAISE EXCEPTION 'the production FreeRADIUS compatibility contract is incomplete';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'app'
          AND relation.relname IN (
              'admin_credentials', 'admin_sessions', 'admin_totp_factors',
              'admin_webauthn_credentials'
          )
          AND (NOT relation.relrowsecurity OR NOT relation.relforcerowsecurity)
    ) THEN
        RAISE EXCEPTION 'a global admin-auth table lacks ENABLE/FORCE RLS';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_attribute attribute
        WHERE attribute.attrelid = 'app.admin_users'::regclass
          AND attribute.attname = 'email_key_version'
          AND attribute.attnotnull
          AND NOT attribute.attisdropped
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_constraint constraint_row
        WHERE constraint_row.conrelid = 'app.admin_users'::regclass
          AND constraint_row.conname = 'admin_users_email_key_version_ck'
          AND constraint_row.contype = 'c'
    ) THEN
        RAISE EXCEPTION 'admin email ciphertext lacks a required non-empty key version';
    END IF;

    IF has_table_privilege('wifi_worker', 'app.outbox_events', 'SELECT')
       OR has_table_privilege('wifi_worker', 'radius_runtime.accounting_inbox', 'SELECT') THEN
        RAISE EXCEPTION 'worker has forbidden direct queue-table access';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM unnest(ARRAY[
            'resolve_captive_locator', 'resolve_captive_attempt',
            'lookup_admin_auth', 'resolve_admin_session',
            'claim_outbox_events', 'complete_outbox_event',
            'claim_accounting_events', 'complete_accounting_event'
        ]) AS required(name)
        WHERE NOT EXISTS (
            SELECT 1
            FROM pg_proc procedure
            JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
            JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
            WHERE procedure.proname = required.name
              AND namespace.nspname IN ('app', 'radius_runtime')
              AND procedure.prosecdef
              AND owner_role.rolname = 'wifi_migrator'
              AND EXISTS (
                  SELECT 1 FROM unnest(COALESCE(procedure.proconfig, ARRAY[]::text[])) AS setting
                  WHERE setting LIKE 'search_path=%'
              )
        )
    ) THEN
        RAISE EXCEPTION 'a required SECURITY DEFINER function lacks fixed owner/search_path';
    END IF;
END
$assertions$;
