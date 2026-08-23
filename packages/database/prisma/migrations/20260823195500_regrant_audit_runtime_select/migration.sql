-- Prisma create() uses RETURNING, so runtime roles need SELECT on returned
-- audit columns in addition to INSERT. Some existing deployments only had
-- INSERT, which made captive authorization fail after the RADIUS credential
-- was prepared.
GRANT SELECT, INSERT ON audit.audit_logs TO wifi_app_runtime, wifi_worker, wifi_audit_writer;
