/**
 * The daily generated resolutions (lib/cases/synthetic.ts) on an isolated in-memory store through the AWS dialect, with a temporary photo
 * library and upload folder: which cases may be resolved (GENERATED records only: never a real portal complaint, a Manu petition, a website
 * filing, a news-linked case, a case someone touched), what is written (as an officer would, photo and remark; severe ones always through
 * the Collector; about half through the Collector), that a second run writes nothing, and the Resolved lists' payload.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, synced: [] as string[][], now: "2026-11-28 20:00:00" }));
const run = (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  const st = h.db.prepare(s);
  return /^\s*(SELECT|WITH)/i.test(s)
    ? [st.all(...(p as never[]))]
    : (() => { const r = st.run(...(p as never[])); return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }]; })();
};
const pool = {
  query: async (sql: string, params: unknown[] = []) => run(sql, params),
  getConnection: async () => ({
    query: async (sql: string, params: unknown[] = []) => run(sql, params),
    beginTransaction: async () => void h.db.exec("BEGIN"),
    commit: async () => void h.db.exec("COMMIT"),
    rollback: async () => void h.db.exec("ROLLBACK"),
    release: () => undefined
  })
};
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t, TITLE: "i.title", CLUSTER: "i.incident_id", OPS_DB: "district_intel_ops" }));
vi.mock("@/lib/db", () => ({ default: pool }));
vi.mock("@/lib/complaint-progress", () => ({ syncComplaints: async (ids: string[]) => { h.synced.push(ids); return 0; }, awaitingQueue: async () => 0 }));
vi.mock("@/lib/collector/intel", async (orig) => ({ ...(await orig<typeof import("@/lib/collector/intel")>()), asOf: async () => h.now }));

// a temporary library of two "photos" and a temporary upload folder (the functions read these at call time)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "diq-cases-"));
const LIB = path.join(tmp, "library"), UP = path.join(tmp, "uploads");
fs.mkdirSync(LIB, { recursive: true });
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);
fs.writeFileSync(path.join(LIB, "garbage-1.jpg"), JPG);
fs.writeFileSync(path.join(LIB, "junction-1.jpg"), Buffer.concat([JPG, Buffer.from([1])]));
fs.writeFileSync(path.join(LIB, "index.json"), JSON.stringify({ files: [
  { file: "garbage-1.jpg", group: "garbage", source: "test", made: "2026-11-28" }, { file: "junction-1.jpg", group: "junction", source: "test", made: "2026-11-28" }] }));
process.env.CASE_PHOTO_LIBRARY = LIB;
process.env.OFFICER_UPLOAD_DIR = UP;

const syn = await import("./synthetic");
const plan = await import("./synthetic-plan");
const { resolutionsFor, resolvedList } = await import("./resolution");
const { grievanceDetail } = await import("@/lib/officer/data");
const { readPhoto } = await import("@/lib/officer/photos");
const { caseNow } = await import("./lifecycle");

function fresh() {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE incidents (incident_id TEXT PRIMARY KEY, title TEXT, channels TEXT, lead_dept TEXT, category_label TEXT, category_code TEXT, zone_no INTEGER,
      zone_name TEXT, ward_no INTEGER, taluk_code TEXT, place_text TEXT, lat REAL, lon REAL, severity_level TEXT, status_std TEXT, verified INTEGER,
      citizen_complaints INTEGER, outlet_count INTEGER, sources TEXT, source_count INTEGER, officer TEXT, summary TEXT, media_only INTEGER,
      first_reported_at TEXT, sla_due_at TEXT, closed_at TEXT, sla_breached INTEGER, is_open INTEGER, last_update_at TEXT);
    CREATE TABLE ref_departments (code TEXT, name TEXT, route TEXT, action_owner INTEGER);
    INSERT INTO ref_departments VALUES ('GCC-SWM', 'Solid Waste Management', '', 1), ('POL-GCP', 'Greater Chennai Police', '', 1), ('GCC-SWD', 'Storm Water Drain', '', 1),
      ('XX-NONE', 'Not a console department', '', 0);
    CREATE TABLE events (event_id TEXT, source TEXT, source_record_id TEXT, incident_id TEXT, is_synthetic INTEGER, text TEXT);
    CREATE TABLE incident_members (incident_id TEXT, event_id TEXT, source TEXT, channel TEXT, reported_at TEXT, title TEXT, role TEXT);
    CREATE TABLE complaints (id INTEGER PRIMARY KEY, complaint_code TEXT, is_synthetic INTEGER);
    CREATE TABLE petitions (id INTEGER PRIMARY KEY, incident_id TEXT, complaint_code TEXT);
    CREATE TABLE officer_steps (step_id INTEGER PRIMARY KEY AUTOINCREMENT, incident_id TEXT, dept_code TEXT, step TEXT, note TEXT, report_id INTEGER, actor TEXT,
      actor_user_id INTEGER, at TEXT DEFAULT (datetime('now', '+330 minutes')));
    CREATE TABLE officer_reports (report_id INTEGER PRIMARY KEY AUTOINCREMENT, incident_id TEXT, dept_code TEXT, remarks TEXT, photo_dir TEXT, photos TEXT,
      sent_by TEXT, sent_user_id INTEGER, sent_at TEXT DEFAULT (datetime('now', '+330 minutes')));
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY AUTOINCREMENT, incident_id TEXT, decision TEXT, escalate_to TEXT, note TEXT, decided_by TEXT,
      decided_role TEXT, decided_at TEXT DEFAULT (datetime('now', '+330 minutes')));
    CREATE TABLE audit_log (log_id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT DEFAULT CURRENT_TIMESTAMP, actor TEXT, action TEXT, table_name TEXT, record_id TEXT,
      before_value TEXT, after_value TEXT);
    CREATE TABLE incident_timeline (incident_id TEXT, at TEXT, step TEXT, note TEXT, actor TEXT);
    CREATE TABLE documents (doc_id TEXT, publisher TEXT, title TEXT, url TEXT, published_at TEXT, linked_incident_id TEXT, story_id TEXT);
    CREATE TABLE outbound_emails (email_id INTEGER PRIMARY KEY, incident_id TEXT, subject TEXT, body TEXT, owner TEXT, body_hash TEXT, approved_at TEXT,
      to_contact_ids TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE followups (followup_id INTEGER PRIMARY KEY, email_id INTEGER, contact_id INTEGER, incident_id TEXT, summary TEXT, due_date TEXT, status TEXT);`);
  return db;
}

/** a case with its member events: each event [source, is_synthetic, channel, complaint code] */
function kase(id: string, o: Record<string, unknown>, events: [string, number, string, string?][]) {
  const r = { incident_id: id, title: `Case ${id}`, lead_dept: "GCC-SWM", category_label: "Garbage", category_code: "SOLID_WASTE", zone_no: 9, zone_name: "Teynampet",
    place_text: "Test Street, Teynampet", severity_level: "Low", status_std: "In progress", verified: 0, citizen_complaints: 0, outlet_count: 0,
    sources: [...new Set(events.map((e) => e[0]))].sort().join("|"), channels: [...new Set(events.map((e) => e[2]))].sort().join("|"), media_only: 0,
    first_reported_at: "2026-11-25 09:00:00", sla_due_at: "2026-12-02 09:00:00", sla_breached: 0, is_open: 1, last_update_at: "2026-11-25 09:00:00", officer: "AE, Zone 9", ...o };
  const k = Object.keys(r);
  h.db.prepare(`INSERT INTO incidents (${k.join(", ")}) VALUES (${k.map(() => "?").join(", ")})`).run(...(Object.values(r) as never[]));
  events.forEach(([source, s, channel, code], j) => {
    const ev = `${id}-E${j}`;
    h.db.prepare("INSERT INTO events (event_id, source, source_record_id, incident_id, is_synthetic) VALUES (?, ?, ?, ?, ?)").run(ev, source, code ?? ev, id, s);
    h.db.prepare("INSERT INTO incident_members (incident_id, event_id, source, channel, reported_at, role) VALUES (?, ?, ?, ?, ?, ?)").run(id, ev, source, channel, String(r.first_reported_at), j ? "member" : "first_report");
  });
}

