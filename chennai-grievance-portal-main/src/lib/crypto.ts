import crypto from "crypto";
import { encryptionSecret } from "@/lib/secrets";
import { SECRET_PREFIX, decryptSecretValue, encryptSecretValue, piiEnabled } from "@/lib/pii";

// AES-256-GCM for Aadhaar numbers and other secrets at rest. With DATA_ENCRYPTION_KEY set (lib/pii.ts) a value is locked with
// it and carries its key id (encx:v1:...). Values locked before that, and every value when no data key is set, use the older
// key derived from AADHAAR_ENCRYPTION_KEY, else JWT_SECRET (lib/secrets.ts: production refuses a missing or short one), so
// rows saved earlier still unlock.
let key: Buffer | null = null;
const KEY = () => (key ??= crypto.createHash("sha256").update(encryptionSecret()).digest()); // 32 bytes

function legacyEncrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/** Unlocks a value locked the old way (no key id). */
export function legacyDecrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  // the tag length is stated, not taken from whatever the payload carries: a short tag is a weak check (RC-25)
  if (authTag.length !== 16) throw new Error("Invalid encrypted payload.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY(), iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export function encryptAadhaar(plain: string): string {
  return piiEnabled() ? encryptSecretValue("aadhaar", plain) : legacyEncrypt(plain);
}

export function decryptAadhaar(payload: string): string {
  return payload.startsWith(SECRET_PREFIX) ? decryptSecretValue("aadhaar", payload) : legacyDecrypt(payload);
}

export function maskAadhaar(last4: string | null): string {
  if (!last4) return "";
  return `XXXX-XXXX-${last4}`;
}

/** AES-256-GCM for other secrets at rest (e.g. credentials of connected sources). */
export function encryptSecret(plain: string): string {
  return piiEnabled() ? encryptSecretValue("secret", plain) : legacyEncrypt(plain);
}
export function decryptSecret(payload: string): string {
  return payload.startsWith(SECRET_PREFIX) ? decryptSecretValue("secret", payload) : legacyDecrypt(payload);
}
