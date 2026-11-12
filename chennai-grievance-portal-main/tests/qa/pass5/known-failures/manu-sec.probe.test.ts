/**
 * QA pass 5, manu-sec: security probes on the Manu Desk and public tracking. Route handlers are called directly on an isolated
 * SQLite store (the AWS store's MySQL -> SQLite translation, as in src/lib/manu/manu.sqlite.test.ts); sessions are real signed
 * tokens in a mocked cookie jar, so the guards run as written. Nothing leaves the process; no model, SMS or mail.
 */
import fs from "fs";
import os from "os";
import path from "path";
import util from "util";
import zlib from "zlib";
import { DatabaseSync } from "node:sqlite";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { format as mysqlFormat } from "mysql2";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as import("node:sqlite").DatabaseSync, jar: new Map<string, string>(), hdr: new Headers(), failOn: null as RegExp | null }));
const run = (sql: string, params: unknown[] = []) => {
  if (h.failOn?.test(sql)) {
    // what mysql2 does on a server error: command.js:30 `err.sql = this.sql`, and connection.js:712-718 `cmdQuery.sql = this.format(sql, values)`
    const e = Object.assign(new Error("Deadlock found when trying to get lock; try restarting transaction"), { code: "ER_LOCK_DEADLOCK", errno: 1213, sql: mysqlFormat(sql, params as never[]) });
    throw e;
  }
  const [s, p] = expand(translate(sql), params);
  const st = h.db.prepare(s);
  if (/^\s*(SELECT|WITH)/i.test(s)) return [st.all(...(p as never[]))];
  const r = st.run(...(p as never[]));
  return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }];
};
const pool = { query: async (sql: string, params: unknown[] = []) => run(sql, params) };
vi.mock("@/lib/db", () => ({ default: pool, withTransaction: async (fn: (c: typeof pool) => Promise<unknown>) => { h.db.exec("BEGIN"); try { const v = await fn(pool); h.db.exec("COMMIT"); return v; } catch (e) { h.db.exec("ROLLBACK"); throw e; } } }));
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t, TITLE: "i.title" }));
vi.mock("@/lib/collector/sources", () => ({ audit: async () => undefined }));
vi.mock("@/lib/security/audit", () => ({ securityLog: async () => undefined, recentEvents: async () => [] }));
vi.mock("@/lib/mailer", () => ({ isSmtpConfigured: () => false, sendMail: async () => ({ ok: true }) }));
vi.mock("@/lib/manu/read", () => ({ readPetition: async () => ({ reading: READING, model: "test-model", ms: 10 }) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (h.jar.has(n) ? { name: n, value: h.jar.get(n)! } : undefined),
    getAll: () => [...h.jar].map(([name, value]) => ({ name, value })),
    has: (n: string) => h.jar.has(n), set: () => undefined, delete: () => undefined
  }),
  headers: async () => h.hdr
}));

const READING = {
  name: "க. பார்வதி", mobile: "9000041873", door_no: "27", street: "ஜவஹர் தெரு", area_en: "Perambur", pincode: "600011", ward: 70, date: "12.09.2026", aadhaar_last4: null,
  subject: "கழிவுநீர்", problem_en: "Sewage overflowing on the street", request_en: "Clear the block", language: "ta", department: "CMWSSB", category: "DRAINAGE_SEWAGE", urgent: false,
  unsure_fields: [], full_text: "அனுப்புநர்: க. பார்வதி"
};
const fields = (o: Record<string, unknown> = {}) => ({ name: "க. பார்வதி", mobile: "9000041873", door: "27", street: "ஜவஹர் தெரு", area: "Perambur", pincode: "600011", ward: 70, date: "12.09.2026",
  subject: "கழிவுநீர்", problem: "Sewage overflowing on the street", request: "Clear the block", dept: "CMWSSB", urgent: false, fullText: "அனுப்புநர்: க. பார்வதி, 27 ஜவஹர் தெரு", ...o });

const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]);
let dir = "";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "manusec-"));
process.env.PETITION_UPLOAD_DIR = tmp;
process.env.DATA_BACKEND = "aws";
delete process.env.TRUST_PROXY_HOPS;

