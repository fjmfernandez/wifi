export class PermanentJobError extends Error {
  readonly code: string;

  constructor(code: string) {
    const safeCode = normalizeErrorCode(code);
    super(safeCode);
    this.name = "PermanentJobError";
    this.code = safeCode;
  }
}

export class RetryableJobError extends Error {
  readonly code: string;

  constructor(code: string) {
    const safeCode = normalizeErrorCode(code);
    super(safeCode);
    this.name = "RetryableJobError";
    this.code = safeCode;
  }
}

function normalizeErrorCode(value: string): string {
  return /^[A-Z][A-Z0-9_]{1,63}$/.test(value) ? value : "INVALID_ERROR_CODE";
}
