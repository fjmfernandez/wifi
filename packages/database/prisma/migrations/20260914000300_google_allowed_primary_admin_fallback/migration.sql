CREATE OR REPLACE FUNCTION app.lookup_primary_admin_auth()
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
    JOIN app.tenant_memberships AS membership
      ON membership.user_id = admin.id
     AND membership.status = 'active'
    JOIN app.tenants AS tenant
      ON tenant.id = membership.tenant_id
     AND tenant.status = 'active'
    WHERE admin.status = 'active'
    GROUP BY admin.id, credential.id
    ORDER BY admin.created_at ASC
    LIMIT 1
$function$;

ALTER FUNCTION app.lookup_primary_admin_auth() OWNER TO wifi_migrator;
REVOKE ALL ON FUNCTION app.lookup_primary_admin_auth() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lookup_primary_admin_auth() TO wifi_app_runtime;
