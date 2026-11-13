import fs from "fs";
import os from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

// pass4-open-01 (pass 4's PB-218): status changes never reached the grievance dataset files. appendStatusChangeToDataset had no
// production caller: a filing appended its line (api/complaints), but an officer's step or a Collector's decision, written into the
// complaint's history by syncComplaints, never reached grievance_status_history.csv. And the function appended only the newest row,
// while one step can write several.

const H = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, appended: [] as string[], real: false }));
const pool = {
  query: async (sql: string, params: unknown[] = []) => {
    const [s, p] = expand(translate(sql), params);
    const st = H.db.prepare(s);
    return /^\s*SELECT/i.test(s) ? [st.all(...(p as never[]))] : [{ affectedRows: Number(st.run(...(p as never[])).changes) }];
  }
};
vi.mock("@/lib/db", () => ({ default: pool }));
vi.mock("@/lib/collector/db", () => ({ default: pool, ops: (t: string) => t }));
vi.mock("@/lib/manu/sms", () => ({ sendPetitionSms: async () => {} }));
vi.mock("@/lib/dataset/append", async (orig) => {
  const real = await orig<typeof import("@/lib/dataset/append")>();
  return { ...real, appendStatusChangeToDataset: (code: string) => { H.appended.push(code); return H.real ? real.appendStatusChangeToDataset(code) : Promise.resolve(); } };
});

const { syncComplaints } = await import("@/lib/complaint-progress");
/** the append starts on the next turn of the event loop, then runs on its queue */
const settled = async () => { await new Promise((r) => setImmediate(r)); await (global as unknown as { __datasetQueue?: Promise<void> }).__datasetQueue; };

function fresh() {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  const db = new DatabaseSync(":memory:");
  registerFunctions(db);
  db.exec(`
    CREATE TABLE complaints (id INTEGER PRIMARY KEY, complaint_code TEXT, user_id INTEGER, status TEXT, rejected_stage TEXT, remarks TEXT, created_at TEXT, is_synthetic INTEGER DEFAULT 0);
    CREATE TABLE complaint_status_history (id INTEGER PRIMARY KEY, complaint_id INTEGER, status TEXT, stage TEXT, remarks TEXT, changed_by INTEGER, created_at TEXT);
    CREATE TABLE events (event_id TEXT PRIMARY KEY, source TEXT, source_record_id TEXT, incident_id TEXT);
    CREATE TABLE officer_steps (step_id INTEGER PRIMARY KEY, incident_id TEXT, dept_code TEXT, step TEXT, note TEXT, report_id INTEGER, at TEXT);
    CREATE TABLE officer_reports (report_id INTEGER PRIMARY KEY, incident_id TEXT, photo_dir TEXT, photos TEXT);
    CREATE TABLE collector_decisions (decision_id INTEGER PRIMARY KEY, incident_id TEXT, decision TEXT, note TEXT, decided_role TEXT, decided_at TEXT);
    INSERT INTO complaints (id, complaint_code, user_id, status, rejected_stage, remarks, created_at) VALUES (1, '2026-111AAA', 50, 'Pending Approval', NULL, NULL, '2026-10-10 09:00:00'),
                                  (3, '2026-333CCC', 50, 'Pending Approval', NULL, NULL, '2026-10-10 10:00:00');
    INSERT INTO complaint_status_history (complaint_id, status, stage, remarks, changed_by, created_at)
      VALUES (1, 'Complaint Filed', 'Citizen', 'Complaint registered by citizen.', 50, '2026-10-10 09:00:00');
    INSERT INTO events VALUES ('GRV-2026-111AAA', 'grievance', '2026-111AAA', 'INC-1'), ('GRV-2026-333CCC', 'grievance', '2026-333CCC', 'INC-2');`);
  return db;
}

describe("pass4-open-01: an officer's step or a Collector's decision reaches the dataset", () => {
  beforeEach(() => { H.db = fresh(); H.appended = []; H.real = false; });

  it("syncComplaints hands each complaint whose history grew to the dataset append, and only those", async () => {
    H.db.exec(`INSERT INTO officer_steps (incident_id, dept_code, step, at) VALUES ('INC-1', 'GCC-SWD', 'approve', '2026-10-10 11:00:00')`);
    await syncComplaints(["INC-1", "INC-2"], 7);
    await settled();
    expect(H.appended).toEqual(["2026-111AAA"]);
    await syncComplaints(["INC-1"], 7); // nothing new: no second append
    await settled();
    expect(H.appended).toEqual(["2026-111AAA"]);
  });

  it("a step that writes two history rows at once puts both in grievance_status_history.csv", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pb218-"));
    const saved = process.env.DATASET_DIR;
    process.env.DATASET_DIR = dir;
    try {
      // the complaint is already in grievances.csv (it was appended when filed)
      fs.writeFileSync(path.join(dir, "grievances.csv"), "Complaint No,Title\r\n2026-111AAA,Drain\r\n");
      H.db.exec(`INSERT INTO officer_steps (incident_id, dept_code, step, at) VALUES ('INC-1', 'GCC-SWD', 'approve', '2026-10-10 11:00:00'),
                                                                                     ('INC-1', 'GCC-SWD', 'close', '2026-10-11 16:00:00')`);
      H.real = true;
      await syncComplaints(["INC-1"], 7);
      await settled(); // the append is fire-and-forget: wait for it
      const lines = fs.readFileSync(path.join(dir, "grievance_status_history.csv"), "utf8").trim().split(/\r?\n/).slice(1);
      const statuses = lines.map((l) => l.split(",")[1]);
      expect(statuses).toEqual(expect.arrayContaining(["Approved by Department Officer", "Resolved by Department"]));
    } finally {
      if (saved === undefined) delete process.env.DATASET_DIR; else process.env.DATASET_DIR = saved;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

afterEach(() => { H.real = false; });
