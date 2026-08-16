import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import { buildProvisioningPlan } from "@wifi/mikrotik";

import type {
  AgentIdentityMaterial,
  SignedAgentCommand,
  UnsignedAgentCommand,
} from "../contracts.js";
import { isAllowlistedReadOnlyCommand, RouterCommandExecutor } from "../router/command-executor.js";
import type {
  ReadOnlyExecutionResult,
  RouterInventory,
  RouterOsAdapter,
} from "../router/router-adapter.js";
import { canonicalJson, CommandSignatureVerifier } from "../security/command-signature.js";
import { CommandGuard } from "./command-guard.js";

const captiveOrigin = "https://captive.wifi.entelsat.com";
const provisioningInput = {
  revision: 3,
  mode: "hotspot-only",
  gatewayName: "miramar-core-01",
  nasIdentifier: "miramar-core-01",
  hotspotName: "guest-hotspot",
  guestInterface: "vlan-guest",
  dnsName: "wifi-login.miramar.example",
  captiveOrigin,
  radiusPrimary: "10.80.0.11",
  radiusSecondary: "10.80.0.12",
  radiusSecretVariable: "$ENTELSAT_RADIUS_SECRET",
  interimIntervalSeconds: 300,
} as const;

const identity: AgentIdentityMaterial = {
  protocolVersion: 1,
  identityId: "0198a000-0000-7000-8000-000000000011",
  tenantId: "0198a000-0000-7000-8000-000000000001",
  gatewayId: "0198a000-0000-7000-8000-000000000021",
  certificatePem: `-----BEGIN CERTIFICATE-----\n${"A".repeat(80)}\n-----END CERTIFICATE-----`,
  caCertificatePem: `-----BEGIN CERTIFICATE-----\n${"B".repeat(80)}\n-----END CERTIFICATE-----`,
  certificateNotAfter: "2027-08-16T10:00:00.000Z",
  initialCommandSequence: 0,
  privateKeyPem: `-----BEGIN PRIVATE KEY-----\n${"C".repeat(80)}\n-----END PRIVATE KEY-----`,
  enrolledAt: "2026-08-16T10:00:00.000Z",
};

class RecordingRouter implements RouterOsAdapter {
  readonly commands: string[] = [];

  async readInventory(): Promise<RouterInventory> {
    return { reachable: true, model: "lab-simulator", routerOsVersion: "unvalidated" };
  }

  async executeReadOnly(command: string): Promise<ReadOnlyExecutionResult> {
    this.commands.push(command);
    return { ok: true, code: "PREFLIGHT_OK", durationMs: 1 };
  }
}

function signedCommand(
  unsigned: UnsignedAgentCommand,
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
): SignedAgentCommand {
  return {
    ...unsigned,
    signature: sign(null, Buffer.from(canonicalJson(unsigned)), privateKey).toString("base64"),
  };
}

describe("signed command guard", () => {
  it("accepts a pinned signature and rejects tampering, expiry metadata and another gateway", () => {
    const keyPair = generateKeyPairSync("ed25519");
    const unsigned: UnsignedAgentCommand = {
      protocolVersion: 1,
      id: "0198a000-0000-7000-8000-000000000101",
      tenantId: identity.tenantId,
      gatewayId: identity.gatewayId,
      sequence: 1,
      type: "gateway.inventory.read",
      issuedAt: "2026-08-16T10:00:00.000Z",
      expiresAt: "2026-08-16T10:05:00.000Z",
      payload: {},
    };
    const command = signedCommand(unsigned, keyPair.privateKey);
    const verifier = new CommandSignatureVerifier(
      keyPair.publicKey.export({ format: "der", type: "spki" }),
    );
    const guard = new CommandGuard(
      verifier,
      30_000,
      600_000,
      () => new Date("2026-08-16T10:01:00.000Z"),
    );
    expect(guard.guard(command, identity).expired).toBe(false);
    const expiredGuard = new CommandGuard(
      verifier,
      30_000,
      600_000,
      () => new Date("2026-08-16T10:06:00.000Z"),
    );
    expect(expiredGuard.guard(command, identity).expired).toBe(true);
    expect(() => guard.guard({ ...command, sequence: 2 }, identity)).toThrow(/signature/);

    const otherGateway = signedCommand(
      { ...unsigned, gatewayId: "0198a000-0000-7000-8000-000000000099" },
      keyPair.privateKey,
    );
    expect(() => guard.guard(otherGateway, identity)).toThrow(/another identity/);

    const excessiveTtl = signedCommand(
      { ...unsigned, expiresAt: "2026-08-16T11:00:00.000Z" },
      keyPair.privateKey,
    );
    expect(() => guard.guard(excessiveTtl, identity)).toThrow(/validity window/);
  });
});

