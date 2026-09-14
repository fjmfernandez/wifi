-- WPass production hotspot policy:
-- captive access must identify the visitor by email/Google or use a voucher.
-- Existing direct-access methods are converted to email where needed and then disabled.

INSERT INTO app.login_methods (
  id,
  tenant_id,
  site_id,
  policy_version_id,
  kind,
  label,
  display_order,
  enabled,
  config,
  created_at,
  updated_at
)
SELECT
  uuidv7(),
  source.tenant_id,
  source.site_id,
  source.policy_version_id,
  'email',
  'Registro con email',
  1,
  true,
  '{}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM app.login_methods AS source
WHERE source.kind IN ('click', 'pin')
  AND source.enabled = true
  AND NOT EXISTS (
    SELECT 1
    FROM app.login_methods AS existing
    WHERE existing.tenant_id = source.tenant_id
      AND existing.site_id = source.site_id
      AND existing.kind = 'email'
  );

UPDATE app.login_methods
SET enabled = false,
    updated_at = CURRENT_TIMESTAMP
WHERE kind IN ('click', 'pin');
