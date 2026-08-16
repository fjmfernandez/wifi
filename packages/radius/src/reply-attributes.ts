import { BLOCKED_BY_LAB_VALIDATION, BlockedByLabValidationError } from "./blockers.js";

export const SUPPORTED_REPLY_ATTRIBUTES = [
  "Class",
  "Mikrotik-Rate-Limit",
  "Session-Timeout",
  "Idle-Timeout",
  "Acct-Interim-Interval",
  "Port-Limit",
] as const;

export type SupportedReplyAttribute = (typeof SUPPORTED_REPLY_ATTRIBUTES)[number];

export interface RadiusReplyAttribute {
  attribute: SupportedReplyAttribute;
  op: ":=";
  value: string;
}

export interface SupportedPolicyInput {
  opaqueClass: string;
  nasRxKbps?: number;
  nasTxKbps?: number;
  sessionTimeoutSeconds?: number;
  idleTimeoutSeconds?: number;
  interimIntervalSeconds: number;
  portLimit: number;
  totalQuotaBytes?: bigint;
}

const UINT32_MAX = 4_294_967_295;

function assertIntegerInRange(
  label: string,
  value: number,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
}

export function formatMikrotikRateLimit(nasRxKbps: number, nasTxKbps: number): string {
  assertIntegerInRange("nasRxKbps", nasRxKbps, 1, 10_000_000);
  assertIntegerInRange("nasTxKbps", nasTxKbps, 1, 10_000_000);
  return `${nasRxKbps}k/${nasTxKbps}k`;
}

export function compileSupportedReplyAttributes(
  policy: SupportedPolicyInput,
): readonly RadiusReplyAttribute[] {
  if (policy.totalQuotaBytes !== undefined) {
    throw new BlockedByLabValidationError(
      BLOCKED_BY_LAB_VALIDATION.totalQuota.code,
      "Do not emit Mikrotik-Total-Limit or its Gigawords companion yet.",
    );
  }

  if (policy.opaqueClass.length < 1 || policy.opaqueClass.length > 253) {
    throw new RangeError("opaqueClass must contain between 1 and 253 characters");
  }
  assertIntegerInRange("interimIntervalSeconds", policy.interimIntervalSeconds, 60, 86_400);
  assertIntegerInRange("portLimit", policy.portLimit, 1, 65_535);

  if ((policy.nasRxKbps === undefined) !== (policy.nasTxKbps === undefined)) {
    throw new TypeError("nasRxKbps and nasTxKbps must be supplied together");
  }

  const attributes: RadiusReplyAttribute[] = [
    { attribute: "Class", op: ":=", value: policy.opaqueClass },
    {
      attribute: "Acct-Interim-Interval",
      op: ":=",
      value: String(policy.interimIntervalSeconds),
    },
    { attribute: "Port-Limit", op: ":=", value: String(policy.portLimit) },
  ];

  if (policy.nasRxKbps !== undefined && policy.nasTxKbps !== undefined) {
    attributes.push({
      attribute: "Mikrotik-Rate-Limit",
      op: ":=",
      value: formatMikrotikRateLimit(policy.nasRxKbps, policy.nasTxKbps),
    });
  }

  if (policy.sessionTimeoutSeconds !== undefined) {
    assertIntegerInRange("sessionTimeoutSeconds", policy.sessionTimeoutSeconds, 1, UINT32_MAX);
    attributes.push({
      attribute: "Session-Timeout",
      op: ":=",
      value: String(policy.sessionTimeoutSeconds),
    });
  }

  if (policy.idleTimeoutSeconds !== undefined) {
    assertIntegerInRange("idleTimeoutSeconds", policy.idleTimeoutSeconds, 1, UINT32_MAX);
    attributes.push({
      attribute: "Idle-Timeout",
      op: ":=",
      value: String(policy.idleTimeoutSeconds),
    });
  }

  return attributes;
}
