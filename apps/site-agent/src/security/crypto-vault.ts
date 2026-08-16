import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const FORMAT_VERSION = "v1";
const IV_BYTES = 12;

export class CryptoVault {
  readonly #key: Buffer;

  constructor(key: Uint8Array) {
    if (key.byteLength !== 32) {
      throw new TypeError("CryptoVault requires a 32-byte key");
    }
    this.#key = Buffer.from(key);
  }

  encrypt(plaintext: string, context: string): string {
    if (context.length < 1 || context.length > 200) {
      throw new TypeError("Encryption context has an invalid length");
    }
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      FORMAT_VERSION,
      iv.toString("base64url"),
      tag.toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(":");
  }

  decrypt(envelope: string, context: string): string {
    const parts = envelope.split(":");
    if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
      throw new TypeError("Encrypted value has an unsupported format");
    }
    const [, encodedIv, encodedTag, encodedCiphertext] = parts;
    if (!encodedIv || !encodedTag || !encodedCiphertext) {
      throw new TypeError("Encrypted value is incomplete");
    }
    const iv = Buffer.from(encodedIv, "base64url");
    const tag = Buffer.from(encodedTag, "base64url");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");
    if (iv.length !== IV_BYTES || tag.length !== 16 || ciphertext.length === 0) {
      throw new TypeError("Encrypted value is malformed");
    }
    const decipher = createDecipheriv("aes-256-gcm", this.#key, iv);
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }
}
