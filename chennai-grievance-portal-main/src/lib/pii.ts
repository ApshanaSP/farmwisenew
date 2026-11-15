import crypto from "crypto";
import type { DatabaseSync } from "node:sqlite";

/**
 * Field-level encryption of personal data (names, mobile numbers, e-mails, addresses, dates of birth, petition text).
 *
 * Where it happens: inside the store. Triggers on the durable tables (installPii) lock each personal column the moment a row
 * is saved, so the copy on this PC (data/aws-cache/durable.sqlite), the rows in DynamoDB and the S3 copies /store/load makes
 * hold only ciphertext. Every query result is unlocked in one place (lib/aws/store.ts run → decryptRow), so pages and
 * routes read plain values as before. No key set (tests, a fresh checkout): nothing is locked and everything works as before.
 *
 * Format of a locked value:  enc:v1:<key id>:<blind index or ->:<base64(iv 12 | tag 16 | ciphertext)>
 *  - AES-256-GCM (authenticated: a changed byte fails instead of decrypting to garbage), a fresh random IV per value.
 *  - The value's kind (mobile, name, ...) is authenticated with it (AAD); a field value can never be opened as a file, an Aadhaar
 *    number or a source's password, nor the other way round.
 *  - The key id (first 8 hex of SHA-256 of the key) says which key locked it, so keys can be changed: the new key locks,
 *    old keys listed in DATA_ENCRYPTION_KEY_OLD still unlock.
 *  - The blind index is a keyed fingerprint (HMAC-SHA-256, its own key) of the normalised value, so "the same mobile number"
 *    can still be found with an exact match (piiMatch) without unlocking every row. It reveals only that two values are equal.
 * Values that must never be unlocked automatically (Aadhaar numbers, passwords of connected sources) use the prefix encx:
 * and are unlocked only by the code that needs them (lib/crypto.ts).
 *
 * Keys: DATA_ENCRYPTION_KEY and BLIND_INDEX_KEY, each 32 random bytes as base64 or hex (scripts/pii-keys.js makes them).
 * Losing DATA_ENCRYPTION_KEY loses the locked data: keep a copy in a password manager.
 */

export const PII_PREFIX = "enc:v1:";
export const SECRET_PREFIX = "encx:v1:";
/** What a value reads as when no key here can unlock it (a copy of the site without the key). */
export const LOCKED = "[encrypted]";

export type PiiKind = "name" | "mobile" | "email" | "address" | "dob" | "text" | "aadhaar" | "secret";

/** The personal columns of each durable table, with their kind. */
export const PII_COLUMNS: Record<string, Record<string, PiiKind>> = {
  complaints: { first_name: "name", last_name: "name", street_address: "address", mobile_number: "mobile", phone_number: "mobile", email: "email" },
  user_profiles: { first_name: "name", last_name: "name", date_of_birth: "dob", mobile_number: "mobile", alternate_email: "email", door_no_and_street: "address" },
  // Manu Desk: what was read off the paper (the reading JSON and the full text carry the name, number and address too)
  petitions: { name: "name", mobile: "mobile", address: "address", full_text: "text", reading: "text" }
};

/** Kinds that get a blind index, so an exact match can find them (piiMatch). */
const INDEXED = new Set<PiiKind>(["name", "mobile", "email"]);

interface Key { id: string; key: Buffer }
interface Keyring { sig: string; current: Key | null; byId: Map<string, Key>; index: Buffer | null }
let ring: Keyring | null = null;
let warned = false;

/** 32 bytes from base64 or hex; anything else is refused (a typed password is not a key). */
export function parseKey(name: string, raw: string): Buffer {
  const v = raw.trim();
  const b = /^[0-9a-f]{64}$/i.test(v) ? Buffer.from(v, "hex") : Buffer.from(v, "base64");
  if (b.length !== 32 || (!/^[0-9a-f]{64}$/i.test(v) && b.toString("base64").replace(/=+$/, "") !== v.replace(/=+$/, "")))
    throw new Error(`${name} must be 32 random bytes written as base64 (44 characters) or hex (64 characters). Make one with: node scripts/pii-keys.js`);
  return b;
}

const keyId = (k: Buffer) => crypto.createHash("sha256").update(k).digest("hex").slice(0, 8);

