// QA pass 4, final gate (oracles and factory): three figures the final run of same-number.mjs still reads wrong on the final build (6bb5423), and one test that no longer tests. Each of the first two is the part of an
// earlier finding that the fix did not reach: the fix made the earlier it(...) in same-number.test.ts pass, and the same screen still disagrees with the oracle on another figure.
// A test named gate-oracle-N is a bug that is open now: it.fails keeps the suite green and the bug visible. The fixer changes it to it().
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/gate-oracle-figures.test.ts
// Real HTTP routes on a frozen-clock server of the pinned snapshot, the collector's session, no model. This file owns port 3228 (QA_GATE_PORT).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collect, scopeLabel } from "./same-number.mjs";

const PORT = Number(process.env.QA_GATE_PORT ?? 3228);
const ROOT = path.resolve(__dirname, "..", "..", "..");
const childEnv = () => { const e: NodeJS.ProcessEnv = { ...process.env }; for (const k of Object.keys(e)) if (k === "NODE_ENV" || k.startsWith("VITEST") || k === "AWS_DURABLE_FILE" || k === "THUNAI_DIR" || k === "NODE_OPTIONS") delete e[k]; return e; };
const server = (...a: string[]) => execFileSync(process.execPath, ["tests/qa/pass4/server.mjs", ...a], { cwd: ROOT, env: childEnv(), encoding: "utf8", timeout: 240_000 });
const INSTANCE = `gate-oracle-${process.pid}`;

type Reading = { scope: string; surface: string; figure: string; value: number | null; oracle: number; diff: number | null };
type Scope = { period: string; zone: number | null; dept: string | null };
const DISTRICT_W: Scope = { period: "weekly", zone: null, dept: null }, SWM_W: Scope = { period: "weekly", zone: null, dept: "GCC-SWM" };
let readings: Reading[] = [];
let oracle: any;
const get = (scope: Scope, surface: string, figure: string) => readings.find((r) => r.scope === scopeLabel(scope) && r.surface === surface && r.figure === figure);

describe("gate-oracle: figures on a screen the fix reached in part", () => {
  beforeAll(async () => {
    server("stop", "--port", String(PORT));
    server("start", "--port", String(PORT), "--frozen", "--ticking", "--instance", INSTANCE, "--env", "ASSISTANT_TOOLS_API=1");
    const r = await collect({ port: PORT, instance: INSTANCE, scopes: [DISTRICT_W, SWM_W] } as never);
    readings = r.b.readings; oracle = r.o;
  }, 900_000);
  afterAll(() => {
    server("stop", "--port", String(PORT));
    try { fs.rmSync(path.join(ROOT, "data", "aws-cache", "qa", "srv", INSTANCE), { recursive: true, force: true }); } catch { /* gitignored QA folder */ }
  });

  // QA pass 7 gate (65f36ea1): gate-oracle-2 and -3 are fixed on the combined branch, so plain tests now
  it("gate-oracle-2 Jarvis's department comparison, with one department chosen on the console, gives the other department's past-deadline figure (GCC-ELE: 0 against 38 this week)", () => {
    const r = get(SWM_W, "thunai/round:compare(depts)", "GCC-ELE.overdue");
    expect(r).toBeTruthy();
    expect(r?.value).toBe(r?.oracle);
  });

  it("gate-oracle-3 Jarvis's zone performance 'Open' for the whole district adds up the zones only, so the incidents with no zone drop out (1,116 against 1,167 this week)", () => {
    const r = get(DISTRICT_W, "thunai/round:performance(zone)", "kpi.open");
    expect(r).toBeTruthy();
    expect(r?.value).toBe(r?.oracle);
  });

  // same-number.test.ts same-number-19 filters on the hook name "news-media-only@1". RC-38 renamed the hook to @2 (derive.ts), so that test passes without testing anything.
  // The hook still takes out 144 incidents, and 3 of them hold deaths (6 in all). The owner's decision on the hook stands; this records what the final build does.
  it.fails("gate-oracle-4 no news-only incident with a recorded death is left out as 'not news media' by the hook's current name (news-media-only@2 takes out 3 with 6 deaths)", () => {
    const out = oracle.hooks.removed.filter((x: any) => /^news-media-only@/.test(x.hook) && oracle.rawRow(String(x.id))?.dead > 0).map((x: any) => x.id);
    expect(out).toEqual([]);
  });
});
