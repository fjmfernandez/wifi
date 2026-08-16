import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";

interface ScryptParameters {
  logN: number;
  r: number;
  p: number;
  keyLength: number;
}

const productionParameters: ScryptParameters = { logN: 17, r: 8, p: 1, keyLength: 32 };

function derive(password: string, salt: Buffer, parameters: ScryptParameters): Promise<Buffer> {
  const N = 2 ** parameters.logN;
  return new Promise((resolve, reject) => {
    nodeScrypt(
      password.normalize("NFKC"),
      salt,
      parameters.keyLength,
      { N, r: parameters.r, p: parameters.p, maxmem: 256 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

export async function hashAdminPassword(
  password: string,
  parameters: ScryptParameters = productionParameters,
): Promise<string> {
  if (password.length < 12 || password.length > 1024)
    throw new RangeError("Admin passwords must contain between 12 and 1024 characters");
  if (
    parameters.logN < 12 ||
    parameters.logN > 20 ||
    parameters.r < 1 ||
    parameters.p < 1 ||
    parameters.keyLength < 32
  )
    throw new RangeError("Unsafe scrypt parameters");
  const salt = randomBytes(16);
  const derived = await derive(password, salt, parameters);
  return `$scrypt$ln=${parameters.logN},r=${parameters.r},p=${parameters.p},l=${parameters.keyLength}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyAdminPassword(password: string, encoded: string): Promise<boolean> {
  const match =
    /^\$scrypt\$ln=(\d+),r=(\d+),p=(\d+),l=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/.exec(
      encoded,
    );
  if (!match) return false;
  const [, logNRaw, rRaw, pRaw, lengthRaw, saltRaw, digestRaw] = match;
  if (!logNRaw || !rRaw || !pRaw || !lengthRaw || !saltRaw || !digestRaw) return false;
  const parameters = {
    logN: Number(logNRaw),
    r: Number(rRaw),
    p: Number(pRaw),
    keyLength: Number(lengthRaw),
  };
  if (
    parameters.logN < 12 ||
    parameters.logN > 20 ||
    parameters.r < 1 ||
    parameters.r > 32 ||
    parameters.p < 1 ||
    parameters.p > 16 ||
    parameters.keyLength < 32 ||
    parameters.keyLength > 64
  )
    return false;
  const expected = Buffer.from(digestRaw, "base64url");
  if (expected.byteLength !== parameters.keyLength) return false;
  const actual = await derive(password, Buffer.from(saltRaw, "base64url"), parameters);
  return timingSafeEqual(actual, expected);
}
