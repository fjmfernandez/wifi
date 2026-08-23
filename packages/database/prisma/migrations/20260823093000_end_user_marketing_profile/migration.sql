ALTER TABLE app.end_users
  ADD COLUMN profile_ciphertext bytea,
  ADD COLUMN profile_key_version varchar(80);

ALTER TABLE app.end_users
  ADD CONSTRAINT end_users_profile_ciphertext_ck
    CHECK (profile_ciphertext IS NULL OR octet_length(profile_ciphertext) > 0),
  ADD CONSTRAINT end_users_profile_key_version_ck
    CHECK (
      (profile_ciphertext IS NULL AND profile_key_version IS NULL)
      OR
      (profile_ciphertext IS NOT NULL AND profile_key_version IS NOT NULL AND length(profile_key_version) > 0)
    );
