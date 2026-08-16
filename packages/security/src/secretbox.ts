import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const VERSION = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function assertKey(key: Buffer): void {
  if (key.byteLength !== KEY_BYTES) {
    throw new RangeError("Encryption keys must contain exactly 32 bytes");
  }
}

function associatedData(context: string): Buffer {
  if (!/^[a-z0-9._:-]{3,120}$/i.test(context)) {
    throw new RangeError("Encryption context is invalid");
  }
  return Buffer.from(context, "utf8");
}

export function deriveScopedKey(masterKey: Buffer, scope: string, purpose: string): Buffer {
  assertKey(masterKey);
  if (scope.length < 1 || scope.length > 256) throw new RangeError("Key scope is invalid");
  return createHmac("sha256", masterKey)
    .update(`wifi-entelsat.key.v1\0${purpose}\0${scope}`, "utf8")
    .digest();
}

export function sealSecret(plaintext: string | Buffer, key: Buffer, context: string): Buffer {
  assertKey(key);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(associatedData(context));
  const source = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext;
  const ciphertext = Buffer.concat([cipher.update(source), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), nonce, cipher.getAuthTag(), ciphertext]);
}

export function openSecret(sealed: Buffer, key: Buffer, context: string): Buffer {
  assertKey(key);
  if (sealed.byteLength < 1 + NONCE_BYTES + TAG_BYTES || sealed[0] !== VERSION) {
    throw new Error("Encrypted value is invalid");
  }
  const nonceStart = 1;
  const tagStart = nonceStart + NONCE_BYTES;
  const ciphertextStart = tagStart + TAG_BYTES;
  const decipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(nonceStart, tagStart), {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(associatedData(context));
  decipher.setAuthTag(sealed.subarray(tagStart, ciphertextStart));
  return Buffer.concat([decipher.update(sealed.subarray(ciphertextStart)), decipher.final()]);
}

export function openSecretText(sealed: Buffer, key: Buffer, context: string): string {
  return openSecret(sealed, key, context).toString("utf8");
}
