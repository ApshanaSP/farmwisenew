/**
 * Ask the Map v2, AI first: the console's own path (askMap: the speller, then Claude reading the question with the rules' plan as a suggestion,
 * then the plan fitting, then the executor), live, on the frozen store. Three sets:
 *   dev      eval/map-final/dev.json (45), scored by evalcheck.ts misses
 *   holdout  eval/map-v2/ai-holdout.json (15), the same scorer, never tuned against
 *   typos    eval/map-v2/typos.json + typos-holdout.json (96 pairs): the typed question's plan against the rules' plan for the correct form, on the
 *            fields that show it was understood (layers, category or family, places and areas, the kind of answer); a brief against the same brief
 * A busy provider is waited for (withBusyRetry). One line per question to ASKAI_OUT; totals, time and US$ (from the spend record) at the end.
 *   set AI_MAP_PROVIDER=anthropic&& npx vitest run --config vitest.live.config.ts src/lib/map/askai.live.ts
 */
import fs from "fs";
import os from "os";
import path from "path";
import { beforeAll, expect, it, vi } from "vitest";
import { haveStore, loadFrozen } from "@/lib/assistant/__tests__/golden/harness";
import type { Plan } from "./plan";
import { misses, withBusyRetry, type Q } from "./evalcheck";

vi.mock("@/lib/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));
vi.mock("@/lib/collector/db", async (orig) => ({ ...(await orig<object>()), default: (await import("@/lib/assistant/__tests__/golden/harness")).forward }));

const OUT = process.env.ASKAI_OUT || path.join(os.tmpdir(), `map-askai-${Date.now()}.jsonl`);
const SETS = (process.env.ASKAI_SETS || "dev,holdout,typos").split(",");
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), f), "utf8")).questions;

let ready = false;
beforeAll(async () => {
  if (!haveStore()) return;
  const f = await loadFrozen();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(f.frozenAt);
  ready = true;
}, 300_000);

const key = (p: Plan | null) => {
  if (!p) return null;
  const takes = p.steps.filter((s): s is Extract<Plan["steps"][number], { op: "take" }> => s.op === "take");
  const inc = takes.find((t) => t.layer === "incidents")?.filter;
  const places = new Set<string>();
  const area = (a: { kind: string; id?: number; ref?: string; code?: string }) => (a.kind === "point" ? a.ref! : a.kind === "taluk" ? a.code! : a.kind === "drawn" ? "drawn" : `${a.kind}:${a.id}`);
  for (const st of p.steps) {
    if (st.op === "inside") places.add(area(st.area as never));
    if (st.op === "along") places.add(st.line);
    if (st.op === "nearest" && st.from.startsWith("place:")) places.add(st.from.slice(6));
    if (st.op === "compare") { places.add(area(st.a as never)); places.add(area(st.b as never)); }
  }
  const kinds = ["count_by", "hotspot", "farthest", "rank", "change", "compare"].filter((o) => p.steps.some((x) => x.op === o));
  return JSON.stringify({ layers: [...new Set(takes.map((t) => t.layer))].sort(), cats: [...(inc?.category ?? []), ...(inc?.family ?? [])].sort(), places: [...places].sort(), kinds });
};

