import {
  buildProvisioningPlan,
  provisioningInputSchema,
  type ProvisioningInput,
  type ProvisioningPlan,
} from "@wifi/mikrotik";

import {
  assertSafeOutcomeCode,
  type CommandOutcome,
  type SignedAgentCommand,
} from "../contracts.js";
import type { RouterOsAdapter } from "./router-adapter.js";
import type { RouterInventory } from "./router-adapter.js";

const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
const ROUTER_NAME = "[A-Za-z0-9_.-]{1,63}";

export function isAllowlistedReadOnlyCommand(command: string, captiveOrigin: string): boolean {
  if (command.includes("\n") || command.includes("\r") || command.includes(";")) {
    return false;
  }
  const escapedOrigin = captiveOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    /^\/system resource print without-paging$/,
    /^\/system package print without-paging$/,
    new RegExp(`^/interface print detail where name="${ROUTER_NAME}"$`),
    new RegExp(`^/ip hotspot print detail where name="${ROUTER_NAME}"$`),
    /^\/radius print detail without-paging$/,
    new RegExp(
      `^/tool fetch url="${escapedOrigin}/api/v1/health/live" output=none check-certificate=yes$`,
    ),
  ];
  return patterns.some((pattern) => pattern.test(command));
}

interface PlanPayload {
  readonly input: ProvisioningInput;
  readonly expectedFingerprint?: string;
}

function parsePlanPayload(payload: Readonly<Record<string, unknown>>): PlanPayload {
  const keys = Object.keys(payload);
  if (keys.some((key) => key !== "input" && key !== "expectedFingerprint")) {
    throw new TypeError("Provisioning command payload contains unsupported fields");
  }
  const input = provisioningInputSchema.parse(payload["input"]);
  const expectedFingerprint = payload["expectedFingerprint"];
  if (
    expectedFingerprint !== undefined &&
    (typeof expectedFingerprint !== "string" || !FINGERPRINT_PATTERN.test(expectedFingerprint))
  ) {
    throw new TypeError("expectedFingerprint must be a SHA-256 fingerprint");
  }
  return {
    input,
    ...(expectedFingerprint === undefined ? {} : { expectedFingerprint }),
  };
}

function assertPlanScope(
  plan: ProvisioningPlan,
  input: ProvisioningInput,
  captiveOrigin: string,
): void {
  if (new URL(input.captiveOrigin).origin !== captiveOrigin) {
    throw new TypeError("Provisioning plan captive origin is outside the pinned allowlist");
  }
  if (plan.status !== "preview_only") {
    throw new TypeError("Only preview-only MikroTik plans are supported");
  }
  if (!plan.blockers.some((blocker) => blocker.startsWith("BLOCKED_BY_LAB_VALIDATION"))) {
    throw new TypeError("Provisioning plan is missing its physical-lab blocker");
  }
}

function verifyExpectedFingerprint(plan: ProvisioningPlan, expected: string | undefined): void {
  if (expected !== undefined && expected !== plan.fingerprint) {
    throw new TypeError("Provisioning plan fingerprint does not match the signed command");
  }
}

function optionalSafeText(value: string | undefined, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const hasControlCharacter = [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
  if (value.length < 1 || value.length > 128 || hasControlCharacter) {
    throw new TypeError(`Router inventory ${name} is invalid`);
  }
  return value;
}

function sanitizeInventory(inventory: RouterInventory): RouterInventory {
  const numeric = (
    value: number | undefined,
    minimum: number,
    maximum: number,
  ): number | undefined => {
    if (value === undefined) {
      return undefined;
    }
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new TypeError("Router inventory contains an invalid numeric value");
    }
    return value;
  };
  const model = optionalSafeText(inventory.model, "model");
  const architecture = optionalSafeText(inventory.architecture, "architecture");
  const routerOsVersion = optionalSafeText(inventory.routerOsVersion, "RouterOS version");
  const identity = optionalSafeText(inventory.identity, "identity");
  const uptimeSeconds = numeric(inventory.uptimeSeconds, 0, Number.MAX_SAFE_INTEGER);
  const cpuLoadPercent = numeric(inventory.cpuLoadPercent, 0, 100);
  const freeMemoryBytes = numeric(inventory.freeMemoryBytes, 0, Number.MAX_SAFE_INTEGER);
  return {
    reachable: inventory.reachable === true,
    ...(model === undefined ? {} : { model }),
    ...(architecture === undefined ? {} : { architecture }),
    ...(routerOsVersion === undefined ? {} : { routerOsVersion }),
    ...(identity === undefined ? {} : { identity }),
    ...(uptimeSeconds === undefined ? {} : { uptimeSeconds }),
    ...(cpuLoadPercent === undefined ? {} : { cpuLoadPercent }),
    ...(freeMemoryBytes === undefined ? {} : { freeMemoryBytes }),
  };
}

