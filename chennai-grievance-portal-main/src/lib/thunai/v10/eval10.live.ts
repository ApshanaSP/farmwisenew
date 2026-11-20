/**
 * v10: the runner for v10's sets (docs/jarvis/JARVIS_V10.md Part 6). The same path the console takes: the addressee gate (when the open mic heard
 * it with no name), the browser's lanes, the server's round, on the console's own store (the dry-run copy, read only), with the screen and the
 * earlier turns each item names. It runs from either checkout: in v10's, the lanes are browser10.ts (with the day's lexicon); copied into v9's
 * checkout (`0a4b0245`, untracked), the same file finds no browser10.ts and runs v9's own lanes (browserLaneV8). Nothing else differs.
 *   EVAL10=dry SET=blind|replay TAG=<t>   no model at all: what the code lanes do; what is left to the planner is "deferred"
 *   EVAL10=run SET=... TAG=<t>             live (the planner ladder; JARVIS_LIVE_CLAUDE=1 lets Claude lead under the ceiling)
 *   ANSWER=1                               the news is read as the console reads it (the aide), for the brief's parts and its language
 * Results: eval/v10/<set>/results/<tag>-<v>.json (local: the rows hold headlines and what Jarvis said). The blind set's hash is checked first.
 *   EVAL10=dry SET=replay TAG=dry0 npx vitest run --config vitest.live.config.ts src/lib/thunai/v10/eval10.live.ts
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
import { incidentNewsDoc } from "../newsdoc";
import { claudeConfigured, claudeModel } from "@/lib/ai/claude";
import { serverHands } from "../data";
import { groqOnly } from "../liverecord";
import { onLlmCall } from "../llm";
import { whichLine } from "../newsask";
import { quickScreen, districtNounIn } from "../quick";
import { understand } from "../understand";
import { clearCaches, planRound, RoundBody, type RoundBodyT } from "../round";
import { stageContext, type StageDocT } from "../stage";
import { stageDigest, stageEmpty, stageReducer } from "../stagelocal";
import type { Lang, ScreenState, Step, World } from "../types";
import { serverWorld } from "../world";
import { addressed } from "../addressed";
import { labelsOf } from "../register";
import { browserLaneV8, type BrowserCtx, type LastFound } from "../v8/browser";
import { wordsLang, placeWord } from "../v8/lang8";
import { feedLines, foundStory } from "../v8/newsfind";
import { newsEvents, type NewsEvent, type StoredDoc } from "../web/serve";
import { newsAide } from "../aide7/news";
import { emptyOutcome } from "../v8/eval8";
import { checkSet10, score10, type Item10, type Outcome10 } from "./eval10";

groqOnly();
if (process.env.JARVIS_LIVE_CLAUDE !== "1") process.env.JARVIS_CLAUDE_OFF = "1";
const MODE = process.env.EVAL10 ?? "";
const SET = process.env.SET ?? "replay";
const TAG = process.env.TAG ?? "dry";
const GAP = Number(process.env.LIVE_GAP_MS ?? 20000);
const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
const ANSWER = process.env.ANSWER === "1";
const DIR = path.resolve(process.cwd(), "eval", "v10", SET);
const norm = (s: string) => s.replace(/\r\n/g, "\n");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** the browser's lanes of the checkout this runs in: v10's (browser10.ts and the day's lexicon), else v9's own */
type AnyLane = { lane: string; [k: string]: unknown };
interface Lanes { v: "v10" | "v9"; lane: (said: string, c: BrowserCtx & { lastLang?: Lang | null; lastFound?: LastFound | null; lex?: unknown; suggest?: string[] | null }) => AnyLane; lex: unknown; sem?: (q: string, items: never[]) => Promise<Map<string, number> | null> }
async function lanes(world: World): Promise<Lanes> {
  try {
    const b10 = (await import(/* @vite-ignore */ "./browser10" as string)) as { browserLaneV10: Lanes["lane"] };
    const lx = (await import(/* @vite-ignore */ "./lexserver" as string)) as { dayLexicon: (w: World) => Promise<unknown[]>; lexForBrowser: (l: unknown[]) => unknown[] };
    const lex = lx.lexForBrowser(await lx.dayLexicon(world));
    const s10 = (await import(/* @vite-ignore */ "./sem10" as string)) as { semScores: Lanes["sem"] };
    return { v: "v10", lane: b10.browserLaneV10, lex, sem: s10.semScores };
  } catch {
    return { v: "v9", lane: browserLaneV8 as unknown as Lanes["lane"], lex: null };
  }
}

