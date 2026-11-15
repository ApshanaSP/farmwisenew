import { afterEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import {
  LOCKED, PII_PREFIX, SECRET_PREFIX, blindIndex, decryptFile, decryptPii, decryptRow, encryptFile, encryptPii, installPii, otpIdentifier,
  piiEnabled, piiMatch, piiParams, registerPii
} from "./pii";
import { decryptAadhaar, decryptSecret, encryptAadhaar, encryptSecret, legacyDecrypt } from "./crypto";

const sqlite = () => (process as unknown as { getBuiltinModule(id: string): unknown }).getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
const key = () => crypto.randomBytes(32).toString("base64");

afterEach(() => vi.unstubAllEnvs());

function withKeys(data = key(), index = key()) {
  vi.stubEnv("DATA_ENCRYPTION_KEY", data);
  vi.stubEnv("BLIND_INDEX_KEY", index);
  return { data, index };
}

describe("without a key", () => {
  it("leaves values as they are and matches nothing by fingerprint", () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", "");
    vi.stubEnv("BLIND_INDEX_KEY", "");
    expect(piiEnabled()).toBe(false);
    expect(encryptPii("mobile", "9876543210")).toBe("9876543210");
    expect(otpIdentifier("a@b.in")).toBe("a@b.in");
    expect(piiParams("mobile", "9876543210")[1]).toContain("no match");
    expect(encryptFile(Buffer.from("x"), "profile-photo").toString()).toBe("x");
  });
});

describe("with a key", () => {
  it("locks with a fresh IV each time and unlocks", () => {
    withKeys();
    const a = encryptPii("mobile", "9876543210") as string, b = encryptPii("mobile", "9876543210") as string;
    expect(a.startsWith(PII_PREFIX)).toBe(true);
    expect(a).not.toBe(b); // the same number never looks the same twice
    expect(a).not.toContain("9876543210");
    expect(decryptPii(a)).toBe("9876543210");
    expect(encryptPii("mobile", a)).toBe(a); // never locked twice
    expect(encryptPii("name", "")).toBe("");
    expect(encryptPii("name", null)).toBe(null);
  });

  it("a changed byte, or another key, reads as LOCKED instead of garbage", () => {
    withKeys();
    const v = encryptPii("name", "Kavitha R") as string;
    const body = Buffer.from(v.split(":").pop()!, "base64");
    body[body.length - 1] ^= 1;
    expect(decryptPii(v.slice(0, v.lastIndexOf(":") + 1) + body.toString("base64"))).toBe(LOCKED);
    withKeys(); // a different key: the copy of the site without the right key
    expect(decryptPii(v)).toBe(LOCKED);
  });

  it("old keys still unlock after a rotation", () => {
    const { data, index } = withKeys();
    const v = encryptPii("address", "12, Gandhi St") as string;
    vi.stubEnv("DATA_ENCRYPTION_KEY", key());
    vi.stubEnv("DATA_ENCRYPTION_KEY_OLD", data);
    vi.stubEnv("BLIND_INDEX_KEY", index);
    expect(decryptPii(v)).toBe("12, Gandhi St");
  });

  it("refuses a key that is not 32 random bytes", () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", "my password");
    expect(() => piiEnabled()).toThrow(/32 random bytes/);
  });

  it("the same number typed differently has one fingerprint; others differ", () => {
    withKeys();
    expect(blindIndex("mobile", "+91 98765 43210")).toBe(blindIndex("mobile", "9876543210"));
    expect(blindIndex("name", " R.  Kumar ")).toBe(blindIndex("name", "r. kumar"));
    expect(blindIndex("mobile", "9876543211")).not.toBe(blindIndex("mobile", "9876543210"));
    expect(otpIdentifier("A@B.in")).toMatch(/^bidx:[0-9a-f]{24}$/);
  });

  it("decryptRow unlocks only locked strings", () => {
    withKeys();
    const row = decryptRow({ id: 1, first_name: encryptPii("name", "Arul"), ward: 12, title: "Drain block" });
    expect(row).toEqual({ id: 1, first_name: "Arul", ward: 12, title: "Drain block" });
  });

  it("files round-trip, and old plain files still read", () => {
    withKeys();
    const photo = crypto.randomBytes(5000);
    const locked = encryptFile(photo, "petition-page");
    expect(locked.subarray(0, 8).toString()).toBe("DIQENC1\n");
    expect(decryptFile(locked, "petition-page")!.equals(photo)).toBe(true);
    expect(decryptFile(locked, "profile-photo")).toBe(null); // a petition page is not a profile photo
    expect(decryptFile(photo, "petition-page")!.equals(photo)).toBe(true);
  });
});