export class RouterCommandExecutor {
  constructor(
    private readonly router: RouterOsAdapter,
    private readonly captiveOrigin: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(command: SignedAgentCommand, expired: boolean): Promise<CommandOutcome> {
    if (expired) {
      return this.#outcome(command, "rejected", "COMMAND_EXPIRED", {});
    }

    if (command.type === "gateway.inventory.read") {
      if (Object.keys(command.payload).length !== 0) {
        return this.#outcome(command, "rejected", "COMMAND_PAYLOAD_INVALID", {});
      }
      const inventory = sanitizeInventory(await this.router.readInventory());
      if (!inventory.reachable) {
        return this.#outcome(command, "blocked", "ROUTER_UNREACHABLE", {
          reachable: false,
        });
      }
      return this.#outcome(command, "succeeded", "INVENTORY_READ", { inventory });
    }

    let request: PlanPayload;
    let plan: ProvisioningPlan;
    try {
      request = parsePlanPayload(command.payload);
      plan = buildProvisioningPlan(request.input);
      assertPlanScope(plan, request.input, this.captiveOrigin);
      verifyExpectedFingerprint(plan, request.expectedFingerprint);
    } catch {
      return this.#outcome(command, "rejected", "COMMAND_PAYLOAD_INVALID", {});
    }

    if (command.type === "provisioning.preview") {
      return this.#outcome(command, "succeeded", "PROVISIONING_PREVIEW_READY", {
        plan,
        applyStatus: "BLOCKED_BY_LAB_VALIDATION",
      });
    }

    if (request.expectedFingerprint === undefined) {
      return this.#outcome(command, "rejected", "PLAN_FINGERPRINT_REQUIRED", {});
    }

    if (command.type === "provisioning.apply") {
      return this.#outcome(command, "blocked", "BLOCKED_BY_LAB_VALIDATION", {
        planFingerprint: plan.fingerprint,
        reason: "Physical RouterBOARD, RouterOS and rollback validation has not been approved",
      });
    }

    const results: { readonly ok: boolean; readonly code: string; readonly durationMs: number }[] =
      [];
    for (const routerCommand of plan.preflight) {
      if (!isAllowlistedReadOnlyCommand(routerCommand, this.captiveOrigin)) {
        return this.#outcome(command, "rejected", "ROUTER_COMMAND_NOT_ALLOWLISTED", {});
      }
      const rawResult = await this.router.executeReadOnly(routerCommand);
      assertSafeOutcomeCode(rawResult.code);
      if (
        !Number.isSafeInteger(rawResult.durationMs) ||
        rawResult.durationMs < 0 ||
        rawResult.durationMs > 300_000
      ) {
        throw new TypeError("Router adapter returned an invalid duration");
      }
      const result = {
        ok: rawResult.ok === true,
        code: rawResult.code,
        durationMs: rawResult.durationMs,
      };
      results.push(result);
      if (!result.ok) {
        return this.#outcome(command, "blocked", result.code, {
          planFingerprint: plan.fingerprint,
          completedChecks: results.length,
          totalChecks: plan.preflight.length,
        });
      }
    }
    return this.#outcome(command, "succeeded", "PROVISIONING_PREFLIGHT_COMPLETE", {
      planFingerprint: plan.fingerprint,
      completedChecks: results.length,
      results,
    });
  }

  #outcome(
    command: SignedAgentCommand,
    status: CommandOutcome["status"],
    code: string,
    evidence: Readonly<Record<string, unknown>>,
  ): CommandOutcome {
    assertSafeOutcomeCode(code);
    return {
      commandId: command.id,
      commandSequence: command.sequence,
      status,
      code,
      completedAt: this.now().toISOString(),
      evidence,
    };
  }
}