const db = new DatabaseSync(":memory:");
setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
registerFunctions(db);
db.exec(`
  CREATE TABLE petitions (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL DEFAULT 'counter', status TEXT NOT NULL DEFAULT 'reading', pages TEXT NOT NULL, uploaded_by INT, uploaded_email TEXT, citizen_user_id INT, reading TEXT, read_model TEXT, read_ms INT, read_error TEXT,
    name TEXT, mobile TEXT, address TEXT, area TEXT, ward_number INT, dept_code TEXT, category_code TEXT, urgent INT NOT NULL DEFAULT 0, subject TEXT, problem TEXT, request TEXT, full_text TEXT, petition_date TEXT, language TEXT, complaint_code TEXT, complaint_id INT, incident_id TEXT,
    attached INT NOT NULL DEFAULT 0, filed_by TEXT, filed_at TEXT, due_at TEXT, reject_reason TEXT, created_at TEXT, updated_at TEXT);
  CREATE TABLE complaints (id INTEGER PRIMARY KEY, complaint_code TEXT, rejected_stage TEXT, remarks TEXT, user_id INT, first_name TEXT NOT NULL, gender TEXT NOT NULL, street_address TEXT NOT NULL, pincode TEXT, mobile_number TEXT, zone_id INT NOT NULL, ward_number INT NOT NULL, ward_source TEXT, specific_location TEXT,
    department_id INT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, is_anonymous INT NOT NULL, needs_manual_review INT NOT NULL, status TEXT NOT NULL, is_synthetic INT NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT);
  CREATE TABLE complaint_status_history (id INTEGER PRIMARY KEY, complaint_id INT, status TEXT, stage TEXT, remarks TEXT, changed_by INT, created_at TEXT);
  CREATE TABLE zone_wards (ward_number INT, zone_id INT); INSERT INTO zone_wards VALUES (70, 6);
  CREATE TABLE zones (id INT, zone_name TEXT); INSERT INTO zones VALUES (6, 'Thiru-Vi-Ka-Nagar');
  CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO departments VALUES (1, 'General Administration'), (2, 'Revenue Department'), (3, 'Electrical Department');
  CREATE TABLE gcc_areas (id INT, name TEXT); INSERT INTO gcc_areas VALUES (163, 'PERAMBUR');
  CREATE TABLE area_wards (area_id INT, ward_number INT, is_primary INT); INSERT INTO area_wards VALUES (163, 70, 1);
  CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, password_hash TEXT, role TEXT, department_id INT, dept_code TEXT, is_active INT, email_verified_at TEXT, email_verification_exempt INT, token_version INT, created_at TEXT, updated_at TEXT);
  CREATE TABLE petition_sms (id INTEGER PRIMARY KEY AUTOINCREMENT, complaint_code TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'waiting', result TEXT, detail TEXT, attempts INTEGER NOT NULL DEFAULT 0, tried_at TEXT, sent_at TEXT, created_at TEXT);
  CREATE UNIQUE INDEX petition_sms__one ON petition_sms (complaint_code, kind);
  CREATE TABLE officer_steps (incident_id TEXT, step TEXT, note TEXT, report_id INT, at TEXT);
  CREATE TABLE collector_decisions (incident_id TEXT, decision TEXT, note TEXT, decided_role TEXT, decided_at TEXT);
  CREATE TABLE officer_reports (report_id INT, incident_id TEXT, photo_dir TEXT, photos TEXT);
  CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, category_code TEXT, category_label TEXT, family TEXT, lead_dept TEXT, first_reported_at TEXT, last_update_at TEXT, ward_no INT, zone_no INT, zone_name TEXT, taluk_code TEXT, lat REAL, lon REAL, loc_precision_m REAL,
    place_text TEXT, member_count INT, sources TEXT, channels TEXT, citizen_complaints INT, status_std TEXT, is_open INT, severity_level TEXT, sla_hours REAL, sla_due_at TEXT, priority_score REAL, attention_flag INT, attention_reason TEXT, recurrence_90d INT, title TEXT, headline TEXT, summary TEXT);
  CREATE TABLE events (event_id TEXT PRIMARY KEY, source TEXT, source_record_id TEXT, incident_id TEXT, text TEXT, title TEXT, channel TEXT, reporter_hash TEXT, ward_no INT);
  CREATE TABLE incident_members (incident_id TEXT, event_id TEXT, source TEXT, source_record_id TEXT, channel TEXT, reported_at TEXT, title TEXT);
  CREATE TABLE incident_timeline (event_id TEXT, at TEXT, step TEXT, status_std TEXT, actor TEXT, note TEXT, source TEXT, incident_id TEXT);
  CREATE TABLE ref_wards (ward_no INT PRIMARY KEY, zone_no INT, zone_name TEXT, taluk_code TEXT, centroid_lat REAL, centroid_lon REAL);
  INSERT INTO ref_wards VALUES (70, 6, 'Thiru-Vi-Ka-Nagar', 'TLK-PER', 13.11, 80.23);
  CREATE TABLE ref_categories (category_code TEXT PRIMARY KEY, label TEXT, family TEXT);
  INSERT INTO ref_categories VALUES ('DRAINAGE_SEWAGE', 'Drainage & sewage', 'DRAINAGE'), ('OTHER', 'Other', 'OTHER');
  CREATE TABLE ref_departments (code TEXT, name TEXT, org TEXT, head TEXT, route TEXT, action_owner INT);
  INSERT INTO ref_departments VALUES ('CMWSSB', 'Metrowater', 'CMWSSB', 'MD', '', 1), ('GCC-ELE', 'Electrical', 'GCC', 'SE', '', 1);
  INSERT INTO users (id, email, password_hash, role, department_id, dept_code, is_active, token_version) VALUES
    (10, 'petition@chennai.gov.in', 'x', 'department_officer', NULL, 'COL-PET', 1, 0),
    (11, 'officer.a@test.local', 'x', 'department_officer', NULL, 'CMWSSB', 1, 0),
    (12, 'officer.b@test.local', 'x', 'department_officer', NULL, 'GCC-ELE', 1, 0),
    (20, 'collector@test.local', 'x', 'collector', NULL, NULL, 1, 0),
    (30, 'citizen@test.local', 'x', 'citizen', NULL, NULL, 1, 0);
`);
h.db = db;