function items(): Item10[] {
  const raw = norm(fs.readFileSync(path.join(DIR, "set.json"), "utf8"));
  if (SET === "blind") {
    const hashes = norm(fs.readFileSync(path.resolve(process.cwd(), "eval", "v10", "HASHES.txt"), "utf8"));
    const want = hashes.split("\n").map((l) => /^([0-9a-f]{64}) \*eval\/v10\/([a-z0-9]+)\/set\.json$/.exec(l.trim())).find((m) => m?.[2] === SET)?.[1];
    const got = createHash("sha256").update(raw).digest("hex");
    if (want !== got) throw new Error(`the ${SET} set changed since it was hashed, or was never hashed (${got} != ${want})`);
  }
  const all = (JSON.parse(raw) as { items: Item10[] }).items;
  const bad = checkSet10(all);
  if (bad.length) throw new Error(`set problems: ${bad.slice(0, 5).join("; ")}`);
  return ONLY.length ? all.filter((x) => ONLY.includes(x.id)) : all;
}

const STATE: ScreenState = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false } as unknown as ScreenState;
type NewsRow = { id: string; source: string | null; title: string };
interface Ctx { world: World; hands: ReturnType<typeof serverHands>; panel: NewsRow[]; lanes: Lanes }

async function context(): Promise<Ctx> {
  const world = await serverWorld();
  const hands = serverHands({ email: "eval:v10", role: "collector", lockDept: null });
  const r = await hands.news({ period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null });
  const panel = r.rows.map((x) => ({ id: String(((x.docIds as string[] | undefined) ?? [])[0] ?? x.id), source: ((x.outletNames as string[] | undefined) ?? []).join(" · ") || null, title: String(x.title ?? "") }));
  return { world, hands, panel, lanes: await lanes(world) };
}

interface Scene { stage: StageDocT | null; state: ScreenState; turns: NonNullable<RoundBodyT["turns"]>; lastLang?: Lang | null; lastFound?: LastFound | null; askMap?: string | null; cut?: { text: string; at: number } | null;
  /** v10: the news brief's offer, kept for the next turn as Thunai.tsx keeps it (newsOffer: one pending offer, forgotten on any other turn) */
  offer?: Record<string, unknown> | null }

const titleOf = async (id: string): Promise<string | null> => {
  const d = (await newsDoc(id).catch(() => null)) as { title?: string | null; title_en?: string | null } | null;
  return d ? [d.title, d.title_en].filter(Boolean).join(" | ") : null;
};
const zoneName = (w: World, n: unknown): string | null => (typeof n === "number" ? w.zones.find((z) => z.n === n)?.name ?? null : null);
const caseIdsOf = (d: StageDocT | null): string[] => (d ? d.blocks.flatMap((b) => (b.kind === "CaseList" ? b.rows.map((r) => r.id) : [])) : []);

const newsOn = (c: Ctx, s: Scene) => {
  if ((!s.stage || s.stage.slots?.web) && s.state.panel === "news") return { items: c.panel.map((x) => ({ id: x.id, source: x.source, title: x.title })), incident: null, reading: null };
  const nr = s.stage?.blocks.find((b) => b.kind === "NewsReader");
  const cd = s.stage?.blocks.find((b) => b.kind === "CaseDetail");
  return { items: nr?.kind === "NewsReader" && !s.stage?.slots?.web ? nr.items.map((x) => ({ id: x.id, source: x.source, title: x.title })) : [], incident: cd?.kind === "CaseDetail" ? cd.incident.id : null, reading: null };
};

/**
 * A console step's dashboard control (the inventory's ids, docs/jarvis/v10-research and the coverage test): the same table for v9 and v10, so
 * either version's steps are scored alike. A step with no control of its own (a read, a stop) names none.
 */
