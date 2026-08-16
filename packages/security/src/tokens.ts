import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function generateOpaqueToken(bytes = 32): string {
  if (!Number.isInteger(bytes) || bytes < 24 || bytes > 128)
    throw new RangeError("Token entropy must be between 24 and 128 bytes");
  return randomBytes(bytes).toString("base64url");
}

export function keyedDigest(value: string, key: Uint8Array, context: string): Buffer {
  if (key.byteLength < 32) throw new RangeError("HMAC key must contain at least 32 bytes");
  if (!/^[a-z][a-z0-9_.-]{2,63}$/.test(context)) throw new TypeError("Invalid digest context");
  return createHmac("sha256", key).update(context).update("\0").update(value, "utf8").digest();
}

export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

export function safeReturnPath(
  input: string | null | undefined,
  fallback = "/administracion",
): string {
  if (
    !input ||
    !input.startsWith("/") ||
    input.startsWith("//") ||
    input.includes("\\") ||
    // Control characters are rejected deliberately: they are the classic vector
    // for smuggling separators past the same-origin check below.
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001f]/.test(input)
  )
    return fallback;
  try {
    const parsed = new URL(input, "https://wifi.entelsat.com");
    return parsed.origin === "https://wifi.entelsat.com"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}
