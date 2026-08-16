import { createHash } from "node:crypto";

export const ACCOUNTING_STATUS_TYPES = ["Start", "Interim-Update", "Stop"] as const;

export type AccountingStatusType = (typeof ACCOUNTING_STATUS_TYPES)[number];

export interface RawNasCounters {
  inputOctets: number;
  inputGigawords?: number;
  outputOctets: number;
  outputGigawords?: number;
}

export interface AccountingFingerprintInput extends RawNasCounters {
  tenantId: string;
  gatewayId: string;
  nasIdentifier: string;
  acctSessionId: string;
  statusType: AccountingStatusType;
  nasEventEpochSeconds?: number;
  sessionTimeSeconds?: number;
}

export interface NormalizedNasCounters {
  nasInputOctets: bigint;
  nasOutputOctets: bigint;
}

const UINT32_MAX = 4_294_967_295;
const GIGAWORD_MULTIPLIER = 4_294_967_296n;

function unsigned32(label: string, value: number | undefined): bigint {
  const actual = value ?? 0;
  if (!Number.isInteger(actual) || actual < 0 || actual > UINT32_MAX) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer`);
  }
  return BigInt(actual);
}

export function combineRadiusOctets(lowWord: number, gigawords = 0): bigint {
  return unsigned32("gigawords", gigawords) * GIGAWORD_MULTIPLIER + unsigned32("octets", lowWord);
}

export function normalizeNasCounters(counters: RawNasCounters): NormalizedNasCounters {
  return {
    nasInputOctets: combineRadiusOctets(counters.inputOctets, counters.inputGigawords),
    nasOutputOctets: combineRadiusOctets(counters.outputOctets, counters.outputGigawords),
  };
}

export function accountingEventFingerprint(input: AccountingFingerprintInput): string {
  const counters = normalizeNasCounters(input);
  const canonicalFields = [
    "radius-accounting-v1",
    input.tenantId,
    input.gatewayId,
    input.nasIdentifier,
    input.acctSessionId,
    input.statusType,
    input.nasEventEpochSeconds?.toString() ?? "",
    input.sessionTimeSeconds?.toString() ?? "",
    counters.nasInputOctets.toString(),
    counters.nasOutputOctets.toString(),
  ];

  return createHash("sha256").update(canonicalFields.join("\u001f"), "utf8").digest("hex");
}
