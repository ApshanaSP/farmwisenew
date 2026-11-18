/**
 * v8: the understanding runner (docs/jarvis/JARVIS_V8.md). On the console's own store (the dry-run copy, read only), each request goes
 * through the same path as in the console: the addressee gate (when the open mic heard it with no name), the browser's lanes
 * (v8/browser.ts, the same function Thunai.tsx uses) and the server's round (round.ts planRound), with the screen and the earlier turns
 * the item names. V=v7 is v7's code path; V=v8 the new one.
 *   EVAL8=ref                         the news on the console's panel today and this week (titles, outlets, places), for writing sets
 *   EVAL8=dry  SET=dev|holdout V=v7|v8 no model at all: what the code lanes do; what is left to the planner is "deferred"
 *   EVAL8=run  SET=... V=... TAG=<t>  live (the planner ladder; JARVIS_LIVE_CLAUDE=1 lets Claude lead under the ceiling)
 * Results: eval/v8/<set>/results/<tag>-<v>.json (rows hold ids, gold, outcome; the holdout's file hash is checked first).
 *   EVAL8=dry SET=dev V=v7 npx vitest run --config vitest.live.config.ts src/lib/thunai/v8/eval8.live.ts
 */
process.env.AWS_STORE_DRY_RUN = "1";
process.env.AWS_STORE_RELOAD_MINUTES = "100000";
process.env.AWS_DURABLE_FILE ??= "data/aws-cache/dryrun-spec/durable.sqlite";
if (process.env.JARVIS_LIVE_CLAUDE !== "1") process.env.JARVIS_CLAUDE_OFF = "1";
process.env.AI_PROVIDER = "none";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { expect, it } from "vitest";
import { newsDoc } from "@/lib/collector/intel";
import { claudeConfigured, claudeModel } from "@/lib/ai/claude";
import { serverHands } from "../data";
import { groqOnly } from "../liverecord";
import { onLlmCall } from "../llm";
import { whichLine, newsScreen } from "../newsask";
import { quickScreen, districtNounIn } from "../quick";
import { understand } from "../understand";
import { clearCaches, planRound, RoundBody, type RoundBodyT, type RoundDeps } from "../round";
import { stageContext, type StageDocT } from "../stage";
import { stageDigest, stageEmpty, stageReducer } from "../stagelocal";
import type { Lang, ScreenState, World } from "../types";
import { serverWorld } from "../world";
import { addressed } from "../addressed";
import { labelsOf } from "../register";
import { browserLaneV7, browserLaneV8, type BrowserCtx, type LastFound } from "./browser";
import { wordsLang, placeWord } from "./lang8";
import { feedLines, foundStory } from "./newsfind";
import { checkSet, emptyOutcome, score8, tally8, type Item8, type Outcome8 } from "./eval8";

groqOnly();
if (process.env.JARVIS_LIVE_CLAUDE !== "1") process.env.JARVIS_CLAUDE_OFF = "1";
const MODE = process.env.EVAL8 ?? "";
const SET = (process.env.SET ?? "dev") as "dev" | "holdout";
const V = (process.env.V ?? "v8") as "v7" | "v8";
// V=v7 in this tree: every v8 layer off by its rollback switch (the v7 commit itself is run from its own checkout for the finals)
if (V === "v7") process.env.JARVIS_UNDERSTAND = "v7";
const TAG = process.env.TAG ?? "dry";
const GAP = Number(process.env.LIVE_GAP_MS ?? 20000);
const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
const DIR = path.resolve(process.cwd(), "eval", "v8", SET);
const norm = (s: string) => s.replace(/\r\n/g, "\n");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function items(): Item8[] {
  const raw = norm(fs.readFileSync(path.join(DIR, "set.json"), "utf8"));
  if (SET === "holdout") {
    const want = fs.readFileSync(path.resolve(process.cwd(), "eval", "v8", "HASHES.txt"), "utf8").match(/^([0-9a-f]{64}) \*eval\/v8\/holdout\/set\.json$/m)?.[1];
    const got = createHash("sha256").update(raw).digest("hex");
    if (want !== got) throw new Error(`the holdout set changed since it was hashed (${got} != ${want})`);
  }
  const all = (JSON.parse(raw) as { items: Item8[] }).items;
  const bad = checkSet(all);
  if (bad.length) throw new Error(`set problems: ${bad.slice(0, 5).join("; ")}`);
  return ONLY.length ? all.filter((x) => ONLY.includes(x.id)) : all;
}