beforeEach(() => { h.db = fresh(); h.synced = []; h.now = "2026-11-28 20:00:00"; });

describe("which cases a generated resolution may be laid on: GENERATED records only", () => {
  it("the pure rule", () => {
    const ok = { events: 2, realEvents: 0, sources: "grievance|police", channels: "citizen_app|patrol", mediaOnly: 0, realComplaints: 0, petitions: 0 };
    expect(plan.isGeneratedOnly(ok)).toBe(true);
    expect(plan.isGeneratedOnly({ ...ok, realEvents: 1 })).toBe(false);
    expect(plan.isGeneratedOnly({ ...ok, events: 0 })).toBe(false);
    expect(plan.isGeneratedOnly({ ...ok, sources: "news|police" })).toBe(false);
    expect(plan.isGeneratedOnly({ ...ok, sources: "imd" })).toBe(false);
    expect(plan.isGeneratedOnly({ ...ok, channels: "citizen_grievance" })).toBe(false);
    expect(plan.isGeneratedOnly({ ...ok, channels: "manu|patrol" })).toBe(false);
    expect(plan.isGeneratedOnly({ ...ok, mediaOnly: 1 })).toBe(false);
    expect(plan.isGeneratedOnly({ ...ok, realComplaints: 1 })).toBe(false);
    expect(plan.isGeneratedOnly({ ...ok, petitions: 1 })).toBe(false);
  });

  it("from the store: real complaints, petitions, website filings, news, crime, touched, instructed and closed cases are never picked", async () => {
    kase("GEN-POL", { lead_dept: "POL-GCP", category_code: "TRAFFIC_OBSTRUCTION" }, [["police", 1, "control_room_112"]]);
    kase("GEN-GRV", {}, [["grievance", 1, "citizen_app", "2026-001AAA"]]);
    h.db.exec("INSERT INTO complaints (complaint_code, is_synthetic) VALUES ('2026-001AAA', 1)");
    // a real complaint filed on the portal comes through the same citizen_app channel: only its flag tells it apart
    kase("REAL-GRV", {}, [["grievance", 0, "citizen_app", "2026-002BBB"]]);
    // a generated event whose complaint the portal holds as real (a mismatch): kept out all the same
    kase("REAL-CODE", {}, [["grievance", 1, "citizen_app", "2026-003CCC"]]);
    h.db.exec("INSERT INTO complaints (complaint_code, is_synthetic) VALUES ('2026-003CCC', 0)");
    kase("MANU", {}, [["grievance", 1, "citizen_app"]]);
    h.db.exec("INSERT INTO petitions (incident_id) VALUES ('MANU')");
    kase("WEB", {}, [["grievance", 1, "citizen_grievance"]]);
    kase("NEWS", { lead_dept: "POL-GCP", category_code: "ROAD_ACCIDENT" }, [["police", 1, "patrol"], ["news", 0, "media"]]);
    kase("CRIME", { lead_dept: "POL-GCP", category_code: "CRIME_PROPERTY" }, [["police", 1, "fir_walk_in"]]);
    kase("TOUCHED", {}, [["grievance", 1, "citizen_app"]]);
    h.db.exec("INSERT INTO officer_steps (incident_id, dept_code, step, actor) VALUES ('TOUCHED', 'GCC-SWM', 'approve', 'swm@x')");
    kase("NOTED", {}, [["grievance", 1, "citizen_app"]]);
    h.db.exec("INSERT INTO collector_decisions (incident_id, decision, note, decided_by) VALUES ('NOTED', 'note', 'Watch this', 'c@x')");
    kase("INSTRUCTED", {}, [["grievance", 1, "citizen_app"]]);
    h.db.exec("INSERT INTO outbound_emails (incident_id, subject, body) VALUES ('INSTRUCTED', 'Clear it', 'Today')");
    kase("CLOSED", { is_open: 0, status_std: "Resolved" }, [["grievance", 1, "citizen_app"]]);
    kase("NOCONSOLE", { lead_dept: "XX-NONE" }, [["grievance", 1, "citizen_app"]]);
    kase("NOEVENTS", {}, []);
    kase("GHOST", {}, [["grievance", 1, "citizen_app"]]);
    h.db.exec("DELETE FROM events WHERE incident_id = 'GHOST'");
    const got = await syn.generatedCandidates("2026-11-01 00:00:00", "2026-11-28 20:00:00");
    expect(got.map((c) => c.id).sort()).toEqual(["GEN-GRV", "GEN-POL"]);
  });
});