function keyring(): Keyring {
  const env = process.env;
  const sig = `${env.DATA_ENCRYPTION_KEY ?? ""}|${env.DATA_ENCRYPTION_KEY_OLD ?? ""}|${env.BLIND_INDEX_KEY ?? ""}`;
  if (ring && ring.sig === sig) return ring;
  const byId = new Map<string, Key>();
  let current: Key | null = null;
  if (env.DATA_ENCRYPTION_KEY?.trim()) {
    const key = parseKey("DATA_ENCRYPTION_KEY", env.DATA_ENCRYPTION_KEY);
    current = { id: keyId(key), key };
    byId.set(current.id, current);
  }
  for (const [i, old] of (env.DATA_ENCRYPTION_KEY_OLD ?? "").split(",").map((s) => s.trim()).filter(Boolean).entries()) {
    const key = parseKey(`DATA_ENCRYPTION_KEY_OLD (key ${i + 1})`, old);
    byId.set(keyId(key), { id: keyId(key), key });
  }
  let index: Buffer | null = null;
  if (env.BLIND_INDEX_KEY?.trim()) index = parseKey("BLIND_INDEX_KEY", env.BLIND_INDEX_KEY);
  // no index key of its own: one derived from the data key (HKDF), so lookups still work; its own key survives a data key change
  else if (current) index = Buffer.from(crypto.hkdfSync("sha256", current.key, Buffer.alloc(0), "district-iq blind index v1", 32));
  if (!current && !warned && env.NODE_ENV === "production") {
    warned = true;
    console.error("[pii] DATA_ENCRYPTION_KEY is not set: names, mobile numbers and addresses are saved WITHOUT encryption.");
  }
  ring = { sig, current, byId, index };
  return ring;
}

/** Is a key set, so personal data is locked when saved? */
export function piiEnabled(): boolean {
  return keyring().current !== null;
}

/** The value a blind index is taken of: the same person's number or name typed differently gives the same index. */
export function normalise(kind: PiiKind | "otp", value: string): string {
  const v = value.normalize("NFKC").trim();
  if (kind === "mobile") return v.replace(/\D/g, "").slice(-10);
  if (kind === "name") return v.toLowerCase().replace(/\s+/g, " ");
  return v.toLowerCase();
}

/** The blind index of a value (24 hex), or null with no key. */
export function blindIndex(kind: PiiKind | "otp", value: string): string | null {
  const k = keyring().index;
  if (!k) return null;
  return crypto.createHmac("sha256", k).update(`${kind}\u0000${normalise(kind, value)}`).digest("hex").slice(0, 24);
}