describe("RouterOS command execution policy", () => {
  it("sanitizes adapter inventory before creating cloud evidence", async () => {
    const router: RouterOsAdapter = {
      readInventory: async () =>
        ({
          reachable: true,
          model: "lab-simulator",
          password: "must-never-leave-the-adapter",
        }) as RouterInventory,
      executeReadOnly: async () => ({ ok: true, code: "PREFLIGHT_OK", durationMs: 1 }),
    };
    const executor = new RouterCommandExecutor(router, captiveOrigin);
    const outcome = await executor.execute(
      {
        protocolVersion: 1,
        id: "0198a000-0000-7000-8000-000000000105",
        tenantId: identity.tenantId,
        gatewayId: identity.gatewayId,
        sequence: 5,
        type: "gateway.inventory.read",
        issuedAt: "2026-08-16T10:00:00.000Z",
        expiresAt: "2026-08-16T10:05:00.000Z",
        payload: {},
        signature: Buffer.alloc(64).toString("base64"),
      },
      false,
    );
    expect(JSON.stringify(outcome)).not.toContain("must-never-leave-the-adapter");
    expect(outcome.status).toBe("succeeded");
  });

  it("runs only generated, allowlisted read-only preflight commands", async () => {
    const router = new RecordingRouter();
    const executor = new RouterCommandExecutor(
      router,
      captiveOrigin,
      () => new Date("2026-08-16T10:01:00.000Z"),
    );
    const plan = buildProvisioningPlan(provisioningInput);
    const command: SignedAgentCommand = {
      protocolVersion: 1,
      id: "0198a000-0000-7000-8000-000000000102",
      tenantId: identity.tenantId,
      gatewayId: identity.gatewayId,
      sequence: 2,
      type: "provisioning.preflight",
      issuedAt: "2026-08-16T10:00:00.000Z",
      expiresAt: "2026-08-16T10:05:00.000Z",
      payload: { input: provisioningInput, expectedFingerprint: plan.fingerprint },
      signature: Buffer.alloc(64).toString("base64"),
    };
    const outcome = await executor.execute(command, false);
    expect(outcome.status).toBe("succeeded");
    expect(router.commands).toEqual(plan.preflight);
    expect(router.commands.every((item) => isAllowlistedReadOnlyCommand(item, captiveOrigin))).toBe(
      true,
    );
    expect(isAllowlistedReadOnlyCommand("/system reset-configuration", captiveOrigin)).toBe(false);
  });

  it("always blocks apply without invoking RouterOS", async () => {
    const router = new RecordingRouter();
    const executor = new RouterCommandExecutor(router, captiveOrigin);
    const plan = buildProvisioningPlan(provisioningInput);
    const command: SignedAgentCommand = {
      protocolVersion: 1,
      id: "0198a000-0000-7000-8000-000000000103",
      tenantId: identity.tenantId,
      gatewayId: identity.gatewayId,
      sequence: 3,
      type: "provisioning.apply",
      issuedAt: "2026-08-16T10:00:00.000Z",
      expiresAt: "2026-08-16T10:05:00.000Z",
      payload: { input: provisioningInput, expectedFingerprint: plan.fingerprint },
      signature: Buffer.alloc(64).toString("base64"),
    };
    const outcome = await executor.execute(command, false);
    expect(outcome).toMatchObject({
      status: "blocked",
      code: "BLOCKED_BY_LAB_VALIDATION",
    });
    expect(router.commands).toHaveLength(0);
  });

  it("rejects a plan that points preflight outside the pinned captive origin", async () => {
    const router = new RecordingRouter();
    const executor = new RouterCommandExecutor(router, captiveOrigin);
    const foreignInput = { ...provisioningInput, captiveOrigin: "https://attacker.invalid" };
    const command: SignedAgentCommand = {
      protocolVersion: 1,
      id: "0198a000-0000-7000-8000-000000000104",
      tenantId: identity.tenantId,
      gatewayId: identity.gatewayId,
      sequence: 4,
      type: "provisioning.preview",
      issuedAt: "2026-08-16T10:00:00.000Z",
      expiresAt: "2026-08-16T10:05:00.000Z",
      payload: { input: foreignInput },
      signature: Buffer.alloc(64).toString("base64"),
    };
    await expect(executor.execute(command, false)).resolves.toMatchObject({
      status: "rejected",
      code: "COMMAND_PAYLOAD_INVALID",
    });
    expect(router.commands).toHaveLength(0);
  });
});
