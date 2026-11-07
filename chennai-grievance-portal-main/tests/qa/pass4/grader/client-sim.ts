// QA pass 4: what the browser does with one sentence, written out so a test can do it with no browser (components/collector/app/thunai/Thunai.tsx, handle(),
// callAgent(), showStage(), run(), applyLocal()), and what the round route does with a body (app/api/collector/thunai/agent/round/route.ts). The planning code
// is the real one (planRound with serverWorld and serverHands on the real store): nothing here decides an answer. Only the things a browser does around the
// rounds are copied: the order of the lanes it tries, the state it sends, the digest, the turn memory, the fall back to its own rules when no model answers.
// Line references are to Thunai.tsx unless said otherwise.
import { exportMeta } from "@/lib/collector/intel";
import type { AgentResult, StageOp } from "@/lib/thunai/agent";
import { spokenPart } from "@/lib/thunai/chunker";
import { serverHands } from "@/lib/thunai/data";
import { isNavCommand, isPlainMove, isReflex } from "@/lib/thunai/plan";
import { quickScreen } from "@/lib/thunai/quick";
import { cannotLine, NO_MODEL_LINE } from "@/lib/thunai/reach";
import { planRisk, tapRisk } from "@/lib/thunai/risk";
import { planRound, RoundBody, type RoundDeps, type RoundOut } from "@/lib/thunai/round";
import { say as line } from "@/lib/thunai/say";
import { stageContext, type StageDocT } from "@/lib/thunai/stage";
import { localStageCommand, narrationOf, stageDigest, stageReducer, type LocalCmd, type StageEffect, type StageModel } from "@/lib/thunai/stagelocal";
import { readMemory } from "@/lib/thunai/store";
import type { Lang, ScreenState, Step, Understood, World } from "@/lib/thunai/types";
import { describe as describeStep, understand } from "@/lib/thunai/understand";
import { serverWorld } from "@/lib/thunai/world";
import { confirmLine } from "@/lib/thunai/say";

const USER = { email: "qa.grader@example.test", id: 900_001 };
const figureFree = (t?: string | null) => (t && !/[\d௦-௯]/.test(t) ? t : undefined);

export interface RoundLog { round: number; status: number; done: boolean; lane: string | null; note: string | null; kind: string | null; tokens: number; calls: number; hops: string[]; trace: string[]; model: string | null; ms: number }

/** Everything one sentence did, as the browser would show and say it. */
export interface Outcome {
  /** what the browser did, in order: "stage-local", "rules-reflex", "rules-nav", "agent", "rules-fallback" */
  path: string[];
  /** the round's lane; for what never reached a round, the browser's own */
  lane: string;
  kind: "do" | "chat" | "refuse" | "clarify" | "none";
  note: string | null;
  lang: Lang;
  /** the line it says, whole (the voice speaks its first sentences; all of it is on the card) */
  said: string;
  /** what the voice speaks of that line (chunker.ts spokenPart) */
  voice: string | null;
  /** read aloud after the line: the items of a brief or a news reader, or what "read them" reads */
  items: string[];
  options: { label: string; request: string }[];
  /** the screen this sentence opened or changed, or null */
  stage: StageDocT | null;
  /** console steps it ran */
  steps: Step[];
  stageOp: StageOp | null;
  /** incident ids put into the approval tray */
  drafted: string[];
  rounds: RoundLog[];
  server: AgentResult | null;
  /** the rules' reading, when the browser fell back on them */
  rules: string | null;
  /** the route answered with an error, or threw */
  error: string | null;
  ms: number;
}

const NAVIGATES = new Set(["page", "period", "view", "clearFilters", "mapMode", "layer", "panel", "item", "zoom", "map", "workspace", "theme", "close"]);
const ACTS_ON_PAGE = new Set(["page", "period", "view", "mapMode", "layer", "panel", "item", "draft", "zoom", "map", "workspace", "theme", "read"]);

export interface Card { question: string; lang: Lang; heard: string; choices: { label: string; en: string; request?: string; steps?: Step[] }[] }

