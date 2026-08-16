import { createHmac } from "node:crypto";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function decodeBase32(value: string): Buffer {
  const normalized = value.toUpperCase().replace(/=+$/g, "").replace(/[\s-]/g, "");
  if (!normalized || [...normalized].some((character) => !base32Alphabet.includes(character)))
    throw new TypeError("Invalid Base32 secret");
  let bits = "";
  for (const character of normalized)
    bits += base32Alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

export function totpCode(
  secretBase32: string,
  nowMs = Date.now(),
  periodSeconds = 30,
  digits = 6,
): string {
  if (
    !Number.isInteger(periodSeconds) ||
    periodSeconds < 15 ||
    periodSeconds > 120 ||
    !Number.isInteger(digits) ||
    digits < 6 ||
    digits > 8
  )
    throw new RangeError("Invalid TOTP parameters");
  const counter = Math.floor(nowMs / 1000 / periodSeconds);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secretBase32)).update(message).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(binary).padStart(digits, "0");
}

export function verifyTotp(
  code: string,
  secretBase32: string,
  nowMs = Date.now(),
  window = 1,
): boolean {
  if (!/^\d{6}$/.test(code) || !Number.isInteger(window) || window < 0 || window > 2) return false;
  for (let delta = -window; delta <= window; delta += 1) {
    if (totpCode(secretBase32, nowMs + delta * 30_000) === code) return true;
  }
  return false;
}
