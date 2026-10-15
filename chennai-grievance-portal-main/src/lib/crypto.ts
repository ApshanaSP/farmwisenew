import crypto from "crypto";
import { encryptionSecret } from "@/lib/secrets";

// Simple AES-256-GCM encryption for Aadhaar-at-rest. The key is derived
// from AADHAAR_ENCRYPTION_KEY, else JWT_SECRET (lib/secrets.ts: production
// refuses a missing or short one instead of using a built-in key).
let key: Buffer | null = null;
const KEY = () => (key ??= crypto.createHash("sha256").update(encryptionSecret()).digest()); // 32 bytes

export function encryptAadhaar(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptAadhaar(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export function maskAadhaar(last4: string | null): string {
  if (!last4) return "";
  return `XXXX-XXXX-${last4}`;
}

/** AES-256-GCM for other secrets at rest (e.g. credentials of connected sources); same key as above. */
export const encryptSecret = encryptAadhaar;
export const decryptSecret = decryptAadhaar;