/** A collector's browser tab: one conversation. */
export class ClientSim {
  page: ScreenState["page"] = "overview"; period: ScreenState["period"] = "daily"; zone: number | null = null; dept: string | null = null; cat: string | null = null; taluk: string | null = null;
  sevTab: ScreenState["sev"] = null; mapMode: ScreenState["mapMode"] = "zones"; panel: string | null = null; incident: string | null = null; list: string[]; lastPlace: string | null = null;
  turns: { heard: string; did: string }[] = [];
  lastRequest: { text: string; lang: Lang } | null = null;
  doc: StageDocT | null = null; back: StageDocT[] = []; views: Record<string, string> = {}; filter: string | null = null; narr = 0; focus: number | null = null;
  askOnce: Card | null = null;
  pendingB: { steps: Step[]; heard: string; lang: Lang; act?: () => void } | null = null;
  tray: string[] = [];
  private cur!: Outcome;

  constructor(private world: World, private deps: RoundDeps = {}, list: string[] = []) { this.list = list; }

  private state(): ScreenState {
    return { page: this.page, period: this.period, zone: this.zone, dept: this.dept, cat: this.cat, taluk: this.taluk, sev: this.sevTab, mapMode: this.mapMode, panel: this.panel, incident: this.incident,
      list: this.list, lastFilter: null, lastPlace: this.lastPlace, numbers: false, now: Date.now() } as unknown as ScreenState;
  }
  private model(): StageModel { return { doc: this.doc, back: this.back, views: this.views, filter: this.filter, narr: this.narr }; }
  private commit(m: StageModel) { this.doc = m.doc; this.back = m.back; this.views = m.views; this.filter = m.filter; this.narr = m.narr; }
  private remember(heard: string, did: string) { this.turns = [...this.turns, { heard: heard.slice(0, 300), did: did.slice(0, 300) }].slice(-4); }
  private closeStage() { this.doc = null; this.back = []; this.views = {}; this.filter = null; }

  /** the route: its body check, the real planRound, its error answers (route.ts lines 24 to 35) */
  private async route(body: unknown): Promise<{ status: number; json: RoundOut | { done: true; result: { kind: "none"; note?: string } | null; why: string } }> {
    const parsed = RoundBody.safeParse(JSON.parse(JSON.stringify(body)));
    if (!parsed.success) return { status: 400, json: { done: true, result: { kind: "none" }, why: `bad request: ${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}` } };
    const mem = readMemory(USER.id);
    try {
      const out = await planRound(parsed.data, await serverWorld(), serverHands({ email: USER.email, role: "collector", lockDept: null }), `collector:${USER.id}`,
        { notes: mem.notes.map((n) => n.text), habits: mem.habits }, undefined, { dataVersion: () => exportMeta().then((m) => m.build_id ?? m.exported_at ?? ""), ...this.deps });
      return { status: 200, json: JSON.parse(JSON.stringify(out)) as RoundOut };
    } catch (e) {
      return { status: 500, json: { done: true, result: { kind: "none", note: "failed" }, why: `failed: ${(e as Error).message}\n${String((e as Error).stack ?? "").slice(0, 600)}` } };
    }
  }