describe("the day's plan", () => {
  it("8 to 12 a day, spread through the working day, the same every time", () => {
    for (const d of ["2026-11-14", "2026-11-20", "2026-11-28"]) {
      const n = plan.perDay(d);
      expect(n).toBeGreaterThanOrEqual(8);
      expect(n).toBeLessThanOrEqual(12);
      const s = plan.daySlots(d, n);
      expect(s).toEqual(plan.daySlots(d, n));
      expect([...s].sort()).toEqual(s);
      expect(s[0] >= `${d} 08:15:00` && s[n - 1] <= `${d} 19:45:00`).toBe(true);
      const via = plan.collectorSlots(n, d).filter(Boolean).length / n;
      expect(via).toBeGreaterThanOrEqual(0.35);
      expect(via).toBeLessThanOrEqual(0.65);
    }
    expect(plan.perDay("2026-11-28", 3)).toBe(3);
    expect(plan.viaCollector(false, "Severe")).toBe(true);
    expect(plan.viaCollector(false, "High")).toBe(false);
  });

  it("the steps' times are in order, after the report and by the slot", () => {
    for (const via of [true, false]) {
      const t = plan.stepTimes("2026-11-27 22:10:00", "2026-11-28 15:30:00", via, `x|${via}`);
      expect(t.approve > "2026-11-27 22:10:00").toBe(true);
      expect(t.approve < t.action && t.action < t.report && t.report <= t.close).toBe(true);
      expect(t.close).toBe("2026-11-28 15:30:00");
      if (!via) expect(t.report).toBe(t.close);
    }
  });

  it("the officer on a generated step is a generic role, never a named post or a person", () => {
    expect(syn.officerOf({ officer: "Executive Engineer, Buckingham Canal Division (V. Karthikeyan)", dept: "PWD-WRD" })).toMatch(/field officer$/);
    expect(syn.officerOf({ officer: "SHO, Kannagi Nagar Police Station", dept: "POL-GCP" })).not.toMatch(/Kannagi|SHO/);
    expect(syn.officerOf({ officer: "R. Ramesh", dept: "GCC-SWM", zoneName: "Adyar" })).toBe("SWM field officer, Adyar zone");
    expect(syn.officerOf({ officer: null, dept: "GCC-HLT" })).toBe("Health field officer");
  });

  it("remarks are the department's kind of work, with the place", () => {
    expect(plan.remarkFor("SOLID_WASTE", "Kamaraj Street, Ward 120", "a")).toMatch(/Kamaraj Street/);
    expect(plan.remarkFor("STREETLIGHT_ELECTRICAL", null, "b")).toMatch(/light|wiring/i);
    expect(plan.remarkFor("BUILDING_SAFETY", "Sholinganallur Taluk Office", "c")).not.toMatch(/owner/);
  });

  it("no generated resolution for road accidents, and flooding ends on a dry-street photo", () => {
    expect(plan.CATEGORY_PHOTOS.ROAD_ACCIDENT).toBeUndefined();
    expect(plan.CATEGORY_PHOTOS.FLOOD_WATERLOGGING).toBe("street");
    expect(plan.CATEGORY_PHOTOS.WATER_SUPPLY).toBe("road");
  });
});