const STATE: ScreenState = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false } as unknown as ScreenState;
type NewsRow = { id: string; source: string | null; title: string };
interface Ctx { world: World; hands: ReturnType<typeof serverHands>; panel: NewsRow[] }

async function context(): Promise<Ctx> {
  const world = await serverWorld();
  const hands = serverHands({ email: "eval:v8", role: "collector", lockDept: null });
  const r = await hands.news({ period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null });
  // the console's news panel, as Thunai.tsx newsOnScreen reads it: each story by its first stored document, every outlet that ran it
  const panel = r.rows.map((x) => ({ id: String(((x.docIds as string[] | undefined) ?? [])[0] ?? x.id), source: ((x.outletNames as string[] | undefined) ?? []).join(" · ") || null, title: String(x.title ?? "") }));
  return { world, hands, panel };
}

/** where one turn leaves the browser: the screen it shows, the console's state and the turns remembered */
interface Scene { stage: StageDocT | null; state: ScreenState; turns: NonNullable<RoundBodyT["turns"]>; lastTurnAt: number | null; lastLang?: Lang | null; lastFound?: LastFound | null }

const titleOf = async (id: string): Promise<string | null> => {
  const d = (await newsDoc(id).catch(() => null)) as { title?: string | null; title_en?: string | null } | null;
  return d ? [d.title, d.title_en].filter(Boolean).join(" | ") : null;
};
const zoneName = (w: World, n: unknown): string | null => (typeof n === "number" ? w.zones.find((z) => z.n === n)?.name ?? null : null);
const caseIdsOf = (d: StageDocT | null): string[] => (d ? d.blocks.flatMap((b) => (b.kind === "CaseList" ? b.rows.map((r) => r.id) : [])) : []);

/** the browser's news-on-screen (Thunai.tsx newsOnScreen) */
const newsOn = (c: Ctx, s: Scene) => {
  if (!s.stage && s.state.panel === "news") return { items: c.panel.map((x) => ({ id: x.id, source: x.source, title: x.title })), incident: null, reading: null };
  const nr = s.stage?.blocks.find((b) => b.kind === "NewsReader");
  const cd = s.stage?.blocks.find((b) => b.kind === "CaseDetail");
  return { items: nr?.kind === "NewsReader" && !s.stage?.slots?.web ? nr.items.map((x) => ({ id: x.id, source: x.source, title: x.title })) : [], incident: cd?.kind === "CaseDetail" ? cd.incident.id : null, reading: null };
};