  /** callAgent, lines 823 to 859: the rounds, the digest, the observations. null when a round failed or none was done. */
  private async callAgent(said: string, direct?: { recipe: StageDocT["recipe"]; slots: Record<string, unknown>; lang: Lang }): Promise<AgentResult | null> {
    const turnId = `t${performance.now().toString(36).replace(".", "")}${Math.random().toString(36).slice(2, 7)}`.slice(0, 40);
    let observations: { step: string; ok: boolean; error?: string | null }[] = [];
    const t0 = performance.now();
    const st = this.state();
    for (let round = 0; round < 3; round++) {
      if (performance.now() - t0 > 8000) break;
      const doc = this.doc;
      const s0 = performance.now();
      const { status, json } = await this.route({
        turnId, round, text: said.slice(0, 300), turns: this.turns.slice(-4), lastText: this.lastRequest && this.lastRequest.text !== said ? this.lastRequest.text.slice(0, 300) : null,
        state: { page: st.page, period: st.period, zone: st.zone, dept: st.dept, cat: st.cat, taluk: st.taluk, sev: st.sev, mapMode: st.mapMode, panel: st.panel, incident: st.incident, listLength: st.list.length, lastPlace: st.lastPlace, numbers: !!st.numbers },
        stage: doc ? stageContext(doc, this.focus) : null,
        stageDigest: doc ? stageDigest(this.model(), this.focus) : null,
        observations, direct: direct ?? null
      });
      const j = json as RoundOut & { why?: string };
      this.cur.rounds.push({ round, status, done: !!j.done, lane: j.lane ?? null, note: (j.result as AgentResult | null)?.note ?? null, kind: (j.result as AgentResult | null)?.kind ?? null, tokens: j.tokens ?? 0, calls: j.calls ?? 0, hops: j.hops ?? [],
        trace: (j.trace ?? []).map((x) => x.label), model: (j.result as AgentResult | null)?.model ?? null, ms: Math.round(performance.now() - s0) });
      this.cur.lane = j.lane ?? this.cur.lane;
      // the browser's post() throws on a bad status, and callAgent answers null
      if (status !== 200) { this.cur.error = `round ${round}: HTTP ${status}: ${j.why ?? ""}`; return null; }
      observations = [];
      for (const s of j.steps ?? []) {
        try { await this.runStep(s, "en", said); observations.push({ step: s.a, ok: true }); } catch (e) { observations.push({ step: s.a, ok: false, error: String((e as Error).message).slice(0, 150) }); }
      }
      if (j.done) return j.result ?? null;
    }
    return null;
  }

  /** A console step, as far as it changes what the next round is told (runStep, lines 556 to 695). Pressing the page itself is not simulated. */
  private async runStep(step: Step, lang: Lang, _heard: string): Promise<string | null> {
    this.cur.steps.push(step);
    const w = this.world;
    switch (step.a) {
      case "page": this.page = step.page; return null;
      case "period": this.period = step.period; return null;
      case "view": {
        const v = step.view;
        if (v.zone !== undefined) this.zone = v.zone ?? null;
        if (v.dept !== undefined) this.dept = v.dept ?? null;
        if (v.cat !== undefined) this.cat = v.cat ?? null;
        if (v.taluk !== undefined) this.taluk = v.taluk ?? null;
        if (v.sev !== undefined) this.sevTab = (v.sev ?? null) as ScreenState["sev"];
        if (v.zone) this.lastPlace = w.zones.find((z) => z.n === v.zone)?.name ?? null;
        if (v.taluk) this.lastPlace = w.taluks.find((t) => t.code === v.taluk)?.name ?? null;
        return null;
      }
      case "mapMode": this.mapMode = step.mode; return null;
      case "panel": this.panel = step.panel; return null;
      case "close": this.panel = null; return null;
      case "item": {
        if (!this.list.length) return line("noItem", lang);
        const at = typeof step.which === "number" ? step.which - 1 : 0;
        if (at >= this.list.length) return lang === "ta" ? `பட்டியலில் ${this.list.length} மட்டுமே உள்ளன.` : `There ${this.list.length === 1 ? "is only 1 item" : `are only ${this.list.length} items`} in the list.`;
        this.incident = this.list[Math.max(0, at)];
        return null;
      }
      case "draft": return this.incident ? line("draft", lang) : line("noIncident", lang);
      case "zoom": return this.incident || this.lastPlace ? null : line("noIncident", lang);
      case "send": return this.tray.length ? line("sendGate", lang, { n: this.tray.length }) : line("noDraft", lang);
      case "confirm": return lang === "ta" ? "அனுப்புவது உங்கள் கையால்: தட்டில் உள்ள ஒப்புதல் பொத்தானைத் தட்டுங்கள்." : "Approving is yours to tap: the Approve button is in the tray. I never send.";
      case "undo": return line("nothingToUndo", lang);
      case "whatDid": return line("didNothing", lang);
      default: return null;
    }
  }

