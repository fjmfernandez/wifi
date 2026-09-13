import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const source = readFileSync(new URL("../bin/entrypoint.sh", import.meta.url), "utf8").replaceAll("\r\n", "\n");
const normalize = source.match(/normalize_users_tsv\(\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(normalize, "entrypoint must define the TSV normalizer");
const shell = process.env.TEST_POSIX_SHELL || (process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "/bin/sh");
const canonical = "rb-hotel\tSecret_a123456\t10.255.0.2\nrb-casa\tSecret_b123456\t10.255.0.3\n";
const fixtures = {
  "real tabs and newlines": canonical,
  "Windows CRLF": canonical.replaceAll("\n", "\r\n"),
  "literal backslash separators": canonical.replaceAll("\t", "\\t").replaceAll("\n", "\\n"),
  "Compose double-escaped separators": canonical.replaceAll("\t", "\\\\t").replaceAll("\n", "\\\\n"),
};
function run(value) {
  const result = spawnSync(shell, ["-s"], {
    input: `${normalize}\nnormalize_users_tsv "$TEST_USERS"\n`,
    env: { ...process.env, TEST_USERS: value },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout;
}
for (const [name, fixture] of Object.entries(fixtures)) {
  test(`two distinct router identities survive ${name}`, () => {
    assert.equal(run(fixture).trimEnd(), canonical.trimEnd());
  });
}
test("unknown credential escapes are preserved for validation, not executed", () => {
  assert.equal(run("rb-casa\\tbad\\cvalue\\t10.255.0.3").trimEnd(), "rb-casa\tbad\\cvalue\t10.255.0.3");
});
