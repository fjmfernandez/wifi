\set ON_ERROR_STOP on

BEGIN;
SET LOCAL ROLE wifi_app_runtime;
SELECT set_config('app.current_tenant_id', '0198a000-0000-7000-8000-000000000001', true);

DO $tenant_read$
BEGIN
    IF EXISTS (
        SELECT 1 FROM app.sites
        WHERE tenant_id <> '0198a000-0000-7000-8000-000000000001'::uuid
    ) THEN
        RAISE EXCEPTION 'tenant A can read a tenant B site';
    END IF;
END
$tenant_read$;

DO $tenant_write$
BEGIN
    BEGIN
        INSERT INTO app.organizations
            (tenant_id, code, name, status, created_at, updated_at)
        VALUES
            ('0198a000-0000-7000-8000-000000000002', 'FORBIDDEN', 'Forbidden', 'active', now(), now());
        RAISE EXCEPTION 'cross-tenant insert unexpectedly succeeded';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END
$tenant_write$;

DO $cross_fk$
BEGIN
    BEGIN
        INSERT INTO app.zones
            (tenant_id, site_id, name, kind, created_at, updated_at)
        VALUES
            ('0198a000-0000-7000-8000-000000000001',
             '0198a000-0000-7000-8000-000000000202',
             'Forbidden FK', 'guest', now(), now());
        RAISE EXCEPTION 'cross-tenant composite FK unexpectedly succeeded';
    EXCEPTION
        WHEN foreign_key_violation THEN NULL;
    END;
END
$cross_fk$;

ROLLBACK;