  /** run(), lines 702 to 755. */
  private async run(steps: Step[], lang: Lang, heard: string, note?: string, quiet = false): Promise<void> {
    if (!steps.length) return;
    if (!quiet && steps.some((s) => NAVIGATES.has(s.a))) this.closeStage();
    const said: string[] = [];
    for (const s of steps) { const x = await this.runStep(s, lang, heard); if (x) said.push(x); }
    if (!steps.some((s) => s.a === "whatDid" || s.a === "repeat")) this.remember(heard, steps.map((s) => describeStep(s, this.world, "en")).join("; "));
    if (!quiet && steps.some((s) => ACTS_ON_PAGE.has(s.a))) this.closeStage();
    if (quiet) return;
    const speakLine = [note, ...said].filter(Boolean).join(" ");
    this.say(speakLine || steps.map((s) => describeStep(s, this.world, lang)).join(" · "), lang);
    if (this.cur.kind === "none") this.cur.kind = "do";
  }

  private say(text: string, lang: Lang) { this.cur.said = [this.cur.said, text].filter(Boolean).join(" "); this.cur.lang = lang; }

  /** showStage and narrate, lines 864 to 935: the screen becomes the Stage, its line is said, and the items of a brief or the news are read. */
  private showStage(doc: StageDocT, say: string | null, lang: Lang) {
    if (this.doc) this.back = [...this.back, this.doc].slice(-8);
    this.doc = doc; this.views = {}; this.filter = null; this.focus = null; this.narr = 0;
    this.remember(doc.title, `showed a ${doc.recipe} screen: ${doc.title}`);
    this.cur.stage = doc;
    if (say) { this.say(say, lang); this.cur.voice = spokenPart(say); }
    if (doc.blocks.some((b) => b.kind === "NewsReader" || b.kind === "Brief")) this.cur.items = narrationOf(doc, lang).map((x) => x.text);
  }

  /** directStage, lines 940 to 956. */
  private async directStage(recipe: StageDocT["recipe"], slots: Record<string, unknown>, label: string, lang: Lang) {
    const r = await this.callAgent(label, { recipe, slots, lang });
    if (!r?.stage) { this.say(lang === "ta" ? "அந்தத் திரையை உருவாக்க முடியவில்லை." : "I could not build that screen.", lang); return; }
    this.cur.kind = "do"; this.cur.server = r;
    this.showStage(r.stage, r.say, lang);
  }

  /** runEffect, lines 990 to 1015. */
  private async runEffect(e: StageEffect, lang: Lang, doc: StageDocT) {
    switch (e.fx) {
      case "say": this.say(e[lang], lang); return;
      case "readFrom": {
        const list = narrationOf(doc, lang);
        if (!list.length) { this.say(doc.say[lang], lang); return; }
        const k = Math.max(0, Math.min(list.length - 1, e.i));
        this.narr = k; this.cur.items = list.slice(k).map((x) => x.text);
        return;
      }
      case "rebuild":
        if (e.clearConsole) this.zone = this.dept = this.cat = this.taluk = null;
        await this.directStage(e.recipe, e.slots, e.label[lang], lang);
        return;
      case "draft": {
        const uniq = [...new Set(e.ids)].slice(0, 10);
        if (!uniq.length) { this.say(line("noIncident", lang), lang); return; }
        this.tray = [...new Set([...this.tray, ...uniq])];
        this.cur.drafted.push(...uniq);
        this.say(line("sendGate", lang, { n: this.tray.length }), lang);
        return;
      }
      default: return;
    }
  }

  /** applyLocal, lines 1017 to 1025. */
  private async applyLocal(cmd: LocalCmd, lang: Lang) {
    const before = this.model();
    if (!before.doc) return;
    const r = stageReducer(before, cmd);
    if (cmd.op === "open") this.focus = cmd.n;
    this.commit(r.m);
    if (r.m.doc && r.m.doc !== before.doc) this.cur.stage = r.m.doc;
    for (const e of r.fx) await this.runEffect(e, lang, before.doc);
  }

