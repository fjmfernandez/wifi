export const BLOCKED_BY_LAB_VALIDATION = {
  authenticationProtocol: {
    code: "RADIUS_AUTH_PROTOCOL",
    decision: "PAP_OR_CHAP",
    reason:
      "PAP with a non-reversible verifier and CHAP with Cleartext-Password must be compared on CHR and a physical RouterBOARD before production selection.",
  },
  totalQuota: {
    code: "MIKROTIK_TOTAL_QUOTA",
    decision: "MIKROTIK_TOTAL_LIMIT_AND_GIGAWORDS",
    reason:
      "The official dictionary contains total-limit attributes, but their RouterOS HotSpot enforcement semantics still require physical-lab evidence.",
  },
  coaSelector: {
    code: "MIKROTIK_COA_SELECTOR",
    decision: "DISCONNECT_AND_COA_SESSION_SELECTOR",
    reason:
      "The exact selector must prove that one target session changes or disconnects without affecting a neighbouring session.",
  },
  accountingDirection: {
    code: "MIKROTIK_ACCOUNTING_DIRECTION",
    decision: "INPUT_OUTPUT_TO_UPLOAD_DOWNLOAD",
    reason:
      "Raw NAS input/output counters remain direction-neutral until asymmetric traffic is observed in the physical lab.",
  },
} as const;

export type LabBlockerCode =
  (typeof BLOCKED_BY_LAB_VALIDATION)[keyof typeof BLOCKED_BY_LAB_VALIDATION]["code"];

export class BlockedByLabValidationError extends Error {
  readonly code: LabBlockerCode;

  constructor(code: LabBlockerCode, message: string) {
    super(`BLOCKED_BY_LAB_VALIDATION[${code}]: ${message}`);
    this.name = "BlockedByLabValidationError";
    this.code = code;
  }
}
