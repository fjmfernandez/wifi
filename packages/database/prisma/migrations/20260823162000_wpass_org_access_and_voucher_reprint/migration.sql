ALTER TABLE app.organizations
    ADD COLUMN IF NOT EXISTS access_email varchar(320);

ALTER TABLE app.vouchers
    ADD COLUMN IF NOT EXISTS code_ciphertext bytea;
