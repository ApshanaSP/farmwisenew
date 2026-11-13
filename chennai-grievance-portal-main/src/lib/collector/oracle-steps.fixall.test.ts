// reviewerG-07 (on hunt2-ops-09): the QA oracle (tests/qa/oracle/pinned.mjs overlay) and so the grader (tests/qa/pass4/grader/grade.mjs,
// which compares a told status with the oracle's effStatus) laid the Collector's decisions only. The app's status now also follows the
// lead department's later officer step on an open case (effective.ts STEP_STATUS), so a graded run that records steps on live cases would
// mark a correct "Assigned" or "Awaiting verification" wrong. The oracle now applies the steps by the same rule; the pinned snapshot's five
// steps are all on incidents it does not hold, so its figures do not move.
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { beforeAll, describe, expect, it } from "vitest";
import { effectiveStatus } from "@/lib/collector/effective";

type Row = { id: string; dept: string; open: boolean; effStatus: string; status: string; officerStep: string | null; rawOpen: boolean; decision: string | null };
type Oracle = { effective: Row[]; overlaid: Row[] };
const ORACLE = path.join(process.cwd(), "tests", "qa", "oracle");
const pinned = fs.existsSync(path.join(process.cwd(), "data", "aws-cache", "qa", "pinned", "tables", "incidents.json.gz"));
// the oracle is plain JavaScript outside src: loaded by its file URL (typed here by what the test reads)
const load = async () => (await import(/* @vite-ignore */ pathToFileURL(path.join(ORACLE, "pinned.mjs")).href)) as {
  loadOracle: (o: { durable: unknown }) => Oracle; durableRows: () => { steps: unknown[]; decisions: unknown[] } };

let base: Row[] = [];
let mod: Awaited<ReturnType<typeof load>>;
const NO_ROWS = { decisions: [], assignments: [], steps: [] };
beforeAll(async () => {
  if (!pinned) return;
  mod = await load();
  // open cases with no decision or routing on the pinned rows, each with a lead department
  base = mod.loadOracle({ durable: NO_ROWS }).effective.filter((r) => r.open && r.dept).slice(0, 8);
}, 60_000);

const step = (step_id: number, incident_id: string, dept_code: string, s: string, at: string) => ({ step_id, incident_id, dept_code, step: s, at });
const decision = (decision_id: number, incident_id: string, d: string, decided_at: string) => ({ decision_id, incident_id, decision: d, decided_at });

describe.skipIf(!pinned)("reviewerG-07: the QA oracle applies officer steps by the app's rule", () => {
  it("each step on an open case gives the app's status; another department's step, a later or same-second decision, a closed case do not", () => {
    const [a, b, c, d, e, f, g] = base;
    const o = mod.loadOracle({
      durable: {
        assignments: [],
        steps: [step(1, a.id, a.dept, "approve", "2026-11-01 10:00:00"),
          step(2, b.id, b.dept, "approve", "2026-11-01 10:00:00"), step(3, b.id, b.dept, "action", "2026-11-01 11:00:00"),
          step(4, c.id, c.dept, "send", "2026-11-01 12:00:00"),
          step(5, d.id, "OTHER-DEPT", "approve", "2026-11-01 10:00:00"),
          step(6, e.id, e.dept, "send", "2026-11-01 12:00:00"),
          step(7, f.id, f.dept, "approve", "2026-11-01 09:00:00"),
          step(8, g.id, g.dept, "action", "2026-11-01 10:00:00")],
        decisions: [decision(1, e.id, "verify", "2026-11-01 12:00:00"), // the same second: the decision wins (and closes it)
          decision(2, f.id, "reopen", "2026-11-01 08:00:00"), // a reopen before the step: the step reads
          decision(3, g.id, "escalate", "2026-11-01 11:00:00")] // no effect: the step reads
      }
    });
    const row = new Map(o.effective.map((r) => [r.id, r]));
    const said = (r: Row) => [r.effStatus, r.open, r.officerStep];
    expect(said(row.get(a.id)!)).toEqual(["Assigned", true, "approve"]);
    expect(said(row.get(b.id)!)).toEqual(["In progress", true, "action"]);
    expect(said(row.get(c.id)!)).toEqual(["Awaiting verification", true, "send"]);
    expect(said(row.get(d.id)!)).toEqual([d.status, true, null]);
    expect(said(row.get(e.id)!)).toEqual(["Resolved", false, null]);
    expect(said(row.get(f.id)!)).toEqual(["Assigned", true, "approve"]);
    expect(said(row.get(g.id)!)).toEqual(["In progress", true, "action"]);
    // the same answers as the app's own rule (effective.ts), row by row
    for (const [r, latest, s] of [[a, null, "approve"], [b, null, "action"], [c, null, "send"], [f, "reopen", "approve"], [g, null, "action"]] as const)
      expect(row.get(r.id)!.effStatus).toBe(effectiveStatus(1, r.status, latest, s).status);
  });

  it("the grader's truth (truth.mjs, read by grade.mjs) tells the step's status", async () => {
    const { Truth } = (await import(/* @vite-ignore */ pathToFileURL(path.join(ORACLE, "truth.mjs")).href)) as { Truth: new (o: Oracle) => { row(id: string): Row } };
    const [a] = base;
    const T = new Truth(mod.loadOracle({ durable: { ...NO_ROWS, steps: [step(1, a.id, a.dept, "send", "2026-11-01 10:00:00")] } }));
    expect(T.row(a.id).effStatus).toBe("Awaiting verification");
  });

  it("the pinned snapshot's own steps are all on incidents it does not hold: its figures do not move", () => {
    const rows = mod.durableRows();
    expect(rows.steps.length).toBeGreaterThan(0);
    expect(mod.loadOracle({ durable: rows }).effective.filter((r) => r.officerStep)).toEqual([]);
  });
});
