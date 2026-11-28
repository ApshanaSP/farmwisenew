/**
 * Fixes after a rain on an in-memory store through the AWS dialect (tasks.ts): the Collector assigns, the officer posts updates
 * and marks done with what was done, the Collector verifies or sends back; every step is an audit row, the row's status stays
 * within the table's values, and the before-rain jobs keep working as before.
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
const run = (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  const st = h.db.prepare(s);
  if (/^\s*(SELECT|WITH)/i.test(s)) return [st.all(...(p as never[]))];
  const r = st.run(...(p as never[]));
  return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }];
};
vi.mock("@/lib/collector/db", () => {
  const query = async (s: string, p: unknown[]) => run(s, p);
  // a connection for a transaction: the same store (node:sqlite has no separate session here); begin/commit/rollback are no-ops
  const getConnection = async () => ({ query, beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, release: () => undefined });
  return { default: { query, getConnection }, ops: (t: string) => t };
});
// the department's officer account (users), for the follow-up's contact
vi.mock("@/lib/db", () => ({ default: { query: async (_s: string, p: unknown[]) => [p?.[0] === "GCC-SWD" ? [{ id: 9, email: "swd.officer@example.test", first_name: "Selvi", last_name: "R" }] : []] } }));

const T = await import("./tasks");

const swd = { place: "n5|w173", label: "Velachery Main Road", lat: 12.98, lon: 80.22, ward: 173, dept: "GCC-SWD", note: "Clear and desilt the storm-water drains along Velachery Main Road." };
const pwd = { place: "e991", label: "A lane off {Odd} Street}", lat: 13.01, lon: 80.25, ward: 150, dept: "PWD-WRD", note: "x".repeat(400) };

beforeEach(() => {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  h.db = new DatabaseSync(":memory:");
  registerFunctions(h.db);
  h.db.exec(`
    CREATE TABLE followups (followup_id INTEGER PRIMARY KEY, email_id INTEGER NOT NULL, contact_id INTEGER NOT NULL, incident_id TEXT, summary TEXT NOT NULL, due_date TEXT,
      status TEXT NOT NULL DEFAULT 'pending', last_checked_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE audit_log (log_id INTEGER PRIMARY KEY, at TEXT DEFAULT CURRENT_TIMESTAMP, actor TEXT, action TEXT, table_name TEXT, record_id TEXT, before_value TEXT, after_value TEXT);`);
});

const row = (id: number) => h.db.prepare("SELECT status, summary, contact_id, email_id FROM followups WHERE followup_id = ?").get(id) as { status: string; summary: string; contact_id: number; email_id: number };
const fixOf = async (id: number) => (await T.readTasks({ fixes: true })).find((t) => t.id === id)!;

describe("fixes after a rain", () => {
  it("assigning writes one task per place with its assignment audited; the header survives a long note and an odd name", async () => {
    const made = await T.assignFixes("rain-2026-11-18", "flood", "2026-12-05", "collector@example.test", [swd, pwd]);
    expect(made.map((x) => x.place)).toEqual(["n5|w173", "e991"]);
    const a = row(made[0].id), b = row(made[1].id);
    expect([a.status, a.contact_id, a.email_id]).toEqual(["pending", 9, 0]);
    expect(b.contact_id).toBe(0);
    expect(b.summary.length).toBeLessThanOrEqual(500);
    expect(T.decodeSummary(b.summary)!.head).toMatchObject({ r: "rain-2026-11-18", d: "PWD-WRD", k: "fix:flood:e991", w: 150, u: "2026-12-05 23:59:59", p: "A lane off {Odd) Street)" });
    const fixes = await T.readTasks({ fixes: true });
    expect(fixes).toHaveLength(2);
    const fb = fixes.find((t) => t.id === made[1].id)!;
    expect(fb.fix).toMatchObject({ lens: "flood", place: "e991", stage: "assigned", late: false });
    // the full note comes from the assignment, not the clipped summary
    expect(fb.fix!.note).toHaveLength(400);
    expect(fb.due).toBe("2026-12-05 23:59:59");
    expect(fb.rehearsal).toBe("rain-2026-11-18");
    expect(await T.readTasks({ fixes: false })).toHaveLength(0);
    expect(await T.readTasks({ rehearsal: "R-2026-11-28" })).toHaveLength(0);
    expect(await T.readTasks({ dept: "GCC-SWD" })).toHaveLength(1);
  });

  it("officer updates and done (their department, with what was done), Collector send-back and verify; every refusal in plain words", async () => {
    const [{ id }] = await T.assignFixes("rain-2026-11-18", "flood", "2026-12-05", "collector@example.test", [swd]);
    expect((await T.officerStep(id, "PWD-WRD", "pwd@x", "progress", "Started the work", null, null)).status).toBe(403);
    expect((await T.officerStep(id, "GCC-SWD", "swd@x", "progress", "abc", null, null)).status).toBe(400);
    expect((await T.officerStep(id, "GCC-SWD", "swd@x", "progress", null, null, null)).status).toBe(400);
    const p = await T.officerStep(id, "GCC-SWD", "swd@x", "progress", "Desilting started, 40 m done", "20261128-aaaaaaaaaaaaaaaa/1.jpg", { lat: 12.98, lon: 80.2201 });
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ ok: true, stage: "in_action", near: true });
    expect(row(id).status).toBe("pending");
    expect((await fixOf(id)).fix!.stage).toBe("in_action");

    const v0 = await T.stepFix(id, "verify", { role: "collector", user: "collector@x" });
    expect(v0.status).toBe(409);
    expect(v0.body.error).toMatch(/not marked this fix done/);
    expect((await T.stepFix(id, "done", { role: "collector", user: "collector@x" })).status).toBe(403);
    expect((await T.stepFix(id, "verify", { role: "officer", user: "swd@x", dept: "GCC-SWD" })).status).toBe(403);

    expect((await T.officerStep(id, "GCC-SWD", "swd@x", "done", "All inlets desilted, 120 m on both sides", null, null)).body).toMatchObject({ stage: "done" });
    expect(row(id).status).toBe("done");
    expect((await T.officerStep(id, "GCC-SWD", "swd@x", "progress", "One more thing", null, null)).status).toBe(409);

    const back = await T.stepFix(id, "reopen", { role: "collector", user: "collector@x" }, { remarks: "The outfall near the canal is still blocked" });
    expect(back.body).toMatchObject({ stage: "in_action" });
    expect(row(id).status).toBe("pending");
    const t1 = await fixOf(id);
    expect(t1.status).not.toBe("done");
    expect(t1.doneAt).toBeNull();

    await T.officerStep(id, "GCC-SWD", "swd@x", "done", "Outfall cleared too", null, null);
    expect((await T.stepFix(id, "verify", { role: "collector", user: "collector@x" })).body).toMatchObject({ stage: "verified" });
    const t2 = await fixOf(id);
    expect(t2.fix!.stage).toBe("verified");
    expect(t2.fix!.trail.map((e) => e.step)).toEqual(["assign", "progress", "done", "reopen", "done", "verify"]);
    expect(t2.fix!.trail[1]).toMatchObject({ remarks: "Desilting started, 40 m done", photo: "20261128-aaaaaaaaaaaaaaaa/1.jpg" });
    expect(t2.fix!.trail[3]).toMatchObject({ by: "collector@x", remarks: "The outfall near the canal is still blocked" });
    expect(t2.doneAt).toBe(t2.fix!.trail[4].at);
    expect(row(id).status).toBe("done");
    const again = await T.stepFix(id, "verify", { role: "collector", user: "collector@x" });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/already verified/);
    expect((await T.stepFix(id, "reopen", { role: "collector", user: "collector@x" }, { remarks: "again" })).status).toBe(409);
    expect((await T.stepFix(99999, "verify", { role: "collector", user: "collector@x" })).status).toBe(404);
    // every status written is one the table allows
    const statuses = (h.db.prepare("SELECT DISTINCT status FROM followups").all() as { status: string }[]).map((r) => r.status);
    for (const s of statuses) expect(["pending", "done", "reminder_drafted", "closed"]).toContain(s);
  });

  it("a before-rain job is still marked done the old way (remarks kept), and takes no update", async () => {
    h.db.exec(`INSERT INTO followups (followup_id, email_id, contact_id, summary, due_date, status) VALUES
      (50, 3, 9, '[RR] {"r":"R-2026-11-28","d":"GCC-SWD","k":"drain:INC-1","la":12.98,"lo":80.22,"w":173} Clear the drain at 2nd Street', '2026-11-29', 'pending'),
      (51, 3, 9, '[RR] {"r":"R-2026-11-20","d":"GCC-SWD","k":"pump:n1|w1","la":12.98,"lo":80.22,"w":1} Keep a pump ready', '2026-11-21', 'done');
      INSERT INTO audit_log (actor, action, table_name, record_id, after_value) VALUES ('old@x', 'rehearsal:done', 'followups', '51', '{"status":"done","photo":"20261120-bbbbbbbbbbbbbbbb/1.jpg","photo_m":40,"at":{"lat":12.98,"lon":80.22}}'),
      ('collector@x', 'rehearsal:send', 'outbound_emails', '50', '{}');`);
    expect((await T.officerStep(50, "GCC-SWD", "swd@x", "progress", "Half done", null, null)).status).toBe(400);
    expect((await T.officerStep(50, "GCC-SWD", "swd@x", "done", "Cleared", null, null)).status).toBe(200);
    const all = await T.readTasks({ dept: "GCC-SWD" });
    const j50 = all.find((t) => t.id === 50)!, j51 = all.find((t) => t.id === 51)!;
    expect(j50).toMatchObject({ status: "done", doneBy: "swd@x" });
    expect(j50.fix).toBeUndefined();
    // a done written before the tracker: its photo and officer still read (and the email's audit row with the same number is not a step)
    expect(j51).toMatchObject({ status: "done", doneBy: "old@x", photo: "20261120-bbbbbbbbbbbbbbbb/1.jpg", photoM: 40 });
    const audit = h.db.prepare("SELECT after_value FROM audit_log WHERE record_id = '50' AND action = 'rehearsal:done'").get() as { after_value: string };
    expect(JSON.parse(audit.after_value)).toMatchObject({ status: "done", remarks: "Cleared" });
  });
});
