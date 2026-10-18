import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const keyLength = 32;

/** Faster params for serverless. Legacy hashes omit n/r/p and use Node defaults (N=16384). */
const fastOptions = { N: 4096, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const legacyOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

type ScryptOptions = { N: number; r: number; p: number; maxmem: number };

function scryptAsync(password: string, salt: string, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derived) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derived as Buffer);
    });
  });
}

function parseStored(stored: string): { salt: string; hash: string; options: ScryptOptions; modern: boolean } | null {
  const parts = stored.split("$");
  if (parts[0] !== "scrypt") {
    return null;
  }
  // scrypt$n=4096$r=8$p=1$salt$hash
  if (parts.length === 6 && parts[1]?.startsWith("n=") && parts[2]?.startsWith("r=") && parts[3]?.startsWith("p=")) {
    const N = Number(parts[1].slice(2));
    const r = Number(parts[2].slice(2));
    const p = Number(parts[3].slice(2));
    const salt = parts[4] ?? "";
    const hash = parts[5] ?? "";
    if (!salt || !hash || !Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
      return null;
    }
    return { salt, hash, options: { N, r, p, maxmem: 64 * 1024 * 1024 }, modern: true };
  }
  // scrypt$salt$hash (legacy)
  if (parts.length === 3 && parts[1] && parts[2]) {
    return { salt: parts[1], hash: parts[2], options: legacyOptions, modern: false };
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, fastOptions)).toString("hex");
  return `scrypt$n=${fastOptions.N}$r=${fastOptions.r}$p=${fastOptions.p}$${salt}$${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseStored(stored);
  if (!parsed) {
    return false;
  }
  const actual = await scryptAsync(password, parsed.salt, parsed.options);
  const expected = Buffer.from(parsed.hash, "hex");
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

export function passwordNeedsRehash(stored: string): boolean {
  const parsed = parseStored(stored);
  return !parsed || !parsed.modern || parsed.options.N > fastOptions.N;
}

/**
 * Fixed modern-format placeholder so unknown emails still pay one scrypt.
 * Hash bytes are not a real derivation; verify still runs scrypt then fails the compare.
 */
export const dummyPasswordHash =
  "scrypt$n=4096$r=8$p=1$0123456789abcdef0123456789abcdef$0000000000000000000000000000000000000000000000000000000000000000";
