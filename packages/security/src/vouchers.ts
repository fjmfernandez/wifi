import { randomInt } from "node:crypto";

import { keyedDigest } from "./tokens.js";

const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateVoucherCode(prefix = "WIFI", groups = 3, groupLength = 4): string {
  if (!/^[A-Z0-9]{2,8}$/.test(prefix))
    throw new TypeError("Voucher prefix must contain 2–8 uppercase letters or digits");
  if (
    !Number.isInteger(groups) ||
    groups < 2 ||
    groups > 6 ||
    !Number.isInteger(groupLength) ||
    groupLength < 3 ||
    groupLength > 8
  )
    throw new RangeError("Invalid voucher format");
  const parts = Array.from({ length: groups }, () =>
    Array.from({ length: groupLength }, () => alphabet[randomInt(alphabet.length)]).join(""),
  );
  return [prefix, ...parts].join("-");
}

export function normalizeVoucherCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function voucherLookupDigest(value: string, tenantKey: Uint8Array): Buffer {
  return keyedDigest(normalizeVoucherCode(value), tenantKey, "voucher.lookup.v1");
}

export function voucherDisplayHint(value: string): string {
  const normalized = normalizeVoucherCode(value);
  return normalized.length <= 4 ? normalized : `••••${normalized.slice(-4)}`;
}