  /** applyStageOp, lines 1034 to 1049. */
  private async applyStageOp(op: StageOp, lang: Lang) {
    if (op.op === "save") { this.ask({ question: line("saveAsk", lang, { name: op.text ?? this.doc?.title ?? "Jarvis screen" }), lang, heard: "save", choices: [] }); return; }
    if (op.op === "pin") { this.ask({ question: lang === "ta" ? "இந்தத் திரையைப் பின் செய்யவா?" : "Pin this screen?", lang, heard: "pin this", choices: [] }); return; }
    const sortBy = (["complaints", "time", "value", "name", "severity"].includes(op.text ?? "") ? op.text : "value") as "value";
    const cmd: LocalCmd | null = op.op === "open" ? { op: "open", n: op.n ?? 1 }
      : op.op === "draft" ? { op: "draft", n: op.n ?? 1, first: /first|top/i.test(op.text ?? "") }
        : op.op === "filter" ? (op.text ? { op: "filter", text: op.text } : null)
          : op.op === "sort" ? { op: "sort", by: sortBy }
            : op.op === "view" ? { op: "view", view: op.text === "table" ? "table" : op.text === "map" ? "map" : "chart" }
              : op.op === "export" ? { op: "export", what: /png|image|picture/i.test(op.text ?? "") ? "png" : /csv|data/i.test(op.text ?? "") ? "csv" : null }
                : op.op === "map" ? { op: "map", n: op.n }
                  : op.op === "explain" ? { op: "again" }
                    : ({ op: op.op } as LocalCmd);
    if (cmd) await this.applyLocal(cmd, lang);
  }

  private ask(card: Card) { this.askOnce = card; this.cur.kind = "clarify"; this.say(card.question, card.lang); this.cur.options = card.choices.map((c) => ({ label: c.label, request: c.request ?? c.en })); }

  private gateB(steps: Step[], said: string, lang: Lang) {
    const s = steps.find((x) => x.a === "workspace" || x.a === "remember" || x.a === "forget" || x.a === "remind");
    if (!s) return this.run(steps, lang, said);
    const q = confirmLine(s as Parameters<typeof confirmLine>[0], lang) ?? ""; // the browser's own builder (say.ts), so this copy cannot drift from it
    this.pendingB = { steps, heard: said, lang };
    this.cur.kind = "clarify";
    this.say(q, lang);
  }

  private blank(): Outcome {
    return { path: [], lane: "none", kind: "none", note: null, lang: "en", said: "", voice: null, items: [], options: [], stage: null, steps: [], stageOp: null, drafted: [], rounds: [], server: null, rules: null, error: null, ms: 0 };
  }

  /** One sentence: handle(), lines 1103 to 1283. A typed sentence (gate null, level checks pass), in the default mode (no hands-free). */
  async handle(text: string, conf = 0.95, original?: string): Promise<Outcome> {
    const t0 = performance.now();
    this.cur = this.blank();
    await this.turn(text, conf, original);
    this.cur.ms = Math.round(performance.now() - t0);
    return this.cur;
  }

