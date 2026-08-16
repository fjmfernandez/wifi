import { generateKeyPairSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { parseEnvironment } from "./environment.js";

function validEnvironment(): Record<string, string> {
  const { publicKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { format: "der", type: "spki" },
    privateKeyEncoding: { format: "der", type: "pkcs8" },
  });
  return {
    NODE_ENV: "test",
    SITE_AGENT_CLOUD_URL: "http://127.0.0.1:3100",
    SITE_AGENT_CAPTIVE_ORIGIN: "http://127.0.0.1:3200",
    SITE_AGENT_DB_PATH: "./tmp/site-agent.sqlite",
    SITE_AGENT_STORAGE_KEY_BASE64: randomBytes(32).toString("base64"),
    SITE_AGENT_COMMAND_SIGNING_PUBLIC_KEY_BASE64: publicKey.toString("base64"),
    SITE_AGENT_ENROLLMENT_TOKEN: "token_abcdefghijklmnopqrstuvwxyz0123456789",
    BUILD_SHA: "1234567",
  };
}

describe("site-agent environment", () => {
  it("parses a strict preview-only configuration", () => {
    const environment = parseEnvironment(validEnvironment());
    expect(environment.healthHost).toBe("127.0.0.1");
    expect(environment.storageKey).toHaveLength(32);
    expect(environment.enrollmentToken).toHaveLength(42);
  });

  it("requires HTTPS and an absolute durable database path in production", () => {
    const input = {
      ...validEnvironment(),
      NODE_ENV: "production",
      SITE_AGENT_CLOUD_URL: "http://127.0.0.1:3100",
    };
    expect(() => parseEnvironment(input)).toThrow(/absolute in production/);
    expect(() =>
      parseEnvironment({
        ...input,
        SITE_AGENT_DB_PATH: "/var/lib/wifi-site-agent/site-agent.sqlite",
      }),
    ).toThrow(/HTTPS/);
  });

  it("rejects invalid storage and command signing keys", () => {
    expect(() =>
      parseEnvironment({ ...validEnvironment(), SITE_AGENT_STORAGE_KEY_BASE64: "dG9vc2hvcnQ=" }),
    ).toThrow(/32 bytes/);
    expect(() =>
      parseEnvironment({
        ...validEnvironment(),
        SITE_AGENT_COMMAND_SIGNING_PUBLIC_KEY_BASE64: randomBytes(32).toString("base64"),
      }),
    ).toThrow(/Ed25519/);
  });
});
