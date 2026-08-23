-- Allow a freshly-created gateway to perform its first captive locator ping.
-- Before this change, app.resolve_captive_locator rejected gateways in
-- "pending", so the gateway could never transition itself to "online".
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
      AND gateway.status IN ('pending', 'online', 'degraded', 'out_of_sync')
    LIMIT 1
$function$;

ALTER FUNCTION app.resolve_captive_locator(bytea) OWNER TO wifi_migrator;
REVOKE ALL ON FUNCTION app.resolve_captive_locator(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_captive_locator(bytea) TO wifi_app_runtime;