describe("the run: written as an officer would, once", () => {
  function many() {
    // 36 generated cases over three departments, a few severe, reported over the last week; one real complaint among them
    for (let k = 0; k < 36; k++) {
      const dept = ["GCC-SWM", "POL-GCP", "GCC-SWD"][k % 3];
      const cat = { "GCC-SWM": "SOLID_WASTE", "POL-GCP": "ROAD_ACCIDENT", "GCC-SWD": "FLOOD_WATERLOGGING" }[dept];
      const day = 21 + (k % 7);
      kase(`G-${String(k).padStart(2, "0")}`, { lead_dept: dept, category_code: cat, severity_level: k % 6 === 0 ? "Severe" : k % 2 ? "Low" : "Medium",
        first_reported_at: `2026-11-${day} 0${k % 9}:15:00` }, [[dept === "POL-GCP" ? "police" : "grievance", 1, "citizen_app"]]);
    }
    kase("REAL-1", { first_reported_at: "2026-11-26 08:00:00" }, [["grievance", 0, "citizen_app", "2026-009ZZZ"]]);
  }

  it("writes the due slots of yesterday and today, severe ones through the Collector; a second run writes nothing", async () => {
    many();
    // the backfill has run before: only the last day and today
    h.db.exec(`INSERT INTO audit_log (actor, action, table_name, record_id) VALUES ('district-iq', '${syn.BACKFILL_ACTION}', 'officer_steps', '2026-11-27')`);
    const r = await syn.runSyntheticResolutions({ now: h.now, backDays: 1, perDay: 10 });
    expect(r.backfill).toBe(false);
    expect(r.due).toBe(20);
    expect(r.written).toBe(20);
    expect(r.skipped).toEqual([]);
    expect(r.ids).not.toContain("REAL-1");
    expect(new Set(r.ids).size).toBe(20);
    expect(r.viaCollector + r.closedByOfficer).toBe(20);
    expect(r.viaCollector / 20).toBeGreaterThanOrEqual(0.35);
    expect(r.viaCollector / 20).toBeLessThanOrEqual(0.75);
    expect(h.synced).toEqual([r.ids]);

    for (const id of r.ids) {
      const steps = h.db.prepare("SELECT step, at, actor FROM officer_steps WHERE incident_id = ? ORDER BY step_id").all(id) as { step: string; at: string; actor: string }[];
      const dec = h.db.prepare("SELECT decision, decided_role, decided_at FROM collector_decisions WHERE incident_id = ?").all(id) as Record<string, string>[];
      const rep = h.db.prepare("SELECT remarks, photo_dir, photos, sent_at FROM officer_reports WHERE incident_id = ?").all(id) as Record<string, string>[];
      const inc = h.db.prepare("SELECT severity_level AS sev, first_reported_at AS t FROM incidents WHERE incident_id = ?").get(id) as Record<string, string>;
      expect(steps.map((s) => s.step).slice(0, 2)).toEqual(["approve", "action"]);
      expect(steps.map((s) => s.actor)).toEqual(Array(3).fill(expect.stringMatching(/field officer/)));
      expect(rep).toHaveLength(1);
      expect(rep[0].photo_dir).toMatch(/^\d{8}-c45e00[0-9a-f]{10}$/);
      expect(JSON.parse(rep[0].photos)).toEqual(["1.jpg"]);
      expect(fs.existsSync(path.join(UP, rep[0].photo_dir, "1.jpg"))).toBe(true);
      expect(JSON.parse(fs.readFileSync(path.join(UP, rep[0].photo_dir, "generated.json"), "utf8"))).toMatchObject({ generated: true, incident_id: id });
      expect(dec).toHaveLength(1);
      const via = steps[2].step === "send";
      // the owner's rule: a severe case always through the Collector
      if (inc.sev === "Severe") expect(via).toBe(true);
      expect(dec[0]).toMatchObject(via ? { decision: "verify", decided_role: "collector" } : { decision: "resolve", decided_role: "department_officer" });
      // times: after the report, in order, by now
      expect(steps[0].at > inc.t && steps[0].at < steps[1].at && steps[1].at < steps[2].at && steps[2].at <= dec[0].decided_at && dec[0].decided_at <= h.now).toBe(true);
      expect(rep[0].sent_at).toBe(steps[2].at);
    }
    // the trail: one audit row per resolution, marked generated
    const audit = h.db.prepare("SELECT after_value FROM audit_log WHERE action = ?").all(syn.SYNTH_ACTION) as { after_value: string }[];
    expect(audit).toHaveLength(20);
    expect(audit.every((a) => JSON.parse(a.after_value).generated === true)).toBe(true);
    // every console reads them closed
    expect(await caseNow(r.ids[0])).toMatchObject({ open: 0, status: "Resolved" });
    const SWM = { code: "GCC-SWM", name: "SWM", org: "", head: "", route: "", short: "SWM", remarkHint: "" };
    const mine = r.ids.find((id) => (h.db.prepare("SELECT lead_dept AS d FROM incidents WHERE incident_id = ?").get(id) as { d: string }).d === "GCC-SWM")!;
    expect((await grievanceDetail(SWM, mine))?.grievance.stage).toBe("verified");

    // idempotent: the same slots are never done twice
    const again = await syn.runSyntheticResolutions({ now: h.now, backDays: 1, perDay: 10 });
    expect(again.written).toBe(0);
    expect(h.db.prepare("SELECT COUNT(*) AS n FROM officer_reports").get()).toEqual({ n: 20 });
    // a slot whose time has not come is left for later: at 10 AM only the morning's slots of today are due
    h.db = fresh();
    many();
    h.db.exec(`INSERT INTO audit_log (actor, action, table_name, record_id) VALUES ('district-iq', '${syn.BACKFILL_ACTION}', 'officer_steps', '2026-11-27')`);
    const morning = await syn.runSyntheticResolutions({ now: "2026-11-28 10:00:00", backDays: 0, perDay: 10 });
    expect(morning.written).toBe(plan.daySlots("2026-11-28", 10).filter((s) => s <= "2026-11-28 10:00:00").length);
  });

  it("the first run fills the last 14 days once, then marks the backfill done", async () => {
    many();
    const r = await syn.runSyntheticResolutions({ now: h.now, perDay: 2 });
    expect(r.backfill).toBe(true);
    expect(r.days).toHaveLength(15);
    expect(r.days[0]).toBe("2026-11-14");
    // only cases reported before each slot can be resolved at it: the early days have none here, the later ones do
    expect(r.written).toBeGreaterThan(0);
    expect(h.db.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = ?`).get(syn.BACKFILL_ACTION)).toEqual({ n: 1 });
    const next = await syn.runSyntheticResolutions({ now: h.now, perDay: 2 });
    expect(next.backfill).toBe(false);
    expect(next.days).toEqual(["2026-11-26", "2026-11-27", "2026-11-28"]);
    expect(next.written).toBe(0);
  });

  it("the Resolved lists: photo, remark, who approved; the ones with a report first; the record's note for the others", async () => {
    many();
    h.db.exec(`INSERT INTO audit_log (actor, action, table_name, record_id) VALUES ('district-iq', '${syn.BACKFILL_ACTION}', 'officer_steps', '2026-11-27')`);
    const r = await syn.runSyntheticResolutions({ now: h.now, backDays: 0, perDay: 6 });
    expect(r.written).toBe(6);
    // a case the pipeline itself closed today, with its record's note
    kase("PIPE", { is_open: 0, status_std: "Resolved", closed_at: "2026-11-28 19:00:00" }, [["grievance", 1, "citizen_app"]]);
    h.db.exec("INSERT INTO incident_timeline (incident_id, at, step, note, actor) VALUES ('PIPE', '2026-11-28 19:00:00', 'Resolved', 'Incident closed', 'GCC')");
    const res = await resolutionsFor([...r.ids, "PIPE"], { forCollector: true });
    for (const id of r.ids) {
      expect(res[id]).toMatchObject({ report: true, photos: [expect.stringMatching(/^\/api\/officer\/photos\/\d{8}-c45e00[0-9a-f]{10}\/1\.jpg$/)], remark: expect.any(String), by: expect.stringMatching(/field officer/) });
      expect(["collector", "department"]).toContain(res[id].approvedBy);
    }
    expect(res.PIPE).toMatchObject({ report: false, photos: [], remark: "Incident closed", approvedBy: "records" });
    const list = await resolvedList({ period: "daily", zone: null, dept: null, sev: null, q: null, page: 0 });
    expect(list.total).toBe(7);
    expect(list.withReport).toBe(6);
    expect(list.rows.map((x) => x.id).slice(-1)).toEqual(["PIPE"]);
    expect(list.rows.slice(0, 6).every((x) => x.has_report && x.resolution?.photos.length === 1)).toBe(true);
    // a generated photo is served from the library on a copy that does not have the folder (the hosted copy)
    const dir = (res[r.ids[0]].photos[0].split("/")[4]);
    fs.rmSync(path.join(UP, dir), { recursive: true, force: true });
    expect((await readPhoto(dir, "1.jpg"))?.type).toBe("image/jpeg");
    // a real folder name never is
    expect(await readPhoto("20261128-0123456789abcdef", "1.jpg")).toBeNull();
  });
});