const { POST: login } = await import("@/app/api/auth/login/route");
const petitionsR = await import("@/app/api/manu/petitions/route");
const petitionR = await import("@/app/api/manu/petitions/[id]/route");
const caseR = await import("@/app/api/manu/case/[incident]/route");
const photosR = await import("@/app/api/manu/photos/[name]/route");
const { POST: track } = await import("@/app/api/track/route");
const { assistantSession } = await import("@/lib/assistant/access");
const { officerSession } = await import("@/lib/officer/guard");
const { crossSite } = await import("@/middleware");
const { createPetition, filePetition, getPetition } = await import("@/lib/manu/petitions");
const { savePages } = await import("@/lib/manu/files");
const { pdfImages } = await import("@/lib/studio/ocr");
const { trackKey } = await import("@/lib/manu/track");
const { caseIdFor } = await import("@/lib/manu/cases");
const { signToken } = await import("@/lib/jwt");
const { portalCookieName } = await import("@/lib/session-cookies");

type Actor = "anon" | "citizen" | "officerA" | "officerB" | "manu" | "collector";
const ACTORS: Record<Exclude<Actor, "anon">, { id: number; email: string; role: string; portal: "citizen" | "officer" | "collector" }> = {
  citizen: { id: 30, email: "citizen@test.local", role: "citizen", portal: "citizen" },
  officerA: { id: 11, email: "officer.a@test.local", role: "department_officer", portal: "officer" },
  officerB: { id: 12, email: "officer.b@test.local", role: "department_officer", portal: "officer" },
  manu: { id: 10, email: "petition@chennai.gov.in", role: "department_officer", portal: "officer" },
  collector: { id: 20, email: "collector@test.local", role: "collector", portal: "collector" }
};
async function as(a: Actor) {
  h.jar.clear();
  h.hdr = new Headers();
  if (a === "anon") return;
  const u = ACTORS[a];
  h.jar.set(portalCookieName(u.portal, null), await signToken({ userId: u.id, email: u.email, role: u.role as never, departmentId: null, tv: 0 } as never));
}
const P = <T extends string>(k: T, v: string) => ({ params: Promise.resolve({ [k]: v } as Record<T, string>) });
const jpost = (url: string, body: unknown, headers: Record<string, string> = {}) => new NextRequest(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const settle = async (id: number) => { for (let i = 0; i < 200 && (await getPetition(id))!.status === "reading"; i++) await new Promise((r) => setTimeout(r, 5)); };

let filed: { id: number; code: string; photo: string; incident: string };
let unfiled: { id: number; photo: string };

beforeAll(async () => {
  const a = await createPetition({ pages: await savePages([JPG]), uploadedBy: 10, uploadedEmail: "petition@chennai.gov.in" });
  await settle(a);
  const r = await filePetition(a, fields() as never, "petition@chennai.gov.in");
  const pa = (await getPetition(a))!;
  filed = { id: a, code: r.code, photo: JSON.parse(pa.pages)[0], incident: String(pa.incident_id) };
  const b = await createPetition({ pages: await savePages([JPG]), uploadedBy: 10, uploadedEmail: "petition@chennai.gov.in" });
  await settle(b);
  unfiled = { id: b, photo: JSON.parse((await getPetition(b))!.pages)[0] };
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("access matrix", () => {
  it("every Manu route against every actor", async () => {
    const rows: string[] = [];
    for (const a of ["anon", "citizen", "officerA", "officerB", "manu", "collector"] as Actor[]) {
      const cells: string[] = [];
      const cell = async (res: Response, scope?: (j: any) => string) => {
        let s = String(res.status);
        if (scope && res.status === 200) { try { s += ` ${scope(await res.clone().json())}`; } catch { /* binary */ } }
        cells.push(s);
      };
      await as(a); await cell(await petitionsR.GET(), (j) => `items=${j.items.length}`);
      await as(a);
      const fd = new FormData(); fd.append("pages", new Blob([JPG], { type: "image/jpeg" }), "p.jpg");
      await cell(await petitionsR.POST(new NextRequest("http://127.0.0.1/api/manu/petitions", { method: "POST", body: fd })), (j) => `id=${j.id}`);
      await as(a); await cell(await petitionR.GET(new NextRequest("http://127.0.0.1/x"), P("id", String(filed.id))), (j) => `name=${j.reading?.name ? "yes" : "no"}`);
      await as(a); await cell(await petitionR.POST(jpost("http://127.0.0.1/x", { action: "repeats", mobile: "9000041873", name: "", street: "", ward: null, dept: "", problem: "" }), P("id", "999")), (j) => `matches=${j.repeats.matches.length}`);
      await as(a); await cell(await caseR.GET(new NextRequest("http://127.0.0.1/x"), P("incident", filed.incident)), (j) => `items=${j.items.length}`);
      await as(a); await cell(await photosR.GET(new NextRequest("http://127.0.0.1/x"), P("name", filed.photo)));
      await as(a); await cell(await photosR.GET(new NextRequest("http://127.0.0.1/x"), P("name", unfiled.photo)));
      await as(a); await cell(await track(jpost("http://127.0.0.1/api/track", { code: filed.code, key: trackKey(filed.code) })), (j) => `status=${j.status}`);
      rows.push(`| ${a} | ${cells.join(" | ")} |`);
    }
    console.log(["| actor | GET petitions | POST petitions | GET petitions/[id] | POST petitions/[id] repeats | GET case/[incident] (CMWSSB petition) | GET photo (filed, CMWSSB) | GET photo (unfiled) | POST track (key) |",
      "|---|---|---|---|---|---|---|---|---|", ...rows].join("\n"));
    expect(rows.find((r) => r.startsWith("| officerB"))).toMatch(/\| 200 items=0 \| 403 \| 403 \|/);
  });

  it("the petition-desk login is an officer login: it passes the assistant (Jarvis / map) guard, locked to COL-PET", async () => {
    await as("manu");
    const s = await assistantSession();
    expect(s).not.toBeInstanceOf(NextResponse);
    expect(s).toMatchObject({ role: "department_officer", lockDept: "COL-PET", email: "petition@chennai.gov.in" });
    const o = await officerSession();
    expect(o).toBeInstanceOf(NextResponse);
    expect((o as NextResponse).status).toBe(403);
  });
});

describe("photos: path traversal and LIKE wildcards", () => {
  it("every crafted name is refused before the store or the disk is touched", async () => {
    const names = ["../../.env", "..%2f..%2f.env", "%2e%2e%2f.env", "%252e%252e%252f.env", "..\\..\\.env", "C:\\Windows\\win.ini", "/etc/passwd", `${filed.photo}\u0000.png`,
      "%.jpg", "_".repeat(32) + ".jpg", "%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%.jpg", `${filed.photo.slice(0, 31)}_.jpg`, filed.photo.toUpperCase(), `${filed.photo}%`, `x/${filed.photo}`];
    await as("collector");
    const out: string[] = [];
    for (const n of names) out.push(`${JSON.stringify(n)} -> ${(await photosR.GET(new NextRequest("http://127.0.0.1/x"), P("name", n))).status}`);
    console.log(out.join("\n"));
    expect(out.every((l) => l.endsWith("404"))).toBe(true);
  });
});

describe("the petition-desk login (login.ts)", () => {
  it("an anonymous attempt with a wrong password undoes a password change and a department change (P5-005 fixed only the re-activation)", async () => {
    const rotated = bcrypt.hashSync("Rotated-by-admin-2026!", 4);
    // the administrator rotated the shared password (it leaked) and moved the account off the desk
    db.prepare("UPDATE users SET password_hash = ?, is_active = 1, dept_code = 'NONE' WHERE id = 10").run(rotated);
    await as("anon");
    const res = await login(jpost("http://127.0.0.1/api/auth/login", { email: "petition@chennai.gov.in", password: "definitely-wrong" }));
    const row = db.prepare("SELECT password_hash, is_active, dept_code, token_version FROM users WHERE id = 10").get() as Record<string, unknown>;
    console.log(`wrong-password attempt -> ${res.status}; afterwards is_active=${row.is_active}, dept_code=${row.dept_code}, token_version=${row.token_version}, hash still the admin's: ${row.password_hash === rotated}`);
    expect(res.status).toBe(401);
    expect(row.dept_code).toBe("COL-PET");
    expect(row.password_hash).not.toBe(rotated);
    db.prepare("UPDATE users SET password_hash = ?, is_active = 0 WHERE id = 10").run(rotated);
    await login(jpost("http://127.0.0.1/api/auth/login", { email: "petition@chennai.gov.in", password: "x" }));
    console.log(`deactivated + rotated, then a wrong attempt: is_active=${(db.prepare("SELECT is_active FROM users WHERE id = 10").get() as { is_active: number }).is_active} (P5-005 holds)`);
    db.prepare("UPDATE users SET password_hash = ?, is_active = 1 WHERE id = 10").run(rotated);
    await login(jpost("http://127.0.0.1/api/auth/login", { email: "petition@chennai.gov.in", password: "x" }));
    await as("anon");
    const withNew = await login(jpost("http://127.0.0.1/api/auth/login", { email: "petition@chennai.gov.in", password: "Rotated-by-admin-2026!" }));
    console.log(`the admin's new password now -> ${withNew.status}`);
    expect(withNew.status).toBe(401);
  });

  it("on a store without the account, an anonymous attempt creates it (department_officer, COL-PET, verified)", async () => {
    db.prepare("DELETE FROM users WHERE id = 10").run();
    await as("anon");
    await login(jpost("http://127.0.0.1/api/auth/login", { email: "petition@chennai.gov.in", password: "nope" }));
    const row = db.prepare("SELECT role, dept_code, is_active, email_verification_exempt FROM users WHERE email = 'petition@chennai.gov.in'").get();
    console.log("created by an anonymous attempt:", JSON.stringify(row));
    expect(row).toMatchObject({ role: "department_officer", dept_code: "COL-PET", is_active: 1, email_verification_exempt: 1 });
    db.prepare("UPDATE users SET id = 10 WHERE email = 'petition@chennai.gov.in'").run();
  });
});

describe("public tracking", () => {
  it("shows the officer's and the Collector's free-text notes verbatim to whoever holds the slip", async () => {
    const id = await createPetition({ pages: await savePages([JPG]), uploadedBy: 10, uploadedEmail: "p" });
    await settle(id);
    const r = await filePetition(id, fields() as never, "p");
    const inc = String((await getPetition(id))!.incident_id);
    db.prepare("INSERT INTO officer_steps VALUES (?, 'send', ?, NULL, datetime('now', '+1 day'))").run(inc, "Met petitioner K. Parvathi at door 27, she gave alt no 9840012345; neighbour Ravi (door 29) blocks the drain");
    db.prepare("INSERT INTO collector_decisions VALUES (?, 'reject', ?, 'collector', datetime('now', '+2 day'))").run(inc, "Internal: AE Murugan did not attend; duplicate of INC-0042");
    await as("anon");
    const j = await (await track(jpost("http://127.0.0.1/api/track", { code: r.code, last4: "1873" }))).json();
    console.log(JSON.stringify(j.steps, null, 1));
    expect(JSON.stringify(j)).toMatch(/9840012345/);
    expect(JSON.stringify(j)).toMatch(/AE Murugan/);
  });

  it("twelve junk tries on someone's slip number lock its real holder out, QR key and all", async () => {
    const id = await createPetition({ pages: await savePages([JPG]), uploadedBy: 10, uploadedEmail: "p" });
    await settle(id);
    const r = await filePetition(id, fields() as never, "p");
    await as("anon");
    for (let i = 0; i < 12; i++) await track(jpost("http://127.0.0.1/api/track", { code: r.code, last4: String(1000 + i) }));
    const real = await track(jpost("http://127.0.0.1/api/track", { code: r.code, key: trackKey(r.code) }));
    console.log(`real holder with the QR key after 12 junk tries -> ${real.status}`);
    expect(real.status).toBe(429);
  });

  it("the repeats check is a phone-number lookup into citizens' online complaints; with the number the tracker opens them", async () => {
    db.prepare(`INSERT INTO complaints (id, complaint_code, user_id, first_name, gender, street_address, mobile_number, zone_id, ward_number, department_id, title, description, is_anonymous, needs_manual_review, status, created_at, updated_at)
      VALUES (900, '2026-555ONL', 30, 'Online Citizen', 'Female', '5 Some Street', '9876543210', 6, 70, 3, 'Harassment by neighbour', 'private details', 1, 0, 'Complaint Filed', '2026-10-01 10:00:00', '2026-10-01 10:00:00')`).run();
    await as("manu");
    const j = await (await petitionR.POST(jpost("http://127.0.0.1/x", { action: "repeats", mobile: "9876543210", name: "", street: "", ward: null, dept: "", problem: "" }), P("id", "424242"))).json();
    console.log("repeats for an arbitrary number:", JSON.stringify(j));
    expect(JSON.stringify(j)).toMatch(/2026-555ONL/);
    await as("anon");
    const t = await track(jpost("http://127.0.0.1/api/track", { code: "2026-555ONL", last4: "3210" }));
    expect(t.status).toBe(200);
  });

  it("X-Forwarded-For is ignored without TRUST_PROXY_HOPS, so every client shares one bucket: one script shuts tracking for all", async () => {
    await as("anon");
    let n = 0, res: Response;
    do {
      const code = `2026-${String(n % 1000).padStart(3, "0")}${String.fromCharCode(65 + (n % 26))}${String.fromCharCode(65 + ((n / 26) | 0) % 26)}Q`;
      res = await track(jpost("http://127.0.0.1/api/track", { code, last4: "0000" }, { "x-forwarded-for": `198.51.100.${n % 250}` }));
      n++;
    } while (res.status !== 429 && n < 400);
    const victim = await track(jpost("http://127.0.0.1/api/track", { code: filed.code, key: trackKey(filed.code) }, { "x-forwarded-for": "203.0.113.7" }));
    console.log(`attacker hit 429 after ${n} requests with ${Math.min(n, 250)} spoofed XFF values; a different citizen with a valid QR key -> ${victim.status}`);
    expect(victim.status).toBe(429);
  });
});

describe("uploads", () => {
  function pdfWith(images: number, w: number, hgt: number): Buffer {
    const raw = zlib.deflateSync(Buffer.alloc(w * hgt * 3));
    const parts: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
    for (let i = 0; i < images; i++)
      parts.push(Buffer.from(`${i + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${hgt} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${raw.length} >>\nstream\n`, "latin1"), raw, Buffer.from("\nendstream\nendobj\n", "latin1"));
    parts.push(Buffer.from("%%EOF\n", "latin1"));
    return Buffer.concat(parts);
  }

  it("a small Flate PDF is inflated in full before it is refused (decompression bomb)", async () => {
    const pdf = pdfWith(3, 4000, 4000);
    const t0 = Date.now();
    const out = pdfImages(pdf);
    const inflated = out.images.reduce((s, b) => s + b.length, 0);
    console.log(`PDF ${pdf.length} bytes -> ${inflated} bytes inflated in memory (${Math.round(inflated / pdf.length)}x) in ${Date.now() - t0} ms; 20 images of 40 Mpx would be ~2.4 GB`);
    expect(inflated / pdf.length).toBeGreaterThan(500);
    await expect(savePages([pdf])).rejects.toThrow(/No scanned pages/);
  });

  it("magic bytes decide the type: a JPEG-headed HTML polyglot is stored and served as image/jpeg with nosniff", async () => {
    const poly = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("<html><script>alert(document.cookie)</script></html>")]);
    const [name] = await savePages([poly]);
    db.prepare("INSERT INTO petitions (status, pages, created_at, updated_at) VALUES ('needs_check', ?, '2026-11-01', '2026-11-01')").run(JSON.stringify([name]));
    await as("manu");
    const res = await photosR.GET(new NextRequest("http://127.0.0.1/x"), P("name", name));
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(savePages([Buffer.from("GIF89a....")])).rejects.toThrow(/JPG or PNG/);
  });
});

describe("logs", () => {
  it("a store error while approving prints the petitioner's name, mobile, address and letter text (mysql2 puts the filled-in SQL on the error)", async () => {
    const id = await createPetition({ pages: await savePages([JPG]), uploadedBy: 10, uploadedEmail: "p" });
    await settle(id);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.failOn = /INSERT INTO complaints/;
    await as("manu");
    const res = await petitionR.POST(jpost("http://127.0.0.1/x", { action: "file", fields: fields() }), P("id", String(id)));
    h.failOn = null;
    const logged = spy.mock.calls.map((c) => util.format(...c)).join("\n");
    spy.mockRestore();
    console.log(`status ${res.status}; log line contains mobile: ${logged.includes("9000041873")}, name: ${logged.includes("பார்வதி")}, address: ${logged.includes("27, ஜவஹர் தெரு")}`);
    expect(res.status).toBe(500);
    expect(logged).toMatch(/9000041873/);
  });
});

describe("CSRF wall (middleware.crossSite)", () => {
  it("refuses cross-site posts and lets same-origin and header-less ones through", () => {
    const req = (hd: Record<string, string>) => new NextRequest("http://127.0.0.1:3000/api/manu/petitions/1", { method: "POST", headers: { host: "127.0.0.1:3000", ...hd } });
    const r = {
      crossOrigin: crossSite(req({ origin: "http://evil.example" })),
      crossFetchSite: crossSite(req({ "sec-fetch-site": "cross-site" })),
      sameSiteSibling: crossSite(req({ origin: "http://evil.127.0.0.1:3000", "sec-fetch-site": "same-site" })),
      nullOrigin: crossSite(req({ origin: "null" })),
      sameOrigin: crossSite(req({ origin: "http://127.0.0.1:3000" })),
      httpsVsHttpSameHost: crossSite(req({ origin: "https://127.0.0.1:3000" })),
      noHeaders: crossSite(req({}))
    };
    console.log(JSON.stringify(r));
    expect(r).toMatchObject({ crossOrigin: true, crossFetchSite: true, sameSiteSibling: true, nullOrigin: true, sameOrigin: false, noHeaders: false });
  });
});