  private async turn(text: string, conf: number, original?: string): Promise<void> {
    const c = this.cur;
    const said = text.trim();
    if (!said) return;
    if (!original) this.lastRequest = { text: said, lang: /[஀-௿]/.test(said) ? "ta" : "en" };
    // an answer to the one question
    if (this.askOnce && !original) {
      const t = said.toLowerCase();
      const card = this.askOnce;
      const pick = /^(1|first|one|முதலாவது|முதல்|onnu|mudhal)$/.test(t) ? 0 : /^(2|second|two|இரண்டாவது|ரெண்டாவது|rendu|second one)$/.test(t) ? 1
        : /^(3|third|three|மூன்றாவது|moonu)$/.test(t) ? 2 : card.choices.findIndex((x) => x.label.toLowerCase() === t || x.en.toLowerCase() === t);
      this.askOnce = null;
      if (pick >= 0 && card.choices[pick]) {
        c.path.push("picked-choice");
        const ch = card.choices[pick];
        if (ch.request) return this.turn(ch.request, 0.95, card.heard);
        if (ch.steps?.length) return this.run(ch.steps, card.lang, card.heard);
        return;
      }
    }
    // a "yes" to a one-tap card
    if (this.pendingB) {
      const p = this.pendingB;
      this.pendingB = null;
      if (/^(yes|ok|okay|save|do it|ஆமா|ஆம்|சரி|aama|sari|seri)[.!]?$/i.test(said)) { c.path.push("yes-to-card"); return this.run(p.steps, p.lang, p.heard); }
      if (/^(no|cancel|வேண்டாம்|illa|vendaam)$/i.test(said)) { c.path.push("no-to-card"); return; }
    }
    // the open Stage's own commands
    if (this.doc && !original) {
      const lc = localStageCommand(said);
      if (lc) {
        const lg: Lang = /[஀-௿]/.test(said) ? "ta" : "en";
        c.path.push("stage-local"); c.lane = "stage-local"; c.kind = "do";
        this.remember(said, `on the Stage: ${lc.op}`);
        if (lc.op === "pin") { this.ask({ question: lg === "ta" ? "இந்தத் திரையைப் பின் செய்யவா?" : "Pin this screen?", lang: lg, heard: "pin this", choices: [] }); return; }
        await this.applyLocal(lc, lg);
        return;
      }
    }
    const st = this.state();
    const rules = understand(said, st, this.world, { speechConf: conf }) as Understood;
    if (rules.kind === "do" && isReflex(rules.steps, st)) { c.path.push("rules-reflex"); c.lane = "rules-instant"; c.rules = "do"; return this.run(rules.steps, rules.lang, said); }
    if (rules.kind === "do" && rules.confidence >= 0.9 && planRisk(rules.steps) === "A" && (isPlainMove(rules.steps) || isNavCommand(said, rules.steps))) {
      c.path.push("rules-nav"); c.lane = "rules-instant"; c.rules = "do";
      return this.run(rules.steps, rules.lang, said, rules.note?.[rules.lang]);
    }
    const heardAs = original ?? said;
    const openRows = (this.doc?.blocks ?? []).flatMap((b) => (b.kind === "CaseList" ? b.rows.map((r) => r.id) : []));
    if (openRows.length && quickScreen(said, this.world)?.recipe === "complete") { c.path.push("complete-open-rows"); return this.directStage("complete", { ids: openRows }, "Filling in", rules.lang); }
    c.path.push("agent");
    const ag = await this.callAgent(said);
    c.server = ag;
    if (ag && ag.kind !== "none") {
      const lang = ag.lang;
      c.lang = lang; c.note = ag.note;
      if (ag.kind === "chat") { c.kind = "chat"; this.remember(heardAs, ag.reply ?? ""); this.say(ag.reply ?? "", lang); return; }
      if (ag.kind === "refuse") { c.kind = "refuse"; this.remember(heardAs, `refused: ${ag.reply}`); this.say(ag.reply ?? "", lang); return; }
      if (ag.kind === "clarify") { this.ask({ question: ag.reply ?? "", lang, heard: heardAs, choices: ag.options.map((o) => ({ label: o.label, en: o.label, request: o.request })) }); return; }
      c.kind = "do";
      if (ag.steps.length && tapRisk(ag.steps) !== "A") return this.gateB(ag.steps, heardAs, lang);
      if (ag.stage) {
        const own = ag.steps.filter((s) => s.a !== "view" && s.a !== "period" && s.a !== "layer" && !(s.a === "page" && s.page === "environment"));
        if (own.length) await this.run(own, lang, heardAs, undefined, true);
        this.showStage(ag.stage, ag.say, lang);
        return;
      }
      if (ag.stageOp) {
        c.stageOp = ag.stageOp;
        if (ag.steps.length) await this.run(ag.steps, lang, heardAs, undefined, true);
        this.remember(heardAs, `on the Stage: ${ag.stageOp.op}${ag.stageOp.n ? ` ${ag.stageOp.n}` : ""}`);
        await this.applyStageOp(ag.stageOp, lang);
        return;
      }
      await this.run(ag.steps, lang, heardAs, figureFree(ag.reply));
      return;
    }
    // no agent answer: lines 1240 to 1282. `think` (the plan route) needs the same model the agent had, and a failed round is recorded as an error, so it is not asked
    c.path.push("rules-fallback");
    c.note = ag?.note ?? c.note;
    c.lang = rules.lang;
    c.rules = rules.kind;
    if (rules.kind === "unknown") {
      if (ag?.note === "no-model") { this.say(NO_MODEL_LINE[rules.lang], rules.lang); c.lane = "no-model"; return; }
      if (ag && ag.kind === "none") { this.say(cannotLine(rules.lang), rules.lang); c.lane = c.lane === "none" ? "cannot" : c.lane; return; }
      // the browser would go to Ask District IQ's analyst here: it is its own product, and it asks the same model
      c.path.push("analyst-handoff");
      this.say(cannotLine(rules.lang), rules.lang);
      return;
    }
    if (rules.kind === "refuse") { c.kind = "refuse"; this.say(rules.why[rules.lang], rules.lang); return; }
    if (rules.kind === "ask") {
      this.ask({ question: rules.question[rules.lang], lang: rules.lang, heard: rules.heard, choices: rules.choices.map((x) => ({ label: x.label[rules.lang], en: x.label.en, steps: x.steps })) });
      return;
    }
    if (tapRisk(rules.steps) !== "A") return this.gateB(rules.steps, said, rules.lang);
    if (rules.confidence < 0.6) {
      const what = rules.steps.map((x) => describeStep(x, this.world, rules.lang)).join(", ");
      this.ask({ question: line("lowConfidence", rules.lang, { what }), lang: rules.lang, heard: said, choices: [{ label: rules.lang === "ta" ? "ஆம்" : "Yes", en: "Yes", steps: rules.steps }, { label: rules.lang === "ta" ? "இல்லை" : "No", en: "No", steps: [] }] });
      return;
    }
    return this.run(rules.steps, rules.lang, said, rules.note?.[rules.lang]);
  }
}