async function serverTurn(c: Ctx, text: string, s: Scene, heard: { lang: Lang; source: "whisper" | "typed" }, noModel: boolean, o: Outcome8): Promise<{ stage: StageDocT | null; say: string | null }> {
  const calls: (string | null)[] = [];
  const stop = onLlmCall((e) => calls.push(e.model));
  const stageCtx = s.stage ? { ...stageContext(s.stage, null), blocks: s.stage.blocks.map((b) => ({ kind: b.kind, ids: (stageContext(s.stage!, null).blocks.find((x) => x.kind === b.kind)?.ids ?? []), labels: labelsOf(b).slice(0, 30) })) } : null;
  const digest = s.stage ? stageDigest({ ...stageEmpty, doc: s.stage }) : null;
  const body = RoundBody.parse({ turnId: `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, round: 0, text, state: s.state, turns: s.turns, stage: stageCtx, stageDigest: digest, direct: null, heard: { lang: heard.lang, conf: 0.95, source: heard.source } });
  const deps: RoundDeps = noModel ? { aide: { open: async () => { throw new Error("dry: no model"); }, rungs: () => [] }, llm: { generate: (async () => { throw new Error("dry: no model"); }) as never } } as RoundDeps : {};
  try {
    const out = await planRound(body, c.world, c.hands, "eval:v8", { notes: [], habits: {} }, undefined, deps);
    const r = out.result;
    o.lane = out.lane;
    o.kind = r?.kind ?? "none";
    o.lang = (r?.lang as "en" | "ta" | undefined) ?? null;
    o.recipe = r?.stage?.recipe ?? null;
    const scope = r?.stage?.scope;
    const slots = (r?.stage?.slots ?? {}) as Record<string, unknown>;
    o.zones = [...new Set([zoneName(c.world, scope?.zone), ...((slots.zones as number[] | undefined) ?? []).map((n) => zoneName(c.world, n)), zoneName(c.world, slots.zone)].filter((x): x is string => !!x))];
    o.pages = (r?.steps ?? []).flatMap((st) => (st.a === "page" ? [st.page] : []));
    const nr = r?.stage?.blocks.find((b) => b.kind === "NewsReader");
    o.stories = nr?.kind === "NewsReader" ? nr.items.map((x) => x.title) : [];
    const cd = r?.stage?.blocks.find((b) => b.kind === "CaseDetail");
    o.caseId = cd?.kind === "CaseDetail" ? cd.incident.id : r?.stageOp?.op === "explain" || r?.stageOp?.op === "open" ? caseIdsOf(s.stage)[(r.stageOp.n ?? 1) - 1] ?? null : null;
    o.reply = r?.reply ?? r?.say ?? null;
    o.model = calls.filter(Boolean).at(-1) ?? null;
    if (out.lane === "no-model" || (noModel && o.kind === "none")) o.lane = "deferred";
    return { stage: r?.stage ?? null, say: r?.say ?? r?.reply ?? null };
  } catch (e) {
    o.error = (e as Error).message.slice(0, 200);
    return { stage: null, say: null };
  } finally { stop(); }
}

/** One request through the browser and the server; returns the outcome and the scene it leaves. */
async function turn(c: Ctx, text: string, s: Scene, it: Pick<Item8, "mic" | "engagedSec" | "heard" | "ui">, v: "v7" | "v8", noModel: boolean, gated: boolean): Promise<{ o: Outcome8; scene: Scene }> {
  const o = emptyOutcome();
  const t0 = Date.now();
  const now = Date.now();
  let said = text;
  if (gated && it.mic !== false) {
    const lastTurnAt = it.engagedSec == null ? null : now - it.engagedSec * 1000;
    const q = quickScreen(text, c.world);
    const u = q ? null : understand(text, s.state, c.world, { speechConf: 0.95 });
    const input = { text, lastTurnAt, now, rulesSure: !!q || (u?.kind === "do" && u.confidence >= 0.85), districtNoun: districtNounIn(text, c.world) };
    const g = addressed(input);
    if (!g.act) { o.silent = true; o.why = g.why; o.lane = "gate"; o.ms = Date.now() - t0; return { o, scene: s }; }
    said = g.text;
  }
  const heardLang: Lang = it.heard ?? (/[஀-௿]/.test(said) ? "ta" : "en");
  const listen: Lang = it.ui ?? "en";
  const cd = s.stage?.blocks.find((b) => b.kind === "CaseDetail");
  const ctx: BrowserCtx = { stage: s.stage ? { recipe: s.stage.recipe, blocks: s.stage.blocks, scope: { zone: s.stage.scope.zone } } : null, news: newsOn(c, s), state: s.state, world: c.world, listenLang: listen, heardLang, incident: cd?.kind === "CaseDetail" ? cd.incident.id : null, v7: true };
  const bl = v === "v8" ? browserLaneV8(said, { ...ctx, lastLang: s.lastLang ?? null, lastFound: s.lastFound ?? null }) : browserLaneV7(said, ctx);
  let scene: Scene = { ...s, lastTurnAt: now, lastLang: wordsLang(said, { isName: placeWord }) ?? s.lastLang ?? null };
  const remember = (did: string, doc: StageDocT | null, result: string | null) => {
    scene.turns = [...s.turns, { heard: said.slice(0, 300), did: did.slice(0, 300), ...(doc ? { recipe: doc.recipe } : {}), ...(result ? { result: result.slice(0, 200) } : {}) }].slice(-4) as Scene["turns"];
  };
  if (bl.lane === "server") {
    const r = await serverTurn(c, said, s, { lang: heardLang, source: "whisper" }, noModel, o);
    if (r.stage) scene = { ...scene, stage: r.stage };
    for (const p of o.pages) scene.state = { ...scene.state, page: p as ScreenState["page"] };
    remember(r.stage ? `showed a ${r.stage.recipe} screen` : o.kind === "do" ? "did it" : "answered", r.stage, r.say);
  } else {
    o.lane = bl.lane;
    o.lang = bl.lang;
    o.kind = "do";
    if (bl.lane === "news") {
      if (bl.na.kind === "read") {
        const id = "id" in bl.na.body ? bl.na.body.id : null;
        o.story = id ? await titleOf(id) : `incident ${(bl.na.body as { incident: string }).incident}`;
        o.storyId = id;
        const doc = newsScreen({ lang: bl.lang, kind: "read", outlet: null, en: ["(read)"], ta: ["(read)"], links: o.story ? [{ outlet: "", title: o.story, url: "https://example.invalid/x", publishedAt: null }] : [] });
        scene = { ...scene, stage: doc };
        remember("read the news report aloud", doc, null);
      } else if (bl.na.kind === "find") {
        // v8: the server's finder, on the same store; nothing found: the outlets' feeds (none in a dry run: no network)
        const f = await foundStory(bl.na.body.find, { world: c.world });
        o.lane = "news8";
        if (f?.pick) {
          o.story = (await titleOf(f.pick.id)) ?? f.pick.title; o.storyId = f.pick.id; o.stories = f.stories.map((x) => x.title);
          scene.lastFound = { id: f.pick.id, title: f.pick.title, other: f.other ? { id: f.other.id } : null };
          const doc = newsScreen({ lang: bl.lang, kind: "read", outlet: f.pick.outlet, en: ["(read)"], ta: ["(read)"], links: [{ outlet: f.pick.outlet ?? "", title: f.pick.title, url: "https://example.invalid/x", publishedAt: null }] });
          scene = { ...scene, stage: doc };
          remember("read the news report aloud", doc, null);
        } else if (f) {
          const said8 = await feedLines(bl.na.body.find, f.words, { world: c.world, ...(noModel ? { gap: { feeds: async () => [] } } : {}) });
          o.nothing = !said8.links.length; o.stories = said8.links.map((x) => x.title); o.reply = said8[bl.lang].join(" "); o.kind = "chat";
          remember("searched the news", null, o.reply);
        } else { o.kind = "none"; o.reply = "not found"; }
      } else if (bl.na.kind === "which") { o.kind = "chat"; o.reply = whichLine(bl.na, bl.lang); remember("asked which report", null, o.reply); }
      else { o.kind = "lookup"; o.lane = "lookup"; remember("looked it up on the web", null, null); }
    } else if (bl.lane === "stage") {
      o.kind = "stageOp";
      // the Stage's own reducer, as the console runs it: an open rebuilds the case screen
      const r = s.stage ? stageReducer({ ...stageEmpty, doc: s.stage }, bl.cmd) : null;
      const rebuild = r?.fx.find((x): x is Extract<typeof x, { fx: "rebuild" }> => x.fx === "rebuild");
      if (rebuild) {
        o.caseId = typeof rebuild.slots.id === "string" ? rebuild.slots.id : null;
        o.recipe = rebuild.recipe;
        const body = RoundBody.parse({ turnId: `o${Date.now().toString(36)}`, round: 0, text: said, state: s.state, turns: [], stage: null, stageDigest: null, direct: { recipe: rebuild.recipe, slots: rebuild.slots, lang: bl.lang }, heard: null });
        const out = await planRound(body, c.world, c.hands, "eval:v8", { notes: [], habits: {} }).catch(() => null);
        if (out?.result?.stage) scene = { ...scene, stage: out.result.stage };
      } else if (r) { const sayFx = r.fx.find((x) => x.fx === "say") as { en?: string; ta?: string } | undefined; o.reply = sayFx ? (bl.lang === "ta" ? sayFx.ta : sayFx.en) ?? null : null; }
      remember(`on the Stage: ${bl.cmd.op}`, scene.stage, null);
    } else if (bl.lane === "rules") {
      o.pages = bl.steps.flatMap((st) => (st.a === "page" ? [st.page] : []));
      for (const st of bl.steps) {
        if (st.a === "page") scene.state = { ...scene.state, page: st.page };
        if (st.a === "panel") scene.state = { ...scene.state, panel: st.panel as ScreenState["panel"] };
        const zn = (st as { zone?: unknown }).zone;
        if (typeof zn === "number") { scene.state = { ...scene.state, zone: zn }; const z = zoneName(c.world, zn); if (z) o.zones.push(z); }
      }
      remember("did it", null, null);
    } else remember(bl.lane, null, null);
  }
  o.ms = Date.now() - t0;
  return { o, scene };
}

async function sceneFor(c: Ctx, it: Item8, v: "v7" | "v8"): Promise<Scene> {
  let s: Scene = { stage: null, state: { ...STATE }, turns: [], lastTurnAt: null };
  if (it.screen === "newsPanel") s = { ...s, state: { ...s.state, panel: "news" } };
  else if (it.screen) {
    const q = quickScreen(it.screen, c.world, { noBail: true, analysis: true });
    if (!q) throw new Error(`screen not built: ${it.screen}`);
    const body = RoundBody.parse({ turnId: `s${Date.now().toString(36)}`, round: 0, text: it.screen, state: s.state, turns: [], stage: null, stageDigest: null, direct: { recipe: q.recipe, slots: q.slots, lang: "en" }, heard: null });
    const out = await planRound(body, c.world, c.hands, "eval:v8", { notes: [], habits: {} });
    if (!out.result?.stage) throw new Error(`screen not built: ${it.screen}`);
    s = { ...s, stage: out.result.stage, turns: [{ heard: it.screen, did: `showed a ${out.result.stage.recipe} screen`, recipe: out.result.stage.recipe } as Scene["turns"][number]] };
  }
  for (const b of it.before ?? []) {
    // an earlier request, named (the gate lets it through), with no model unless the run is live
    const r = await turn(c, b, s, { mic: false }, v, true, false);
    s = r.scene;
  }
  return s;
}

interface Row8 { id: string; kind: string; lang: string; v: string; ok: boolean; langOk: boolean | null; misses: string[]; deferred: boolean; o: Outcome8; at: string }

async function runOne(c: Ctx, it: Item8, v: "v7" | "v8", noModel: boolean): Promise<Row8> {
  clearCaches();
  let s: Scene;
  try { s = await sceneFor(c, it, v); } catch (e) { const o = emptyOutcome(); o.error = (e as Error).message; return { id: it.id, kind: it.kind, lang: it.lang, v, ok: false, langOk: null, misses: [`setup: ${o.error}`], deferred: false, o, at: new Date().toISOString() }; }
  const caseIds = caseIdsOf(s.stage);
  const cases = s.stage ? s.stage.blocks.flatMap((b) => (b.kind === "CaseList" ? b.rows.map((r) => ({ id: r.id, words: [r.title, r.place, r.zoneName, r.deptName].filter(Boolean).join(" ") })) : [])) : [];
  const storyIds = newsOn(c, s).items.map((x) => x.id);
  const { o } = await turn(c, it.text, s, { mic: it.mic, engagedSec: it.engagedSec === undefined ? 5 : it.engagedSec, heard: it.heard, ui: it.ui }, v, noModel, true);
  const sc = score8(it.gold, o, { caseIds, cases, storyIds });
  return { id: it.id, kind: it.kind, lang: it.lang, v, ok: sc.ok, langOk: sc.langOk, misses: sc.misses, deferred: o.lane === "deferred", o, at: new Date().toISOString() };
}

function report(rows: Row8[], label: string) {
  const t = tally8(rows);
  const def = rows.filter((r) => r.deferred).length;
  console.log(`\n[eval8] ${label}: ${t.all.ok}/${t.all.n} right${def ? `, ${def} left to the planner (dry)` : ""}; language ${t.all.langOk}/${t.all.langN}`);
  for (const [k, x] of Object.entries(t.byKind)) console.log(`  ${k.padEnd(10)} ${x.ok}/${x.n}`);
  for (const [k, x] of Object.entries(t.byLang)) console.log(`  lang ${k.padEnd(5)} ${x.ok}/${x.n}`);
}

function save(rows: Row8[], tag: string) {
  const out = path.join(DIR, "results", `${tag}-${V}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ set: SET, v: V, tag, at: new Date().toISOString(), model: process.env.JARVIS_LIVE_CLAUDE === "1" && claudeConfigured() ? claudeModel() : "groq-ladder", rows }, null, 1));
  return out;
}

