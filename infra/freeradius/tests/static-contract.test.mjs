import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stdout } from "node:process";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const repositoryRoot = resolve(root, "../..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dictionary = readFileSync(resolve(root, "vendor/MikroTik_Vendor_attributes.txt"));
assert(
  createHash("sha256").update(dictionary).digest("hex") ===
    "4efa0850b7b2fcfb5ef53ac961e9b642b4384fe023bf31b22dcabe0ca85e1bb4",
  "MikroTik dictionary differs from the verified normalized snapshot",
);

const dockerfile = read("Dockerfile");
assert(
  dockerfile.includes("freeradius-server:3.2.10@sha256:"),
  "FreeRADIUS image is not digest-pinned",
);
assert(
  dockerfile.includes(
    "COPY vendor/MikroTik_Vendor_attributes.txt /usr/share/freeradius/dictionary.mikrotik",
  ),
  "verified MikroTik dictionary is not installed",
);

const clients = read("raddb/clients.conf");
assert(
  clients.includes("/run/freeradius/clients-runtime.conf"),
  "NAS clients are not runtime materialized",
);
assert(!/secret\s*=/.test(clients), "a static RADIUS secret exists in clients.conf");

const entrypoint = read("bin/entrypoint.sh");
assert(
  !entrypoint.includes("freeradius -X"),
  "startup configuration validation must not dump secret-backed configuration",
);
assert(
  !/printf ['"]radius_db[^\n]*password/i.test(entrypoint),
  "database password must use FreeRADIUS' masked password field, not radius_db DSN",
);

const site = read("raddb/sites-enabled/entelsat");
assert(
  site.includes("detail_accounting\n        sql_radius_runtime"),
  "accounting is not spooled before SQL",
);
assert(!site.includes("Simultaneous-Use"), "Simultaneous-Use leaked into the virtual server");

const schema = read("lab/sql/001-radius-runtime.sql");
const allowlistMatch = schema.match(/CONSTRAINT reply_attributes_allowlist[\s\S]*?\n\s*\),/);
assert(allowlistMatch, "reply allowlist CHECK is missing");
for (const forbidden of [
  "Simultaneous-Use",
  "Mikrotik-Total-Limit",
  "Mikrotik-Total-Limit-Gigawords",
]) {
  assert(
    !allowlistMatch[0].includes(forbidden),
    `${forbidden} is incorrectly allowed in reply_attributes`,
  );
}
for (const required of ["Port-Limit", "Acct-Interim-Interval", "Mikrotik-Rate-Limit"]) {
  assert(
    allowlistMatch[0].includes(required),
    `${required} is missing from reply_attributes allowlist`,
  );
}

const role = read("lab/postgres/010-create-radius-role.sh");
assert(
  !/GRANT\s+(UPDATE|DELETE)/i.test(role),
  "runtime SQL role can mutate append-only inbox rows",
);
assert(
  /GRANT INSERT ON[\s\S]*accounting_inbox/.test(role),
  "runtime SQL role cannot insert accounting",
);

const compose = read("compose.lab.yml");
assert(
  compose.includes("127.0.0.1:${RADIUS_A_AUTH_PORT:-1812}:1812/udp"),
  "lab auth port is not loopback-only",
);
assert(
  compose.includes("radius-a:") && compose.includes("radius-b:"),
  "two RADIUS lab nodes are required",
);

const dynamicAuthorization = read("scripts/radclient-dynamic-authorization.sh");
assert(
  dynamicAuthorization.includes("ALLOW_BLOCKED_COA_LAB"),
  "CoA script lacks the explicit lab gate",
);
const labCommon = read("scripts/lab-common.sh");
assert(labCommon.includes("1700|3799"), "CoA port candidates are not constrained");

// The product migration, not the disposable lab bootstrap, is the production
// source of truth.  Keep this check cross-package so a schema/query rename
// cannot pass merely because both lab-only files drifted together.
const productMigration = readFileSync(
  resolve(
    repositoryRoot,
    "packages/database/prisma/migrations/20260816000100_pr03_core/migration.sql",
  ),
  "utf8",
);
const sqlQueries = read("raddb/mods-config/sql/main/postgresql/entelsat-queries.conf");
const typescriptContract = readFileSync(
  resolve(repositoryRoot, "packages/radius/src/sql-contract.ts"),
  "utf8",
);

function productTable(table) {
  const match = productMigration.match(
    new RegExp(`CREATE TABLE "radius_runtime"\\."${table}" \\(([\\s\\S]*?)\\n\\);`),
  );
  assert(match, `product migration does not create radius_runtime.${table}`);
  return match[1];
}

function assertProductColumns(table, columns) {
  const definition = productTable(table);
  for (const column of columns) {
    assert(
      definition.includes(`"${column}"`),
      `product radius_runtime.${table} is missing ${column}`,
    );
  }
}

function assertInsertContract(table, columns) {
  const match = sqlQueries.match(
    new RegExp(`INSERT INTO radius_runtime\\.${table} \\(([\\s\\S]*?)\\\\?\\s*\\) \\\\?\\s*SELECT`),
  );
  assert(match, `FreeRADIUS SQL is missing the ${table} INSERT column list`);
  const actual = match[1]
    .replaceAll("\\", "")
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);
  assert(
    JSON.stringify(actual) === JSON.stringify(columns),
    `FreeRADIUS ${table} INSERT columns differ from the production contract`,
  );
}

