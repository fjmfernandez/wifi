ALTER TABLE app.organizations
    ADD COLUMN IF NOT EXISTS marketing_access_enabled boolean NOT NULL DEFAULT false;