it.runIf(MODE === "ref")("ref: the news the sets can name", async () => {
  const c = await context();
  const wk = await c.hands.news({ period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null });
  const out = path.resolve(process.cwd(), "eval", "v8", "ref");
  fs.mkdirSync(out, { recursive: true });
  const rows = (rs: Record<string, unknown>[]) => rs.map((x) => ({ title: x.title, outlets: x.outletNames, place: x.place ?? x.zoneName ?? null, t: x.t ?? null }));
  fs.writeFileSync(path.join(out, "news.json"), JSON.stringify({ daily: rows(c.panel.map((p) => ({ title: p.title, outletNames: p.source?.split(" · ") }))), weekly: rows(wk.rows as Record<string, unknown>[]).slice(0, 120),
    zones: c.world.zones.map((z) => ({ n: z.n, name: z.name, ta: (z as { ta?: string }).ta ?? null })), places: c.world.places.slice(0, 200).map((p) => p.name) }, null, 1));
  console.log(`[eval8] ref: ${c.panel.length} stories on today's panel, ${wk.rows.length} this week -> ${out}`);
  expect(c.panel.length).toBeGreaterThan(0);
}, 600_000);

it.runIf(MODE === "dry")("dry: the code lanes, no model", async () => {
  const c = await context();
  const rows: Row8[] = [];
  for (const it of items()) {
    const r = await runOne(c, it, V, true);
    rows.push(r);
    console.log(`${it.id.padEnd(12)} ${r.ok ? "ok  " : r.deferred ? "def " : "MISS"} ${r.o.lane.padEnd(10)} ${String(r.o.recipe ?? r.o.kind).padEnd(10)} ${r.o.lang ?? "--"} ${r.misses.join("; ").slice(0, 160)}`);
  }
  report(rows, `${SET} ${V} dry`);
  save(rows, TAG);
  expect(rows.length).toBeGreaterThan(0);
}, 3_600_000);

it.runIf(MODE === "run")("run: live, the planner ladder", async () => {
  const claude = process.env.JARVIS_LIVE_CLAUDE === "1" && claudeConfigured();
  console.log(`[eval8] ${SET} ${V} live; ${claude ? `Claude ${claudeModel()} leads (ceiling US$${process.env.JARVIS_CLAUDE_BUDGET_USD ?? 5})` : "Groq leads (Claude off)"}`);
  const c = await context();
  const rows: Row8[] = [];
  for (const it of items()) {
    const r = await runOne(c, it, V, false);
    rows.push(r);
    console.log(`${it.id.padEnd(12)} ${r.ok ? "ok  " : "MISS"} ${r.o.lane.padEnd(10)} ${String(r.o.recipe ?? r.o.kind).padEnd(10)} ${r.o.lang ?? "--"} ${(r.o.model ?? "").padEnd(18)} ${r.o.ms}ms ${r.misses.join("; ").slice(0, 140)}`);
    save(rows, TAG);
    if (r.o.model) await sleep(GAP);
  }
  report(rows, `${SET} ${V} live (${TAG})`);
  expect(rows.length).toBeGreaterThan(0);
}, 6 * 3_600_000);
