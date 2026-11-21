/**
 * Ask the Map v2: questions typed the way a hurried officer types them (eval/map-v2/typos.json), asked as the console asks them (askMap, rules
 * only, no AI), each against the same question written correctly. A question passes when both get the same plan (or the same area brief). Run
 * twice: with the speller off (MAP_SPELL_OFF=1, the code before v2) and on. Every correct form must itself be answered, so a pair can never pass
 * by both being refused. Writes one line per question to the scratch folder (TYPO_OUT) and prints the totals.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { haveStore, loadFrozen } from "@/lib/assistant/__tests__/golden/harness";

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/ai/gateway", async (orig) => {
  const m = await orig<typeof import("@/lib/ai/gateway")>();
  return { ...m, aiStatus: () => ({ available: false, problem: null, providers: [], stt: "" }), generateJson: async () => { throw new m.AiUnavailableError(); } };
});

const COLLECTOR = { email: "golden@test", role: "collector" as const, lockDept: null };
const CTX = { zone: null, taluk: null, incidentId: null, drawn: null, ward: null };
interface TQ { id: string; q: string; same_as: string }
const QS: TQ[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), "eval", "map-v2", "typos.json"), "utf8")).questions;
const OUT = process.env.TYPO_OUT || path.join(os.tmpdir(), `map-typos-${Date.now()}.jsonl`);
let askMap: typeof import("./ask").askMap;

beforeAll(async () => {
  if (!haveStore()) return;
  const f = await loadFrozen();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(f.frozenAt);
  askMap = (await import("./ask")).askMap;
}, 300_000);

type R = Awaited<ReturnType<typeof askMap>>;
/** What the officer gets: the plan (language aside: the typed form decides it), else the brief's area, else what was said. */
const sig = (r: R) => r.kind === "answer" && r.plan ? JSON.stringify({ ...r.plan, language: null }) : r.kind === "brief" ? `brief:${r.brief?.label.en}` : `${r.kind}:${r.say?.en ?? ""}`;
const answered = (r: R) => r.kind === "answer" || r.kind === "brief";
const ask = (text: string) => askMap({ text, plan: null, prev: null, context: CTX, user: COLLECTOR, reword: false });

describe.skipIf(!haveStore())("Ask the Map v2: typos and loose spelling", () => {
  it("each typed question gets the same plan as its correct form (speller off, then on)", async () => {
    const score: Record<"off" | "on", number> = { off: 0, on: 0 };
    const bad: string[] = [];
    for (const x of QS) {
      const row: Record<string, unknown> = { id: x.id, q: x.q };
      for (const mode of ["off", "on"] as const) {
        process.env.MAP_SPELL_OFF = mode === "off" ? "1" : "";
        const want = await ask(x.same_as);
        if (!answered(want)) { bad.push(`${x.id}: the correct form "${x.same_as}" is not answered (${sig(want).slice(0, 80)})`); continue; }
        const got = await ask(x.q);
        const ok = sig(got) === sig(want);
        if (ok) score[mode]++;
        row[mode] = ok;
        if (mode === "on") { row.read = got.spelled.map((f) => `${f.from}->${f.label}`); if (!ok) { row.got = sig(got).slice(0, 300); row.want = sig(want).slice(0, 300); } }
      }
      fs.appendFileSync(OUT, JSON.stringify(row) + "\n");
      console.log(`${row.on ? "PASS" : "FAIL"} ${x.id} off=${row.off} on=${row.on} ${x.q} ${row.read ? JSON.stringify(row.read) : ""}${row.on ? "" : `\n   got  ${row.got}\n   want ${row.want}`}`);
    }
    process.env.MAP_SPELL_OFF = "";
    const sum = { n: QS.length, before: score.off, after: score.on, invalid: bad.length, out: OUT };
    console.log("TYPOS " + JSON.stringify(sum));
    for (const b of bad) console.log("INVALID " + b);
    expect(bad).toEqual([]);
    expect(score.on).toBeGreaterThan(score.off);
    // the bar for v2: at least 85 % read as their correct form with no AI
    expect(score.on / QS.length).toBeGreaterThanOrEqual(0.85);
  }, 600_000);

  it("held-out questions, never tuned against: reported, not asserted", async () => {
    const H: TQ[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), "eval", "map-v2", "typos-holdout.json"), "utf8")).questions;
    const score: Record<"off" | "on", number> = { off: 0, on: 0 };
    for (const x of H) {
      const row: Record<string, unknown> = { id: x.id, q: x.q };
      for (const mode of ["off", "on"] as const) {
        process.env.MAP_SPELL_OFF = mode === "off" ? "1" : "";
        const want = await ask(x.same_as);
        const got = await ask(x.q);
        const ok = answered(want) && sig(got) === sig(want);
        if (ok) score[mode]++;
        row[mode] = ok;
        if (mode === "on") { row.read = got.spelled.map((f) => `${f.from}->${f.label}`); row.answered = answered(want); if (!ok) { row.got = sig(got).slice(0, 300); row.want = sig(want).slice(0, 300); } }
      }
      fs.appendFileSync(OUT, JSON.stringify({ holdout: true, ...row }) + "\n");
    }
    process.env.MAP_SPELL_OFF = "";
    console.log("HOLDOUT " + JSON.stringify({ n: H.length, before: score.off, after: score.on, out: OUT }));
  }, 600_000);
});