function seal(prefix: string, kind: PiiKind, plain: string, index: string | null): string {
  const cur = keyring().current!;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", cur.key, iv);
  c.setAAD(Buffer.from(kind));
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${prefix}${cur.id}:${index ?? "-"}:${Buffer.concat([iv, c.getAuthTag(), body]).toString("base64")}`;
}

/** Locks a personal value. Unchanged when it is empty, already locked, or no key is set. */
export function encryptPii(kind: PiiKind, value: unknown): unknown {
  if (typeof value !== "string" || value === "" || value.startsWith(PII_PREFIX) || value.startsWith(SECRET_PREFIX) || !piiEnabled()) return value;
  return seal(PII_PREFIX, kind, value, INDEXED.has(kind) && normalise(kind, value) ? blindIndex(kind, value) : null);
}

/** Locks a value that is unlocked only on purpose (Aadhaar, a source's password). Throws with no key: callers fall back. */
export function encryptSecretValue(kind: "aadhaar" | "secret", value: string): string {
  if (!piiEnabled()) throw new Error("DATA_ENCRYPTION_KEY is not set");
  return seal(SECRET_PREFIX, kind, value, null);
}

const unlocked = new Map<string, string>(); // locked text -> plain, so a page of 8,000 complaints is not unlocked again on every read
const CACHE_MAX = 50_000;

function open(prefix: string, value: string, kinds: readonly string[]): string | null {
  const rest = value.slice(prefix.length);
  const a = rest.indexOf(":"), b = rest.indexOf(":", a + 1);
  if (a < 0 || b < 0) return null;
  const key = keyring().byId.get(rest.slice(0, a));
  if (!key) return null;
  const buf = Buffer.from(rest.slice(b + 1), "base64");
  if (buf.length < 28) return null;
  for (const kind of kinds) {
    try {
      const d = crypto.createDecipheriv("aes-256-gcm", key.key, buf.subarray(0, 12), { authTagLength: 16 });
      d.setAAD(Buffer.from(kind));
      d.setAuthTag(buf.subarray(12, 28));
      return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
    } catch { /* another kind, or tampered */ }
  }
  return null;
}

const KINDS: PiiKind[] = ["mobile", "name", "email", "address", "dob", "text"];

/** Unlocks a personal value; anything not locked comes back as it is. A value no key here can unlock reads as LOCKED. */
export function decryptPii(value: unknown): unknown {
  if (typeof value !== "string" || !value.startsWith(PII_PREFIX)) return value;
  const hit = unlocked.get(value);
  if (hit !== undefined) return hit;
  const plain = open(PII_PREFIX, value, KINDS);
  if (plain === null) return LOCKED;
  if (unlocked.size >= CACHE_MAX) unlocked.clear();
  unlocked.set(value, plain);
  return plain;
}

/** Unlocks an encx: value (Aadhaar, a source's password). Throws when it cannot. */
export function decryptSecretValue(kind: "aadhaar" | "secret", value: string): string {
  const plain = open(SECRET_PREFIX, value, [kind]);
  if (plain === null) throw new Error("Invalid encrypted payload.");
  return plain;
}

/** Unlocks every locked value of a result row, in place. */
export function decryptRow<T extends Record<string, unknown>>(row: T): T {
  for (const k in row) {
    const v = row[k];
    if (typeof v === "string" && v.startsWith(PII_PREFIX)) (row as Record<string, unknown>)[k] = decryptPii(v);
  }
  return row;
}

/**
 * SQL for "column holds this value", locked or not: `(col = ? OR col LIKE ?)` with piiParams. The LIKE finds locked values by
 * their blind index; with no key it is a pattern nothing matches.
 */
export const piiMatch = (column: string) => `(${column} = ? OR ${column} LIKE ?)`;
export function piiParams(kind: PiiKind, value: string): [string, string] {
  const idx = INDEXED.has(kind) && normalise(kind, value) ? blindIndex(kind, value) : null;
  return [value, idx ?`${PII_PREFIX}%:${idx}:%` : "\u0000no match\u0000"];
}

/** What password_resets.identifier holds for an e-mail or mobile number: its fingerprint when a key is set, so OTP rows name nobody. */
export function otpIdentifier(identifier: string): string {
  const idx = blindIndex("otp", identifier);
  return idx ? `bidx:${idx}` : identifier;
}

// ------------------------------------------------------------------ files --

/** The first bytes of a locked file: "DIQENC1" and a newline, then the key id (8 ASCII hex), IV (12), tag (16), ciphertext. */
const FILE_MAGIC = Buffer.from("DIQENC1\n", "latin1");

/** Locks a file's bytes before they are written (petition scans, profile photos). Unchanged with no key. */
export function encryptFile(buf: Buffer, kind: "petition-page" | "profile-photo"): Buffer {
  if (!piiEnabled()) return buf;
  const cur = keyring().current!;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", cur.key, iv);
  c.setAAD(Buffer.from(kind));
  const body = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([FILE_MAGIC, Buffer.from(cur.id, "latin1"), iv, c.getAuthTag(), body]);
}

/** A file's bytes as written: unlocked when locked, else as they are (a file saved before). Null when no key here unlocks it. */
export function decryptFile(buf: Buffer, kind: "petition-page" | "profile-photo"): Buffer | null {
  if (buf.length < FILE_MAGIC.length || !buf.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC)) return buf;
  const at = FILE_MAGIC.length;
  const key = keyring().byId.get(buf.subarray(at, at + 8).toString("latin1"));
  if (!key || buf.length < at + 36) return null;
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", key.key, buf.subarray(at + 8, at + 20), { authTagLength: 16 });
    d.setAAD(Buffer.from(kind));
    d.setAuthTag(buf.subarray(at + 20, at + 36));
    return Buffer.concat([d.update(buf.subarray(at + 36)), d.final()]);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ in the store --

/** The SQL functions the triggers call. Registered on every connection that writes the durable tables. */
export function registerPii(db: DatabaseSync): void {
  const fn = (name: string, f: (...a: any[]) => unknown) => db.function(name, { deterministic: false, varargs: true }, f as any);
  fn("pii_enc", (kind: string, v: unknown) => encryptPii(kind as PiiKind, v) as any);
  fn("pii_otp", (v: unknown) => (typeof v === "string" && v && !v.startsWith("bidx:") ? otpIdentifier(v) : v) as any);
  fn("pii_rewrap", (v: unknown) => rewrapAadhaar(v) as any);
}

/** An Aadhaar number locked the old way (key from AADHAAR_ENCRYPTION_KEY / JWT_SECRET, no key id) locked again with the current key. */
let legacyOpen: ((payload: string) => string) | null = null;
export function setLegacyAadhaar(f: (payload: string) => string): void { legacyOpen = f; }
function rewrapAadhaar(v: unknown): unknown {
  if (typeof v !== "string" || !v || v.startsWith(SECRET_PREFIX) || !piiEnabled() || !legacyOpen) return v;
  try { return encryptSecretValue("aadhaar", legacyOpen(v)); } catch { return v; }
}

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const notLocked = (col: string) => `(typeof(${col}) = 'text' AND ${col} <> '' AND substr(${col}, 1, ${PII_PREFIX.length}) <> '${PII_PREFIX}')`;

/**
 * Creates the triggers that lock personal columns on every insert and update of the durable tables (only the columns a table
 * has), then, with a key set, locks the rows saved before (their changes go to AWS like any other write). Idempotent; call it
 * with registerPii done on `db`. Returns how many rows it locked.
 */
export function installPii(db: DatabaseSync, legacy?: (payload: string) => string): number {
  if (legacy) setLegacyAadhaar(legacy);
  const has = (t: string, c: string) => (db.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`).get(t, c) !== undefined);
  const sweeps: { t: string; sql: string }[] = [];
  for (const [t, cols] of Object.entries(PII_COLUMNS)) {
    const have = new Set((db.prepare(`SELECT name FROM pragma_table_info(?)`).all(t) as { name: string }[]).map((c) => c.name));
    const mine = Object.entries(cols).filter(([c]) => have.has(c));
    if (!mine.length) continue;
    const set = mine.map(([c, kind]) => `${q(c)} = pii_enc('${kind}', ${q(c)})`).join(", ");
    const when = mine.map(([c]) => notLocked(`NEW.${q(c)}`)).join(" OR ");
    const of = mine.map(([c]) => q(c)).join(", ");
    db.exec(`CREATE TRIGGER IF NOT EXISTS ${q(`_pii_${t}_ins`)} AFTER INSERT ON ${q(t)} WHEN ${when} BEGIN
               UPDATE ${q(t)} SET ${set} WHERE rowid = NEW.rowid; END;
             CREATE TRIGGER IF NOT EXISTS ${q(`_pii_${t}_upd`)} AFTER UPDATE OF ${of} ON ${q(t)} WHEN ${when} BEGIN
               UPDATE ${q(t)} SET ${set} WHERE rowid = NEW.rowid; END;`);
    sweeps.push({ t, sql: `UPDATE ${q(t)} SET ${set} WHERE ${mine.map(([c]) => notLocked(q(c))).join(" OR ")}` });
  }
  if (!piiEnabled()) return 0;
  // OTP rows: the e-mail or number they were sent to becomes its fingerprint
  if (has("password_resets", "identifier"))
    sweeps.push({ t: "password_resets", sql: `UPDATE password_resets SET identifier = pii_otp(identifier) WHERE substr(identifier, 1, 5) <> 'bidx:'` });
  // Aadhaar numbers locked with the old key (no key id) move to the current key
  if (has("user_profiles", "aadhaar_number_encrypted"))
    sweeps.push({ t: "user_profiles", sql: `UPDATE user_profiles SET aadhaar_number_encrypted = pii_rewrap(aadhaar_number_encrypted)
                                             WHERE aadhaar_number_encrypted IS NOT NULL AND substr(aadhaar_number_encrypted, 1, 8) <> '${SECRET_PREFIX}'` });
  // Locking an old row is not a change to it: the tables' <t>__touch_updated_at triggers would stamp every complaint "updated now",
  // so they are set aside while the old rows are locked and put back as they were, all in one savepoint
  let locked = 0;
  db.exec("SAVEPOINT pii_sweep");
  try {
    const touch = new Map<string, string>();
    for (const t of new Set(sweeps.map((s) => s.t)))
      for (const r of db.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ? AND name LIKE '%touch_updated_at'`).all(t) as { name: string; sql: string }[]) {
        touch.set(r.name, r.sql);
        db.exec(`DROP TRIGGER ${q(r.name)}`);
      }
    for (const s of sweeps) locked += Number(db.prepare(s.sql).run().changes);
    for (const sql of touch.values()) db.exec(sql);
    db.exec("RELEASE pii_sweep");
  } catch (e) {
    db.exec("ROLLBACK TO pii_sweep; RELEASE pii_sweep");
    throw e;
  }
  return locked;
}
