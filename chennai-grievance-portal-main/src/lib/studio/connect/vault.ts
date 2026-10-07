/**
 * The sign-in details of a connected link, and the browser session kept after signing in. Stored next to the dataset
 * as data/studio/<id>.auth, encrypted with AES-256-GCM (lib/crypto: the key comes from the server's environment),
 * so a copied data folder does not give the passwords away. Nothing here is ever sent to the page or to an AI model:
 * the page sees only the mode and the user name.
 */
import fs from "fs";
import path from "path";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { validId } from "@/lib/studio/store";
import type { AuthInput, AuthMode } from "@/lib/studio/types";
import type { Credentials } from "@/lib/studio/fetchurl";

const DIR = path.join(process.cwd(), "data", "studio");
const file = (id: string) => {
  if (!validId(id)) throw new Error("Unknown dataset.");
  return path.join(DIR, `${id}.auth`);
};

export interface Vaulted {
  auth: AuthInput;
  /** Playwright's storage state (cookies and local storage) after signing in, and until when it is trusted */
  session: string | null;
  sessionAt: string | null;
}

export function saveVault(id: string, v: Vaulted) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${file(id)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, encryptSecret(JSON.stringify(v)), { mode: 0o600 });
  fs.renameSync(tmp, file(id));
}

export function getVault(id: string): Vaulted | null {
  try { return JSON.parse(decryptSecret(fs.readFileSync(file(id), "utf8"))) as Vaulted; } catch { return null; }
}

export function dropVault(id: string) { try { fs.rmSync(file(id), { force: true }); } catch { /* gone */ } }

/** Keep the browser session after a successful sign-in, so the next refresh does not sign in again. */
export function saveSession(id: string, session: string | null) {
  const v = getVault(id);
  if (v) saveVault(id, { ...v, session, sessionAt: session ? new Date().toISOString() : null });
}

/** A clean sign-in: trimmed, only the fields its mode uses, nothing empty. */
export function cleanAuth(a: AuthInput | null | undefined): AuthInput {
  const mode: AuthMode = a?.mode ?? "none";
  const t = (s?: string, n = 400) => (s ?? "").trim().slice(0, n) || undefined;
  switch (mode) {
    case "apikey": return { mode, key: t(a!.key, 2000), keyName: t(a!.keyName, 80) ?? "api-key", keyPlace: a!.keyPlace === "header" ? "header" : "query" };
    case "basic": return { mode, username: t(a!.username, 200), password: a!.password ?? "" };
    case "login": return { mode, username: t(a!.username, 200), password: a!.password ?? "", loginUrl: t(a!.loginUrl, 1000) };
    case "manual": return { mode, loginUrl: t(a!.loginUrl, 1000) };
    default: return { mode: "none" };
  }
}

/** What a plain download sends: an API key (header or query) or HTTP Basic, to the link's own host only. */
export function credentialsFor(url: string, a: AuthInput): Credentials | null {
  const host = new URL(url).host;
  if (a.mode === "apikey" && a.key) {
    const name = a.keyName || "api-key";
    if (a.keyPlace === "header") {
      // "Authorization" takes the key as a bearer token unless it already says how
      const value = /^authorization$/i.test(name) && !/\s/.test(a.key) ? `Bearer ${a.key}` : a.key;
      return { host, headers: { [name]: value } };
    }
    return { host, query: { [name]: a.key } };
  }
  if (a.mode === "basic" && a.username) return { host, headers: { Authorization: "Basic " + Buffer.from(`${a.username}:${a.password ?? ""}`).toString("base64") } };
  return null;
}
