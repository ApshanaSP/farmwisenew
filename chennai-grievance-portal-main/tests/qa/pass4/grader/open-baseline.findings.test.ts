// QA pass 4: the open baseline's findings, kept visible. Each row a finding names goes down the real path and through the grader again. A bug still open fails its check, so each test is it.fails
// and the suite stays green. When a fix lands, its it.fails turns red: set "fixed": true on the finding in docs/qa/pass4/findings/open-baseline.json and it becomes a plain it().
// The sentences are read from the open set at run time: none is written here.
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { clearCaches } from "@/lib/thunai/round";
import { browserWorld, ClientSim, runConversation } from "./client-sim";
import * as gradeMod from "./grade.mjs";
import * as setsMod from "./sets.mjs";

// plain .mjs tools: typed loosely here
const { gradeRow, Truth } = gradeMod as any;
const { FINDINGS_DIR, readSet } = setsMod as any;

const FROZEN = "2026-11-06T06:30:00.000Z";
const file = path.join(FINDINGS_DIR, "open-baseline.json");
const findings: { id: string; title: string; row_id?: string; row_ids?: string[]; fixed?: boolean }[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
const skip = !!process.env.QA_P4_SET; // not while the sentence runner has the machine

describe.skipIf(skip || !findings.length)("open baseline: the findings, one row at a time", () => {
  let T: any, env: Awaited<ReturnType<typeof browserWorld>>, rows: Map<string, Record<string, unknown>>;
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(FROZEN) });
    T = new Truth();
    env = await browserWorld();
    rows = new Map((readSet("open").rows as { id: string }[]).map((r) => [r.id, r as Record<string, unknown>]));
  }, 300_000);
  afterAll(() => { vi.useRealTimers(); });

  const grade = async (id: string) => {
    const r = rows.get(id) as { text: string; earlier?: { who: string; text: string }[] | null };
    clearCaches();
    const sim = new ClientSim(env.world, {}, env.list);
    const earlier = (r.earlier ?? []).filter((t) => t.who === "collector").map((t) => t.text);
    const o = (await runConversation(sim, earlier, r.text)).last;
    const needed = o.rounds.some((x) => x.lane === "no-model" || x.note === "no-model" || x.note === "general-fallback");
    return gradeRow(r, { lane: o.lane, path: o.path, kind: o.kind, note: o.note ?? o.rounds.map((x) => x.note).filter(Boolean).pop() ?? null, model: null, model_needed: needed, said: o.said, voice: o.voice, items: o.items, options: o.options, stage: o.stage, steps: o.steps, stage_op: o.stageOp, drafted: o.drafted, error: o.error, console: { incident: sim.incident } }, T);
  };

  for (const f of findings) {
    const ids = f.row_id ? [f.row_id] : f.row_ids ?? [];
    if (!ids.length) continue;
    const check = async () => { for (const id of ids) expect((await grade(id)).grade, id).not.toBe("wrong"); };
    if (f.fixed) it(`${f.id} ${f.title}`, check, 120_000);
    else it.fails(`${f.id} ${f.title}`, check, 120_000);
  }
});