/** The world the browser holds: the server's, plus what the console's own data gives it (lines 343 to 354). */
export async function browserWorld(): Promise<{ world: World; list: string[] }> {
  const w = await serverWorld();
  const h = serverHands({ email: USER.email, role: "collector", lockDept: null });
  const scope = { period: "daily" as const, zone: null, dept: null, cat: null, taluk: null, sev: null };
  const [zones, lakes, sev] = await Promise.all([
    h.tool("zones", { scope }).catch(() => null), h.tool("environment", { metric: "lake_pct_full" }).catch(() => null), h.severe(scope).catch(() => null)
  ]);
  const zt = ((zones?.data as { rows?: { zone: number; name: string; severe: number; open: number }[] } | undefined)?.rows ?? []);
  const lk = ((lakes?.data as { rows?: { place_id?: string; place?: string }[] } | undefined)?.rows ?? []);
  const first = ["Severe", "High", "Medium", "Low"].find((s) => Number(sev?.counts[s] ?? 0) > 0) ?? "Severe";
  return {
    world: { ...w, zones: w.zones.map((z) => ({ ...z, name: zt.find((x) => x.zone === z.n)?.name ?? z.name })), reservoirs: lk.map((x) => ({ id: String(x.place_id ?? x.place), name: String(x.place) })),
      zoneRank: [...zt].sort((a, b) => b.severe - a.severe || b.open - a.open).map((z) => z.zone), aliases: {} } as World,
    list: ((sev?.rows ?? []) as { id: unknown; sev: unknown }[]).filter((r) => r.sev === first).map((r) => String(r.id))
  };
}

/** The real path's whole-sentence call for a conversation: the earlier collector turns first, then the sentence. */
export async function runConversation(sim: ClientSim, earlier: string[], text: string): Promise<{ earlier: Outcome[]; last: Outcome }> {
  const done: Outcome[] = [];
  for (const e of earlier) done.push(await sim.handle(e));
  return { earlier: done, last: await sim.handle(text) };
}