it.runIf(haveStore())("Ask the Map, AI first, as the console asks", async () => {
  expect(ready).toBe(true);
  vi.useRealTimers();
  const { askMap } = await import("./ask");
  const { world } = await import("./world");
  const { makeResolver } = await import("./resolve");
  const { mapLang, rulesRoute } = await import("./route");
  const { spentUsd } = await import("@/lib/ai/claudebudget");
  const { prevTopOf, earlierAreasOf } = await import("./prevtop");
  const { resolver, world: w } = await world();
  const resolve = makeResolver(resolver);
  const usd0 = spentUsd();
  const wardZone = new Map<number, number>(JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "boundaries", "gcc-wards.geojson"), "utf8")).features
    .map((f: { properties: { ward_no: number; zone_number: number } }) => [Number(f.properties.ward_no), Number(f.properties.zone_number)]));
  // one test officer per set: the console allows each officer a daily AI allowance (gateway.ts DAILY_TOKENS), and one officer asking 330 questions ran out
  let user = { email: "eval-dev@map", role: "collector" as const, lockDept: null as string | null };
  const as = (set: string) => { user = { ...user, email: `eval-${set}@map` }; };
  const context = { zone: null, taluk: null, incidentId: null, drawn: null, ward: null };
  // a server error is a miss (and counted), never the end of the run
  const errors: string[] = [];
  const ask = async (text: string) => { try { return (await withBusyRetry(() => askMap({ text, plan: null, prev: null, context, user: { email: user.email, role: user.role, lockDept: null }, reword: false }))).value; } catch (e) { errors.push(`${text}: ${(e as Error).message}`); console.log(`SERVER ERROR ${text}: ${(e as Error).message}`); return null; } };
  const ms: number[] = [];
  const score: Record<string, { n: number; ok: number; ai: number }> = {};
  const add = (set: string, ok: boolean, ai: boolean) => { const s = (score[set] ??= { n: 0, ok: 0, ai: 0 }); s.n++; if (ok) s.ok++; if (ai) s.ai++; };

  for (const [set, file] of [["dev", "eval/map-final/dev.json"], ["holdout", "eval/map-v2/ai-holdout.json"], ["big", "eval/map-v2/big.json"], ["fresh", "eval/map-v2/fresh.json"], ["human", "eval/map-v2/human.json"], ["human3", "eval/map-v3/human.json"], ["holdout3", "eval/map-v3/holdout.json"], ["fresh3", "eval/map-v3/fresh.json"], ["collector3", "eval/map-v3/collector.json"], ["probe", process.env.ASKAI_PROBE ?? "eval/map-v3/holdout.json"]] as const) {
    if (!SETS.includes(set)) continue;
    as(set);
    for (const x of read(file) as (Q & { kind?: "brief" | "scorecard" | "city" | "refuse" })[]) {
      const t0 = Date.now();
      const r = await ask(x.q);
      ms.push(Date.now() - t0);
      const refused = !r || (!r.plan && r.kind === "say");
      // a kind of answer the question needs (an area brief, a scorecard, the live city, a refusal), or the plan it must have
      const m = x.kind ? (
        x.kind === "brief" ? (r?.kind === "brief" ? [] : [`not a brief (${r?.kind})`])
        : x.kind === "scorecard" ? (r?.scorecard ? [] : [`not a scorecard (${r?.kind})`])
        : x.kind === "city" ? (r?.city || r?.extra?.forecast || /live .* feed is not available|forecast cannot be read/.test(`${r?.say?.en ?? ""} ${r?.answer?.meaning ?? ""}`) ? [] : [`not the live city (${r?.kind})`])
        : (refused && !r?.city && !/live .* feed/.test(r?.say?.en ?? "") ? [] : [`answered, should be refused (${r?.answer?.headline?.slice(0, 60) ?? r?.kind})`]))
        : misses(r?.plan ?? null, refused ? ["not a map question"] : null, x.want ?? {});
      // the count, checked independently where the answer is a facility layer in a zone: the raw layer file, each point's own ward, the ward file's zone
      const st = r?.plan?.steps ?? [];
      if (st.length === 2 && st[0].op === "take" && st[0].layer !== "incidents" && st[1].op === "inside" && st[1].area.kind === "zone" && r?.answer) {
        const kinds = st[0].where?.kinds ?? null, gov = st[0].where?.government ?? null, zone = st[1].area.id;
        const fp = path.join(process.cwd(), "data", "layers", `${st[0].layer === "police" ? "police_osm" : st[0].layer}.geojson`);
        if (fs.existsSync(fp) && gov == null && st[0].layer !== "police") {
          const n = JSON.parse(fs.readFileSync(fp, "utf8")).features.filter((f: { properties: { kind?: string; ward?: number } }) =>
            (!kinds || kinds.includes(f.properties.kind ?? "")) && f.properties.ward != null && wardZone.get(Number(f.properties.ward)) === zone).length;
          const same = n === r.answer.count;
          fs.appendFileSync(OUT, JSON.stringify({ set, id: x.id, oracle: n, map: r.answer.count, same }) + "\n");
          console.log(`COUNT ${same ? "SAME" : "DIFF"} ${x.id} map ${r.answer.count} independent ${n}`);
        }
      }
      add(set, !m.length, !!r?.ai_used);
      fs.appendFileSync(OUT, JSON.stringify({ set, id: x.id, q: x.q, head: r?.answer?.headline ?? r?.say?.en ?? null, meaning: r?.answer?.meaning ?? null, ok: !m.length, ai: r?.ai_used, read: r?.spelled.map((f) => `${f.from}->${f.label}`), miss: m, plan: r?.plan ?? null }) + "\n");
      console.log(`${m.length ? "FAIL" : "PASS"} ${set} ${x.id} ${m.join("; ")}`);
    }
  }
  for (const fset of ["followups", "followups3", "followups3h", "followups3f", "topics3", "collectorf3", "turns3", "fprobe"].filter((x) => SETS.includes(x))) {
    as(fset);
    const convs = JSON.parse(fs.readFileSync(fset === "fprobe" ? path.join(process.cwd(), process.env.ASKAI_FPROBE ?? "") : path.join(process.cwd(), "eval", fset === "followups" ? "map-v2" : "map-v3", fset === "followups3h" ? "followups-holdout.json" : fset === "followups3f" ? "followups-fresh.json" : fset === "topics3" ? "topics.json" : fset === "collectorf3" ? "collector-followups.json" : fset === "turns3" ? "turns.json" : "followups.json"), "utf8")).conversations as { id: string; turns: { q: string; want?: Q["want"]; kind?: "brief"; there?: number; rel?: "new" | "follow" }[] }[];
    for (const c of convs) {
      let prev: Plan | null = null;
      let last: Awaited<ReturnType<typeof askMap>> | null = null;
      const plans: Plan[] = [];
      // v3: the conversation as the console sends it (useMapAsk historyOf): each question with its answer in a few words
      const history: { q: string; a: string }[] = [];
      for (const [k, t] of c.turns.entries()) {
        const t0 = Date.now();
        // v3: the follow-up carries the last answer's first places, as the console sends them
        const top = prevTopOf(last);
        const r = (await withBusyRetry(() => askMap({ text: t.q, plan: null, prev, prevTop: prev ? top : null, earlier: prev ? earlierAreasOf(plans) : null, history: prev ? history.slice(-3) : null, context, user: { email: user.email, role: user.role, lockDept: null }, reword: false }))).value;
        last = r;
        if (r?.plan) plans.push(r.plan);
        history.push({ q: t.q, a: (r?.answer?.headline.replace(/ · (map layer ready|வரைபட அடுக்கு தயார்)\.?$/, "") ?? (r?.brief ? `What is happening: ${r.brief.label.en}` : r?.say?.en ?? "")).slice(0, 400) });
        ms.push(Date.now() - t0);
        // a turn may want an area brief, or the place the last answer ranked number N ("what is happening there")
        const thereRef = t.there ? top[t.there - 1]?.ref : null;
        const inPlace = (p: Plan | null | undefined) => !!p?.steps.some((s) => s.op === "inside" && (s.area.kind === "point" ? s.area.ref === thereRef : `${s.area.kind}:${s.area.kind === "taluk" ? s.area.code : s.area.id}` === thereRef));
        const m = [
          ...(t.kind === "brief" ? (r?.kind === "brief" ? [] : [`not a brief (${r?.kind})`]) : []),
          ...(t.there ? (!thereRef ? ["the last answer had no place to point at"] : inPlace(r?.plan) || (r?.kind === "brief" && JSON.stringify(r.brief?.area ?? {}).includes(String(thereRef.split(":")[1]))) ? [] : [`not at the last answer's number ${t.there} (${thereRef})`]) : []),
          ...(t.want ? misses(r?.plan ?? null, !r?.plan ? [r?.say?.en ?? "no answer"] : null, t.want) : []),
          // v3: the turn reader's call: a follow-up, or a new question that carries nothing over
          ...(t.rel && r?.turn && (r.turn.relation === "new_question") !== (t.rel === "new") ? [`read as ${r.turn.relation}, not ${t.rel === "new" ? "a new question" : "a follow-up"}`] : [])
        ];
        add(fset, !m.length, !!r?.ai_used);
        fs.appendFileSync(OUT, JSON.stringify({ set: fset, head: r?.answer?.headline ?? r?.say?.en ?? null, meaning: r?.answer?.meaning ?? null, id: `${c.id}.${k + 1}`, q: t.q, ok: !m.length, ai: r?.ai_used, miss: m, turn: r?.turn ?? null, plan: r?.plan ?? null }) + "\n");
        console.log(`${m.length ? "FAIL" : "PASS"} ${fset} ${c.id}.${k + 1} ${t.q} ${m.join("; ")}`);
        if (r?.plan) prev = r.plan;
      }
    }
  }
  if (SETS.includes("typos")) {
    const pairs = [...read("eval/map-v2/typos.json").map((q: object) => ({ ...q, set: "typos" })), ...read("eval/map-v2/typos-holdout.json").map((q: object) => ({ ...q, set: "typos-holdout" }))] as { id: string; q: string; same_as: string; set: string }[];
    for (const x of pairs) {
      as(x.set);
      const want = rulesRoute(x.same_as, null, { resolve, dept: () => null, lang: mapLang(x.same_as, resolve(x.same_as, null)), now: w.now });
      const t0 = Date.now();
      const r = await ask(x.q);
      ms.push(Date.now() - t0);
      // AI only (the console's default): the typed question must be read as Claude reads its correct form (a typo must not change the reading);
      // otherwise (AI_MAP_MODE=hybrid or rules) against the rules' plan for the correct form
      const aiOnly = (process.env.AI_MAP_MODE ?? "ai") === "ai";
      const right = aiOnly ? await ask(x.same_as) : null;
      const sigOf = (y: Awaited<ReturnType<typeof ask>>) => (!y ? "none" : y.kind === "brief" ? `brief:${y.brief?.label.en}` : y.plan ? key(y.plan) : `say:${y.say?.en?.slice(0, 40)}`);
      const ok = aiOnly ? sigOf(r) === sigOf(right) && (r?.kind === "answer" || r?.kind === "brief")
        : want?.kind === "plan" ? key(r?.plan ?? null) === key(want.plan) : want?.kind === "brief" ? r?.kind === "brief" && !!r.brief : false;
      add(x.set, ok, !!r?.ai_used);
      fs.appendFileSync(OUT, JSON.stringify({ set: x.set, id: x.id, q: x.q, ok, ai: r?.ai_used, read: r?.spelled.map((f) => `${f.from}->${f.label}`), got: sigOf(r), want: aiOnly ? sigOf(right) : want?.kind === "plan" ? key(want.plan) : want?.kind }) + "\n");
      console.log(`${ok ? "PASS" : "FAIL"} ${x.set} ${x.id} ${x.q}`);
    }
  }
  ms.sort((a, b) => a - b);
  const sum = { score, errors, usd: Number((spentUsd() - usd0).toFixed(5)), median_ms: ms[Math.floor(ms.length / 2)], p90_ms: ms[Math.floor(ms.length * 0.9)], out: OUT };
  console.log("ASKAI " + JSON.stringify(sum));
  fs.appendFileSync(OUT, "SUMMARY " + JSON.stringify(sum) + "\n");
}, 3_600_000);
