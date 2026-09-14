ALTER TABLE app.admin_sessions
  DROP CONSTRAINT admin_sessions_auth_strength_ck;

ALTER TABLE app.admin_sessions
  ADD CONSTRAINT admin_sessions_auth_strength_ck
  CHECK (auth_strength IN ('password', 'totp', 'webauthn', 'recovery_code', 'google_oauth'));
