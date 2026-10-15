/**
 * Server secrets (the sign-in token key, the at-rest encryption key). In production a missing or short secret stops the
 * server instead of falling back to a value anyone can read in the source: with the fallback, anyone could forge a
 * Collector's token. Development keeps a clearly-labelled fallback so a fresh checkout still runs.
 * Edge-safe (no Node modules): middleware.ts verifies tokens with it.
 */

export const MIN_SECRET_BYTES = 32;

export class WeakSecretError extends Error {
  constructor(name: string) {
    super(`${name} is missing or shorter than ${MIN_SECRET_BYTES} bytes. Set a long random value in the server's environment before starting in production.`);
  }
}

const isProduction = () => process.env.NODE_ENV === "production";

/** `value` when it is long enough; else the dev fallback outside production, or WeakSecretError in production. */
export function strongSecret(name: string, value: string | undefined, devFallback: string): string {
  const v = (value ?? "").trim();
  if (new TextEncoder().encode(v).length >= MIN_SECRET_BYTES) return v;
  if (isProduction()) throw new WeakSecretError(name);
  return v || devFallback;
}

/** The token-signing secret (JWT_SECRET). */
export function jwtSecret(): string {
  return strongSecret("JWT_SECRET", process.env.JWT_SECRET, "dev_only_insecure_secret_change_me");
}

/**
 * The at-rest encryption secret: AADHAAR_ENCRYPTION_KEY, else JWT_SECRET (the order existing rows were encrypted with,
 * so they still decrypt).
 */
export function encryptionSecret(): string {
  const own = process.env.AADHAAR_ENCRYPTION_KEY;
  if (own && own.trim()) return strongSecret("AADHAAR_ENCRYPTION_KEY", own, "dev_only_key");
  return strongSecret("JWT_SECRET (used as AADHAAR_ENCRYPTION_KEY)", process.env.JWT_SECRET, "dev_only_key");
}

/** Called when the server starts: fails fast in production rather than on the first sign-in. */
export function assertSecrets(): void {
  jwtSecret();
  encryptionSecret();
}