for (const object of [
  "credentials",
  "reply_attributes",
  "accounting_inbox",
  "post_auth_inbox",
  "radcheck_compat",
  "radreply_compat",
]) {
  assert(
    typescriptContract.includes(`radius_runtime.${object}`),
    `TypeScript SQL contract is missing radius_runtime.${object}`,
  );
}
for (const object of [
  "credentials",
  "accounting_inbox",
  "post_auth_inbox",
  "radcheck_compat",
  "radreply_compat",
]) {
  assert(sqlQueries.includes(`radius_runtime.${object}`), `FreeRADIUS SQL does not use ${object}`);
}

assertProductColumns("credentials", [
  "runtime_id",
  "tenant_id",
  "gateway_id",
  "authorization_id",
  "username",
  "nas_identifier",
  "calling_station_id",
  "verifier_attribute",
  "verifier_value",
  "not_before",
  "expires_at",
  "enabled",
]);
assertProductColumns("reply_attributes", [
  "runtime_id",
  "tenant_id",
  "credential_id",
  "attribute",
  "op",
  "value",
  "priority",
]);
const accountingColumns = [
  "tenant_id",
  "gateway_id",
  "authorization_id",
  "username",
  "nas_identifier",
  "packet_source_ip",
  "nas_ip_address",
  "acct_session_id",
  "status_type",
  "nas_event_at",
  "session_time_seconds",
  "nas_input_octets",
  "nas_output_octets",
  "acct_delay_seconds",
  "calling_station_id",
  "framed_ip_address",
  "class_value",
  "terminate_cause",
  "redacted_payload",
  "event_fingerprint",
];
assertProductColumns("accounting_inbox", accountingColumns);
assertInsertContract("accounting_inbox", accountingColumns);

const postAuthColumns = [
  "tenant_id",
  "gateway_id",
  "authorization_id",
  "username",
  "nas_identifier",
  "packet_source_ip",
  "calling_station_id",
  "reply_packet_type",
  "class_value",
];
assertProductColumns("post_auth_inbox", postAuthColumns);
assertInsertContract("post_auth_inbox", postAuthColumns);

for (const view of ["radcheck_compat", "radreply_compat"]) {
  assert(
    new RegExp(
      `CREATE VIEW radius_runtime\\.${view}\\s+WITH \\(security_barrier = true, security_invoker = true\\)`,
    ).test(productMigration),
    `product ${view} is not a security-barrier/invoker view`,
  );
}
assert(
  /CREATE UNIQUE INDEX[^;]*accounting_inbox[^;]*\("tenant_id", "event_fingerprint"\)/s.test(
    productMigration,
  ),
  "product accounting fingerprint is not tenant-scoped unique",
);
assert(
  /GRANT SELECT \(tenant_id, event_fingerprint\) ON radius_runtime\.accounting_inbox TO wifi_radius_runtime/.test(
    productMigration,
  ),
  "product runtime role lacks the column-scoped SELECT needed by ON CONFLICT",
);
assert(
  /CREATE POLICY radius_accounting_conflict_read ON radius_runtime\.accounting_inbox\s+FOR SELECT TO wifi_radius_runtime USING \(true\)/.test(
    productMigration,
  ),
  "FORCE RLS lacks the narrow SELECT policy required by accounting ON CONFLICT",
);

stdout.write("FreeRADIUS static contract checks passed\n");
