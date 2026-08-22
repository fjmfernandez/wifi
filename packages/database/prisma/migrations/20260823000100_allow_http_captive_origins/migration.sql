-- Allow MikroTik HotSpot local DNS origins such as http://login.entelsat.local.
-- RouterOS captive portal redirects commonly start over HTTP before the SaaS
-- portal completes the session through HTTPS.
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
           WHERE value !~ '^https?://[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]{1,5})?$'
       )
$function$;
