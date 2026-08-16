import { BLOCKED_BY_LAB_VALIDATION, BlockedByLabValidationError } from "./blockers.js";

export const COA_PORT_CANDIDATES = [1700, 3799] as const;
export type CoaPort = (typeof COA_PORT_CANDIDATES)[number];

export function parseCoaPort(value: number | string): CoaPort {
  const parsed = typeof value === "number" ? value : Number(value);
  if (parsed !== 1700 && parsed !== 3799) {
    throw new RangeError("CoA/Disconnect port must be explicitly configured as 1700 or 3799");
  }
  return parsed;
}

export function assertCoaSelectorIsLabValidated(): never {
  throw new BlockedByLabValidationError(
    BLOCKED_BY_LAB_VALIDATION.coaSelector.code,
    "No production CoA/Disconnect packet builder is exported until L16-L17 evidence fixes the selector.",
  );
}