export function controlsOfStep(st: Step): string[] {
  switch (st.a) {
    case "page": return [`nav.page.${st.page}`];
    case "panel": return [`panel.${st.panel}`];
    case "theme": return ["menu.theme"];
    case "lang": return ["topbar.lang"];
    case "period": return [`filter.period.${st.period}`];
    case "mapMode": return [`map.mode.${st.mode}`];
    case "layer": return [`map.layer.${st.layer}`];
    case "view": return Object.keys(st.view).map((k) => `filter.${k}`);
    case "close": return ["window.close"];
    case "numbers": return ["jarvis.numbers"];
    case "workspace": return [`panel.workspace.${st.op}`];
    default: return [];
  }
}
/** a v9 step that is Ask the Map's: its question (v9 reached the map only by asking it) */
const mapOpsOfSteps = (steps: Step[]): NonNullable<Outcome10["mapOps"]> => steps.flatMap((st): NonNullable<Outcome10["mapOps"]> => (st.a === "map" ? [{ op: "ask", question: st.q }] : st.a === "layer" ? [{ op: "layer", layer: st.layer }] : []));

async function serverTurn(c: Ctx, text: string, s: Scene, heard: { lang: Lang; source: "whisper" | "typed" }, noModel: boolean, o: Outcome10): Promise<{ stage: StageDocT | null; say: string | null }> {
  const calls: (string | null)[] = [];
  const stop = onLlmCall((e) => calls.push(e.model));
  const stageCtx = s.stage ? { ...stageContext(s.stage, null), blocks: s.stage.blocks.map((b) => ({ kind: b.kind, ids: (stageContext(s.stage!, null).blocks.find((x) => x.kind === b.kind)?.ids ?? []), labels: labelsOf(b).slice(0, 30) })) } : null;
  const digest = s.stage ? stageDigest({ ...stageEmpty, doc: s.stage }) : null;
  const body = RoundBody.parse({ turnId: `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, round: 0, text, state: s.state, turns: s.turns, stage: stageCtx, stageDigest: digest, direct: null, heard: { lang: heard.lang, conf: 0.95, source: heard.source } });
  const deps = noModel ? { aide: { open: async () => { throw new Error("dry: no model"); }, rungs: () => [] }, llm: { generate: (async () => { throw new Error("dry: no model"); }) as never } } as never : {};
  try {
    const out = await planRound(body, c.world, c.hands, "eval:v10", { notes: [], habits: {} }, undefined, deps);
    const r = out.result;
    o.lane = out.lane;
    o.kind = r?.kind ?? "none";
    o.lang = (r?.lang as "en" | "ta" | undefined) ?? null;
    o.recipe = r?.stage?.recipe ?? null;
    const scope = r?.stage?.scope;
    const slots = (r?.stage?.slots ?? {}) as Record<string, unknown>;
    o.zones = [...new Set([zoneName(c.world, scope?.zone), ...((slots.zones as number[] | undefined) ?? []).map((n) => zoneName(c.world, n)), zoneName(c.world, slots.zone)].filter((x): x is string => !!x))];
    const steps = (r?.steps ?? []) as Step[];
    o.pages = steps.flatMap((st) => (st.a === "page" ? [st.page] : []));
    o.controls = [...(o.controls ?? []), ...steps.flatMap(controlsOfStep)];
    o.mapOps = [...(o.mapOps ?? []), ...mapOpsOfSteps(steps)];
    o.drafted = o.drafted || steps.some((st) => st.a === "draft");
    o.sent = o.sent || steps.some((st) => st.a === "send");
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

/** the news read as the console reads it (ANSWER=1): the lines said; the brief's parts found in them; the language they are in */
async function readAloud(c: Ctx, body: { id: string } | { incident: string } | { ground: { id: string; lang: Lang; q: string } }, q: string, lang: Lang, extra: Record<string, unknown> = {}): Promise<{ lines: string[]; full: boolean; offer: Record<string, unknown> | null }> {
  const aide = newsAide(c.world, { user: "eval:v10" });
  // v10 (the finals, 20 Nov): the brief and the weather readings as the console's news route builds them (news/route.ts brief10, weather); the
  // first blind run passed only v7's aide, so "read" was v7's recital there, not v10's brief. In v9's checkout there is no brief10: as before.
  const v10 = await (async (): Promise<Record<string, unknown>> => {
    try {
      const [{ newsBrief10 }, { weatherLines }, { understandV10 }] = await Promise.all([import("./brief10"), import("./weather10"), import("./flag10")]);
      if (!understandV10()) return {};
      const tool = (n: string, a: Record<string, unknown>) => c.hands.tool(n, a);
      return { brief10: newsBrief10({ world: c.world, user: "eval:v10", tool, weather: () => weatherLines(tool) }), weather: () => weatherLines(tool) };
    } catch { return {}; }
  })();
  const ev: NewsEvent[] = [];
  try { for await (const e of newsEvents(("ground" in body ? body : { ...body, ask: { q: q.slice(0, 400), lang }, ...extra }) as never, { loadDoc: (id: string) => newsDoc(id) as Promise<StoredDoc | null>, incidentDoc: incidentNewsDoc, related: false, user: "eval:v10", aide, ...v10 } as never)) ev.push(e); } catch { /* nothing read */ }
  const last = ev.filter((e): e is Extract<NewsEvent, { type: "brief" }> => e.type === "brief").at(-1)?.brief;
  const first = ev.find((e): e is Extract<NewsEvent, { type: "first" }> => e.type === "first");
  // (the weather readings, and v10's news to ground truth: what the console has on the story)
  const more = ev.filter((e) => ["weather", "ground"].includes((e as { type: string }).type)).flatMap((e) => ((e as unknown as Record<Lang, string[]>)[lang] ?? []));
  const lines = [...(first ? [first[lang]] : []), ...(last ? last[lang] : []), ...more].filter(Boolean);
  const offer = (ev.filter((e) => (e as { type: string }).type === "offer").at(-1) ?? null) as Record<string, unknown> | null;
  return { lines, full: ev.some((e) => (e as { type: string; full?: boolean }).type === "brief" && (e as { full?: boolean }).full === true), offer };
}
/** the brief's parts, read off what was said: where (a place of the district or the story's own), what the console knows (its records'
 * words with a figure), an offered next step */
function briefParts(lines: string[], placeWords: (w: string) => boolean): string[] {
  const t = lines.join(" ");
  const out: string[] = [];
  if (t.split(/[^\p{L}]+/u).some((w) => w.length >= 4 && placeWords(w))) out.push("place");
  if (/\b(?:complaints?|cases?|petitions?|gauges?|mm\b|department|officer|the console|our records|open)\b|புகார்|மனு|மழைமானி|துறை/iu.test(t) && /\d/.test(t)) out.push("console");
  if (/\b(?:shall i|should i|want me to|do you want|i can (?:show|draft|follow)|say ['"]?(?:follow|show|draft))\b|வேண்டுமா|காட்டட்டுமா|வரைவு/iu.test(t)) out.push("next");
  return out;
}

/** One request through the gate, the browser's lanes and the server; returns the outcome and the scene it leaves. */
async function turn(c: Ctx, text: string, s: Scene, it: Pick<Item10, "mic" | "engagedSec" | "heard" | "ui">, noModel: boolean, gated: boolean): Promise<{ o: Outcome10; scene: Scene }> {
  const o: Outcome10 = emptyOutcome();
  const t0 = Date.now();
  const now = Date.now();
  let said = text;
  if (gated && it.mic !== false) {
    const lastTurnAt = it.engagedSec == null ? null : now - it.engagedSec * 1000;
    const q = quickScreen(text, c.world);
    const u = q ? null : understand(text, s.state, c.world, { speechConf: 0.95 });
    const g = addressed({ text, lastTurnAt, now, rulesSure: !!q || (u?.kind === "do" && u.confidence >= 0.85), districtNoun: districtNounIn(text, c.world) });
    if (!g.act) { o.silent = true; o.why = g.why; o.lane = "gate"; o.ms = Date.now() - t0; return { o, scene: s }; }
    said = g.text;
  }
  const heardLang: Lang = it.heard ?? (/[஀-௿]/.test(said) ? "ta" : "en");
  const listen: Lang = it.ui ?? "en";
  // v10: a reply to the news brief's offer (offer10.ts), taken before the lanes as Thunai.tsx handle() takes it: "read it fully", "what do we
  // have on this?", "show them on the map", "draft a note", "follow it", "no" (the finals, 20 Nov: the runner had no offers, so these were the
  // lanes' there and not the console's). In v9's checkout there is no offer10: nothing changes.
  const pending = s.offer ?? null;
  s = { ...s, offer: null };
  if (pending) {
    const m = await import("./offer10").catch(() => null);
    const off = m ? m.offerOf(pending, ((pending as { lang?: Lang }).lang ?? heardLang), now - 1000) : null;
    const oa = m && off ? m.offerAct(said, off, now, c.world) : null;
    if (oa && off) {
      const lg: Lang = /[஀-௿]/.test(said) ? "ta" : off.lang;
      o.lane = "offer"; o.lang = lg; o.kind = "do";
      const turns = (did: string) => [...s.turns, { heard: said.slice(0, 300), did }].slice(-4) as Scene["turns"];
      if (oa.act === "full") {
        o.story = await titleOf(oa.id); o.storyId = oa.id;
        if (ANSWER) { const r = await readAloud(c, { id: oa.id }, said, lg, { full: true }); o.spoken = r.lines; o.full = r.full; o.readLang = r.lines.join(" ") ? (wordsLang(r.lines.join(" "), {}) ?? null) : null; } else o.full = true;
      } else if (oa.act === "ground") {
        o.recipe = "cases";
        if (ANSWER) { const r = await readAloud(c, { ground: { id: oa.id, lang: lg, q: said.slice(0, 400) } }, said, lg); o.spoken = r.lines; o.briefHas = briefParts(r.lines, placeWord); }
      } else if (oa.act === "map") o.mapOps = [{ op: "ask", question: oa.q }];
      else if (oa.act === "draft") o.drafted = true;
      else if (oa.act !== "follow") o.kind = "chat";
      o.ms = Date.now() - t0;
      return { o, scene: { ...s, turns: turns(`the brief's offer: ${oa.act}`) } };
    }
  }
  const cd = s.stage?.blocks.find((b) => b.kind === "CaseDetail");
  const ctx = { stage: s.stage ? { recipe: s.stage.recipe, blocks: s.stage.blocks, scope: { zone: s.stage.scope.zone }, slots: (s.stage.slots ?? null) as Record<string, unknown> | null } : null, news: newsOn(c, s), state: s.state, world: c.world,
    listenLang: listen, heardLang, incident: cd?.kind === "CaseDetail" ? cd.incident.id : null, v7: true, lastLang: s.lastLang ?? null, lastFound: s.lastFound ?? null, lex: c.lanes.lex, askMap: s.askMap ? { open: true, hasAnswer: true, kind: "answer", question: s.askMap } : null } as Parameters<Lanes["lane"]>[1];
  let bl = c.lanes.lane(said, ctx);
  // a soft find that finds nothing close goes on to the lane behind it, as the console does (v9)
  if (bl.lane === "news" && (bl as unknown as { soft?: AnyLane }).soft && (bl as unknown as { na: { kind: string } }).na.kind === "find") {
    const f = await foundStory((bl as unknown as { na: { body: { find: Parameters<typeof foundStory>[0] } } }).na.body.find, { world: c.world, sem: c.lanes.sem as never }).catch(() => null);
    if (!f?.pick) bl = (bl as unknown as { soft: AnyLane }).soft;
  }
  let scene: Scene = { ...s, lastLang: wordsLang(said, { isName: placeWord }) ?? s.lastLang ?? null };
  const remember = (did: string, doc: StageDocT | null, result: string | null) => {
    scene.turns = [...s.turns, { heard: said.slice(0, 300), did: did.slice(0, 300), ...(doc ? { recipe: doc.recipe } : {}), ...(result ? { result: result.slice(0, 200) } : {}) }].slice(-4) as Scene["turns"];
  };
  const lang = (bl as { lang?: Lang }).lang ?? heardLang;
  o.lane = bl.lane;
  if (bl.lane === "server") {
    const r = await serverTurn(c, said, s, { lang: heardLang, source: "whisper" }, noModel, o);
    if (r.stage) scene = { ...scene, stage: r.stage };
    for (const p of o.pages) scene.state = { ...scene.state, page: p as ScreenState["page"] };
    remember(r.stage ? `showed a ${r.stage.recipe} screen` : o.kind === "do" ? "did it" : "answered", r.stage, r.say);
  } else if (bl.lane === "wait") {
    // v10: a cut-off line or a lone unclear word: nothing said; the next sentence is joined to it
    o.silent = true; o.why = `wait:${(bl as { why?: string }).why ?? ""}`;
    scene.cut = { text: said, at: Date.now() };
  } else if (bl.lane === "confirm") {
    const b = bl as unknown as { ask: { en: string; ta: string }; then: string };
    o.kind = "clarify"; o.lang = lang; o.confirm = lang === "ta" ? b.ask.ta : b.ask.en; o.reply = o.confirm;
    remember("asked back", null, o.reply);
  } else if (bl.lane === "map") {
    const m = (bl as unknown as { cmd: NonNullable<Outcome10["mapOps"]>[number] & { send?: boolean } }).cmd;
    o.kind = "do"; o.lang = lang; o.mapOps = [m]; o.drafted = m.op === "send";
    remember(`Ask the Map: ${m.op}`, null, null);
  } else if (bl.lane === "control") {
    const b = bl as unknown as { id: string; steps?: Step[] };
    o.kind = "do"; o.lang = lang; o.controls = [b.id, ...(b.steps ?? []).flatMap(controlsOfStep)];
    for (const st of b.steps ?? []) { if (st.a === "page") { scene.state = { ...scene.state, page: st.page }; o.pages.push(st.page); } if (st.a === "panel") scene.state = { ...scene.state, panel: st.panel as ScreenState["panel"] }; }
    remember(`control ${b.id}`, null, null);
  } else {
    o.lang = lang; o.kind = "do";
    if (bl.lane === "news") {
      const na = (bl as unknown as { na: { kind: string; body: Record<string, unknown> } }).na;
      if (na.kind === "read") {
        const body = na.body as { id: string } | { incident: string };
        const id = "id" in body ? body.id : null;
        o.story = id ? await titleOf(id) : `incident ${(body as { incident: string }).incident}`; o.storyId = id;
        if (ANSWER) { const r = await readAloud(c, body, said, lang, { ...((na as { full?: boolean }).full || na.body.full ? { full: true } : {}) }); scene.offer = r.offer ? { ...r.offer, lang } : null; o.spoken = r.lines; o.full = r.full; o.briefHas = briefParts(r.lines, placeWord); o.readLang = r.lines.join(" ") ? (wordsLang(r.lines.join(" "), {}) ?? null) : null; }
        else if ((na as { full?: boolean }).full || na.body.full) o.full = true;
        remember("read the news report aloud", null, null);
      } else if (na.kind === "find") {
        const find = (na.body as { find: Parameters<typeof foundStory>[0] & { weather?: boolean } }).find;
        o.weather = !!find.weather;
        const f = await foundStory(find, { world: c.world, sem: c.lanes.sem as never });
        o.lane = "news-find";
        if (f?.pick) {
          o.story = (await titleOf(f.pick.id)) ?? f.pick.title; o.storyId = f.pick.id; o.stories = f.stories.map((x) => x.title);
          scene.lastFound = { id: f.pick.id, title: f.pick.title, q: find.q, other: f.other ? { id: f.other.id } : null };
          if (ANSWER) { const r = await readAloud(c, { id: f.pick.id }, said, lang); scene.offer = r.offer ? { ...r.offer, lang } : null; o.spoken = r.lines; o.briefHas = briefParts(r.lines, placeWord); o.readLang = r.lines.join(" ") ? (wordsLang(r.lines.join(" "), {}) ?? null) : null; }
          remember("read the news report aloud", null, null);
        } else if (f) {
          const said8 = await feedLines(find, f.words, { world: c.world, ...(noModel ? { gap: { feeds: async () => [] } } : {}) });
          o.nothing = !said8.links.length; o.stories = said8.links.map((x) => x.title); o.reply = said8[lang].join(" "); o.kind = "chat";
          remember("searched the news", null, o.reply);
        } else { o.kind = "none"; o.reply = "not found"; }
      } else if (na.kind === "which") { o.kind = "chat"; o.reply = whichLine(na as never, lang); remember("asked which report", null, o.reply); }
      else { o.kind = "lookup"; o.lane = "lookup"; remember("looked it up on the web", null, null); }
    } else if (bl.lane === "stage") {
      o.kind = "stageOp";
      const cmd = (bl as unknown as { cmd: Parameters<typeof stageReducer>[1] }).cmd;
      const r = s.stage ? stageReducer({ ...stageEmpty, doc: s.stage }, cmd) : null;
      const rebuild = r?.fx.find((x): x is Extract<typeof x, { fx: "rebuild" }> => x.fx === "rebuild");
      if (rebuild) {
        o.caseId = typeof rebuild.slots.id === "string" ? rebuild.slots.id : null;
        o.recipe = rebuild.recipe;
        const body = RoundBody.parse({ turnId: `o${Date.now().toString(36)}`, round: 0, text: said, state: s.state, turns: [], stage: null, stageDigest: null, direct: { recipe: rebuild.recipe, slots: rebuild.slots, lang }, heard: null });
        const out = await planRound(body, c.world, c.hands, "eval:v10", { notes: [], habits: {} }).catch(() => null);
        if (out?.result?.stage) scene = { ...scene, stage: out.result.stage };
      } else if (r) { const sayFx = r.fx.find((x) => x.fx === "say") as { en?: string; ta?: string } | undefined; o.reply = sayFx ? (lang === "ta" ? sayFx.ta : sayFx.en) ?? null : null; }
      // a story on Jarvis's news list read by its position (the Stage's own "read the first one")
      remember(`on the Stage: ${(cmd as { op: string }).op}`, scene.stage, null);
    } else if (bl.lane === "rules") {
      const steps = ((bl as unknown as { steps: Step[] }).steps ?? []);
      o.pages = steps.flatMap((st) => (st.a === "page" ? [st.page] : []));
      o.controls = steps.flatMap(controlsOfStep);
      o.mapOps = mapOpsOfSteps(steps);
      for (const st of steps) {
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

async function sceneFor(c: Ctx, it: Item10): Promise<Scene> {
  let s: Scene = { stage: null, state: { ...STATE }, turns: [] };
  const sc = it.screen ?? null;
  if (sc === "newsPanel") s = { ...s, state: { ...s.state, panel: "news" } };
  else if (sc?.startsWith("page:")) s = { ...s, state: { ...s.state, page: sc.slice(5) as ScreenState["page"] } };
  else if (sc?.startsWith("askMap:")) s = { ...s, askMap: sc.slice(7), state: { ...s.state, page: "overview" } };
  else if (sc?.startsWith("stage:")) {
    const sentence = sc.slice(6);
    const q = quickScreen(sentence, c.world, { noBail: true, analysis: true });
    if (!q) throw new Error(`screen not built: ${sentence}`);
    const body = RoundBody.parse({ turnId: `s${Date.now().toString(36)}`, round: 0, text: sentence, state: s.state, turns: [], stage: null, stageDigest: null, direct: { recipe: q.recipe, slots: q.slots, lang: "en" }, heard: null });
    const out = await planRound(body, c.world, c.hands, "eval:v10", { notes: [], habits: {} });
    if (!out.result?.stage) throw new Error(`screen not built: ${sentence}`);
    s = { ...s, stage: out.result.stage, turns: [{ heard: sentence, did: `showed a ${out.result.stage.recipe} screen`, recipe: out.result.stage.recipe } as Scene["turns"][number]] };
  }
  for (const b of it.before ?? []) { const r = await turn(c, b, s, { mic: false }, true, false); s = r.scene; }
  return s;
}

interface Row10 { id: string; kind: string; lang: string; v: string; ok: boolean; langOk: boolean | null; misses: string[]; deferred: boolean; o: Outcome10; at: string }

async function runOne(c: Ctx, it: Item10, noModel: boolean): Promise<Row10> {
  clearCaches();
  let s: Scene;
  try { s = await sceneFor(c, it); } catch (e) { const o: Outcome10 = emptyOutcome(); o.error = (e as Error).message; return { id: it.id, kind: it.kind, lang: it.lang, v: c.lanes.v, ok: false, langOk: null, misses: [`setup: ${o.error}`], deferred: false, o, at: new Date().toISOString() }; }
  const caseIds = caseIdsOf(s.stage);
  const cases = s.stage ? s.stage.blocks.flatMap((b) => (b.kind === "CaseList" ? b.rows.map((r) => ({ id: r.id, words: [r.title, r.place, r.zoneName, r.deptName].filter(Boolean).join(" ") })) : [])) : [];
  const storyIds = newsOn(c, s).items.map((x) => x.id);
  const { o } = await turn(c, it.text, s, { mic: it.mic, engagedSec: it.engagedSec === undefined ? 5 : it.engagedSec, heard: it.heard, ui: it.ui }, noModel, true);
  const sc = score10(it.gold, o, { caseIds, cases, storyIds });
  return { id: it.id, kind: it.kind, lang: it.lang, v: c.lanes.v, ok: sc.ok, langOk: sc.langOk, misses: sc.misses, deferred: o.lane === "deferred", o, at: new Date().toISOString() };
}

function report(rows: Row10[], label: string) {
  const by = (k: "kind" | "lang") => Object.fromEntries([...new Set(rows.map((r) => r[k]))].sort().map((v) => [v, `${rows.filter((r) => r[k] === v && r.ok).length}/${rows.filter((r) => r[k] === v).length}`]));
  const def = rows.filter((r) => r.deferred).length;
  console.log(`\n[eval10] ${label}: ${rows.filter((r) => r.ok).length}/${rows.length} right${def ? `, ${def} left to the planner (dry)` : ""}`);
  for (const [k, x] of Object.entries(by("kind"))) console.log(`  ${k.padEnd(10)} ${x}`);
  for (const [k, x] of Object.entries(by("lang"))) console.log(`  lang ${k.padEnd(5)} ${x}`);
}
function save(rows: Row10[], v: string) {
  const out = path.join(DIR, "results", `${TAG}-${v}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ set: SET, v, tag: TAG, at: new Date().toISOString(), model: process.env.JARVIS_LIVE_CLAUDE === "1" && claudeConfigured() ? claudeModel() : "groq-ladder", rows }, null, 1));
  return out;
}

it.runIf(MODE === "dry")("dry: the code lanes, no model", async () => {
  const c = await context();
  const rows: Row10[] = [];
  for (const it of items()) {
    const r = await runOne(c, it, true);
    rows.push(r);
    console.log(`${it.id.padEnd(16)} ${r.ok ? "ok  " : r.deferred ? "def " : "MISS"} ${r.o.lane.padEnd(10)} ${String(r.o.recipe ?? r.o.kind).padEnd(10)} ${r.o.lang ?? "--"} ${r.misses.join("; ").slice(0, 160)}`);
  }
  report(rows, `${SET} ${c.lanes.v} dry`);
  save(rows, c.lanes.v);
  expect(rows.length).toBeGreaterThan(0);
}, 3_600_000);

it.runIf(MODE === "run")("run: live, the planner ladder", async () => {
  const claude = process.env.JARVIS_LIVE_CLAUDE === "1" && claudeConfigured();
  const c = await context();
  console.log(`[eval10] ${SET} ${c.lanes.v} live; ${claude ? `Claude ${claudeModel()} leads (ceiling US$${process.env.JARVIS_CLAUDE_BUDGET_USD ?? 5})` : "Groq leads (Claude off)"}`);
  const rows: Row10[] = [];
  for (const it of items()) {
    const r = await runOne(c, it, false);
    rows.push(r);
    console.log(`${it.id.padEnd(16)} ${r.ok ? "ok  " : "MISS"} ${r.o.lane.padEnd(10)} ${String(r.o.recipe ?? r.o.kind).padEnd(10)} ${r.o.lang ?? "--"} ${(r.o.model ?? "").padEnd(18)} ${r.o.ms}ms ${r.misses.join("; ").slice(0, 140)}`);
    save(rows, c.lanes.v);
    if (r.o.model) await sleep(GAP);
  }
  report(rows, `${SET} ${c.lanes.v} live (${TAG})`);
  expect(rows.length).toBeGreaterThan(0);
}, 6 * 3_600_000);