describe("in the store", () => {
  function store() {
    const db = new (sqlite().DatabaseSync)(":memory:");
    registerPii(db);
    db.exec(`CREATE TABLE complaints (id INTEGER PRIMARY KEY AUTOINCREMENT, complaint_code TEXT, first_name TEXT, mobile_number TEXT, street_address TEXT, title TEXT, status TEXT);
             CREATE TABLE petitions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT COLLATE NOCASE, mobile TEXT, full_text TEXT, status TEXT);
             CREATE TABLE user_profiles (id INTEGER PRIMARY KEY, user_id INTEGER, first_name TEXT, mobile_number TEXT UNIQUE, aadhaar_number_encrypted TEXT);
             CREATE TABLE password_resets (id INTEGER PRIMARY KEY, identifier TEXT);
             CREATE TABLE _changes (id INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT, k TEXT);
             CREATE TRIGGER ch AFTER UPDATE ON complaints BEGIN INSERT INTO _changes (t, k) VALUES ('complaints', NEW.id); END;
             ALTER TABLE complaints ADD COLUMN updated_at TEXT DEFAULT '2026-01-01 10:00:00';
             CREATE TRIGGER "complaints__touch_updated_at" AFTER UPDATE ON "complaints" FOR EACH ROW WHEN NEW."updated_at" IS OLD."updated_at"
               BEGIN UPDATE "complaints" SET "updated_at" = '2099-12-31 00:00:00' WHERE rowid = NEW.rowid; END;`);
    return db;
  }

  it("locking old rows keeps their last-updated time; a real update still stamps it", () => {
    withKeys();
    const db = store();
    db.exec(`INSERT INTO complaints (complaint_code, first_name, updated_at) VALUES ('C5', 'Old Row', '2026-09-24 21:42:09')`);
    installPii(db);
    const r = db.prepare("SELECT first_name, updated_at FROM complaints WHERE complaint_code = 'C5'").get() as Record<string, string>;
    expect(r.first_name.startsWith(PII_PREFIX)).toBe(true);
    expect(r.updated_at).toBe("2026-09-24 21:42:09");
    db.exec("UPDATE complaints SET status = 'In Progress' WHERE complaint_code = 'C5'"); // the touch trigger is back
    expect((db.prepare("SELECT updated_at FROM complaints WHERE complaint_code = 'C5'").get() as { updated_at: string }).updated_at).toBe("2099-12-31 00:00:00");
  });

  it("locks rows saved before, then every insert and update; lookups and reads still work", () => {
    withKeys();
    const db = store();
    db.exec(`INSERT INTO complaints (complaint_code, first_name, mobile_number, street_address, title) VALUES ('C1', 'Meena', '9000000001', '4 Lake Rd', 'No water');
             INSERT INTO password_resets (identifier) VALUES ('meena@example.in');`);
    expect(installPii(db)).toBe(2);
    expect(installPii(db)).toBe(0); // nothing left unlocked
    db.prepare("INSERT INTO complaints (complaint_code, first_name, mobile_number, street_address, title) VALUES (?, ?, ?, ?, ?)").run("C2", "Ravi", "9000000002", "9 Hill St", "Pothole");
    const raw = db.prepare("SELECT * FROM complaints ORDER BY id").all() as Record<string, string>[];
    for (const r of raw) {
      for (const c of ["first_name", "mobile_number", "street_address"]) expect(r[c].startsWith(PII_PREFIX)).toBe(true);
      expect(r.title).not.toMatch(/^enc:/); // what the dashboards count stays readable
    }
    expect(JSON.stringify(raw)).not.toMatch(/Meena|Ravi|900000000|Lake Rd/);
    // the change went to _changes, so it is sent to AWS locked
    expect((db.prepare("SELECT count(*) n FROM _changes").get() as { n: number }).n).toBeGreaterThan(0);
    // an update of a personal column is locked too; an update of anything else leaves it alone
    db.prepare("UPDATE complaints SET mobile_number = ? WHERE complaint_code = 'C2'").run("9000000003");
    db.prepare("UPDATE complaints SET status = 'Done' WHERE complaint_code = 'C2'").run();
    const c2 = db.prepare("SELECT * FROM complaints WHERE complaint_code = 'C2'").get() as Record<string, unknown>;
    expect(String(c2.mobile_number).startsWith(PII_PREFIX)).toBe(true);
    expect(decryptRow(c2)).toMatchObject({ first_name: "Ravi", mobile_number: "9000000003", status: "Done" });
    // exact lookup by fingerprint
    const find = (m: string) => db.prepare(`SELECT complaint_code FROM complaints WHERE ${piiMatch("mobile_number")}`).all(...piiParams("mobile", m)) as { complaint_code: string }[];
    expect(find("9000000001").map((r) => r.complaint_code)).toEqual(["C1"]);
    expect(find("+91 90000 00003").map((r) => r.complaint_code)).toEqual(["C2"]);
    expect(find("9000000002")).toEqual([]);
    // OTP rows name nobody
    expect((db.prepare("SELECT identifier FROM password_resets").get() as { identifier: string }).identifier).toBe(otpIdentifier("meena@example.in"));
  });

  it("petition names are found by name whatever the case, and the full text is locked", () => {
    withKeys();
    const db = store();
    installPii(db);
    db.prepare("INSERT INTO petitions (name, mobile, full_text, status) VALUES (?, ?, ?, 'filed')").run("R. Kumar", "9000000009", "I, R. Kumar of 3 Main Rd ...");
    const raw = db.prepare("SELECT * FROM petitions").get() as Record<string, string>;
    expect(raw.full_text.startsWith(PII_PREFIX)).toBe(true);
    const hit = db.prepare(`SELECT id FROM petitions WHERE ${piiMatch("name")}`).all(...piiParams("name", "r. kumar"));
    expect(hit).toHaveLength(1);
  });

  it("a plain row still matches by value (no key, or a row from before)", () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", "");
    vi.stubEnv("BLIND_INDEX_KEY", "");
    const db = store();
    installPii(db);
    db.exec("INSERT INTO complaints (complaint_code, mobile_number) VALUES ('C9', '9000000010')");
    expect((db.prepare("SELECT mobile_number FROM complaints").get() as { mobile_number: string }).mobile_number).toBe("9000000010");
    expect(db.prepare(`SELECT 1 FROM complaints WHERE ${piiMatch("mobile_number")}`).all(...piiParams("mobile", "9000000010"))).toHaveLength(1);
  });

  it("an Aadhaar number locked the old way moves to the new key and still unlocks", () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", "");
    vi.stubEnv("JWT_SECRET", "k".repeat(40));
    const old = encryptAadhaar("123412341234");
    expect(old.startsWith(SECRET_PREFIX)).toBe(false);
    withKeys();
    const db = store();
    db.prepare("INSERT INTO user_profiles (id, user_id, aadhaar_number_encrypted) VALUES (1, 1, ?)").run(old);
    installPii(db, legacyDecrypt);
    const now = (db.prepare("SELECT aadhaar_number_encrypted a FROM user_profiles").get() as { a: string }).a;
    expect(now.startsWith(SECRET_PREFIX)).toBe(true);
    expect(decryptAadhaar(now)).toBe("123412341234");
    expect(decryptRow({ a: now }).a).toBe(now); // never unlocked by the read path
    expect(decryptSecret(encryptSecret("source-pass"))).toBe("source-pass");
  });
});

describe("scripts", () => {
  it("encrypt-private-files.js writes what decryptFile reads, and leaves locked files alone", () => {
    const { data } = withKeys();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pii-files-"));
    const photo = crypto.randomBytes(3000);
    const name = `${"a".repeat(32)}.jpg`;
    fs.writeFileSync(path.join(dir, name), photo);
    const run = () => execFileSync(process.execPath, [path.join(__dirname, "..", "..", "scripts", "encrypt-private-files.js")],
      { env: { ...process.env, DATA_ENCRYPTION_KEY: data, PETITION_UPLOAD_DIR: dir, PROFILE_UPLOAD_DIR: path.join(dir, "none") }, encoding: "utf8" });
    expect(run()).toMatch(/petition-page: 1 locked, 0 already/);
    expect(run()).toMatch(/petition-page: 0 locked, 1 already/);
    const locked = fs.readFileSync(path.join(dir, name));
    expect(locked.equals(photo)).toBe(false);
    expect(decryptFile(locked, "petition-page")!.equals(photo)).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
