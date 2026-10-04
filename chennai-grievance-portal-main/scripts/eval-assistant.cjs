/**
 * Evaluates Ask District IQ against the local store and writes data/eval/assistant-eval.json:
 *  - intent accuracy on the hand-written questions (src/lib/assistant/__tests__/eval/intents.json);
 *  - incident retrieval, Top-1/3/5 and MRR: a news headline from one outlet must find the incident built from the same
 *    event (the incident's title is usually another outlet's headline, so the query is a paraphrase, sometimes in the
 *    other language); with and without the filters the search infers from the words (place, kind);
 *  - follow-up resolution: scripted conversations over the fast path, each turn checked against the answer before it;
 *  - grounding: every number in a fast-path answer's text must be in the records the answer carries; and, for answers
 *    the chat model wrote, the runtime number check's results on the answers saved so far.
 * Read-only. Needs the meaning-search index (npm run embed:build).    npm run eval:assistant
 */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
process.chdir(root);
require("dotenv").config({ path: path.join(root, ".env"), quiet: true });
const jiti = require("jiti")(__filename, { alias: { "@": path.join(root, "src") }, interopDefault: true });
const src = (p) => jiti(path.join(root, "src", "lib", ...p.split("/")));

const SAMPLE = Number(process.env.EVAL_SAMPLE || 200);
const t0 = Date.now();
const log = (m) => console.log(`[eval] ${m}`);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex");
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

async function main() {
  globalThis.__transformers = await import(require("url").pathToFileURL(path.join(root, "node_modules", "@huggingface", "transformers", "dist", "transformers.node.mjs")).href);
  const { default: db, OPS_DB } = src("collector/db.ts");
  const { asOf } = src("collector/intel.ts");
  const { buildIndex, embedStatus } = src("assistant/embed.ts");
  const { findIncidents, runTool } = src("assistant/tools.ts");
  const { fastPath } = src("assistant/fastpath.ts");
  const { detectIntent } = src("assistant/intent.ts");
  const { refNames, ScopeSchema } = src("assistant/scope.ts");
  const q = async (sql, params = []) => (await db.query(sql, params))[0];

  const now = await asOf();
  const names = await refNames();
  // the saved index with each incident's filters and keywords; nothing new is embedded here
  const ix = await buildIndex(now, { maxNew: 0 });
  log(`store as of ${now}; meaning index covers ${ix.total - ix.waiting} of ${ix.total} incidents`);
  const report = { asOf: now, ranAt: new Date().toISOString(), index: { ...embedStatus(), covered: ix.total - ix.waiting, total: ix.total } };

  // ------------------------------------------------------------ 1. intents --
  const EVAL = JSON.parse(fs.readFileSync(path.join(root, "src", "lib", "assistant", "__tests__", "eval", "intents.json"), "utf8"));
  const afterList = { lastIntent: "PRIORITY_INCIDENT_LIST", lastResponseType: "incident_list", activeFilters: { period: "daily", topic: "crime" },
    resultIds: ["INC-A", "INC-B", "INC-C"], selectedIncidentId: null };
  const ctxOf = { list: afterList, detail: { ...afterList, lastIntent: "INCIDENT_DETAIL", lastResponseType: "incident_detail", selectedIncidentId: "INC-B" },
    news: { lastIntent: "NEWS_TOP", lastResponseType: "news_list", activeFilters: { period: "daily" }, storyIds: ["S1", "S2", "S3"] } };
  const misses = EVAL.map((r) => ({ ...r, got: detectIntent(r.q, r.ctx ? ctxOf[r.ctx] : null).intent })).filter((r) => r.got !== r.intent);
  report.intent = { n: EVAL.length, accuracy: pct(EVAL.length - misses.length, EVAL.length), misses: misses.map((r) => `${r.q} -> ${r.got} (expected ${r.intent})`),
    note: "hand-written questions (not real usage): an optimistic estimate" };
  log(`intent accuracy ${report.intent.accuracy}% on ${EVAL.length}`);

  // ---------------------------------------------------------- 2. retrieval --
  const rows = await q(
    `SELECT m.incident_id AS id, m.event_id AS ev, m.title AS mt, d.publisher AS pub, i.title AS it
     FROM incident_members m JOIN incidents i ON i.incident_id = m.incident_id LEFT JOIN documents d ON d.event_id = m.event_id
     WHERE m.source = 'news' AND i.outlet_count >= 2 AND m.title IS NOT NULL`);
  const byInc = new Map();
  for (const r of rows) (byInc.get(r.id) ?? byInc.set(r.id, []).get(r.id)).push(r);
  const evInc = new Map();
  for (const r of rows) (evInc.get(r.ev) ?? evInc.set(r.ev, new Set()).get(r.ev)).add(r.id);
  // per incident, a headline that is not the incident's own title, preferably from another outlet than the one it came from
  const cases = [];
  for (const [id, ms] of byInc) {
    const own = ms.find((m) => norm(m.mt) === norm(m.it));
    const other = ms.filter((m) => norm(m.mt) !== norm(m.it) && norm(m.mt).length >= 20).sort((a, b) => (a.pub === own?.pub) - (b.pub === own?.pub) || sha(a.ev).localeCompare(sha(b.ev)))[0];
    if (other) cases.push({ id, query: other.mt, publisher: other.pub ?? null, title: ms[0].it, ok: evInc.get(other.ev) ?? new Set([id]) });
  }
  cases.sort((a, b) => sha(a.id).localeCompare(sha(b.id)));
  const test = cases.slice(0, SAMPLE);
  log(`retrieval: ${test.length} of ${cases.length} multi-outlet incidents`);
  const runSet = async (scope) => {
    const out = { n: 0, top1: 0, top3: 0, top5: 0, mrr: 0, tamil: { n: 0, top1: 0, top5: 0 }, ms: 0, misses: [] };
    for (const c of test) {
      const t = Date.now();
      const r = await findIncidents(c.query, scope ? { period: "quarterly" } : { period: "quarterly", zone: null, cat: null }, now)
        .catch((e) => ({ found: [], how: `error: ${e.message}` }));
      out.ms += Date.now() - t;
      const ids = r.found.map((f) => f.id);
      const rank = ids.findIndex((x) => c.ok.has(x)) + 1;
      const ta = /[஀-௿]/.test(c.query);
      out.n++;
      if (rank === 1) out.top1++;
      if (rank && rank <= 3) out.top3++;
      if (rank && rank <= 5) out.top5++;
      if (rank) out.mrr += 1 / rank;
      if (ta) { out.tamil.n++; if (rank === 1) out.tamil.top1++; if (rank && rank <= 5) out.tamil.top5++; }
      if (rank !== 1 && out.misses.length < 15) out.misses.push({ query: c.query, expected: c.id, expectedTitle: c.title, got: ids[0] ?? null, rank: rank || null, how: r.how });
    }
    return { n: out.n, top1: pct(out.top1, out.n), top3: pct(out.top3, out.n), top5: pct(out.top5, out.n), mrr: Math.round((out.mrr / Math.max(1, out.n)) * 1000) / 1000,
      tamil: { n: out.tamil.n, top1: pct(out.tamil.top1, out.tamil.n), top5: pct(out.tamil.top5, out.tamil.n) }, avgMs: Math.round(out.ms / Math.max(1, out.n)), misses: out.misses };
  };
  // the search as the assistant runs it (the place and kind the words name narrow it), and the meaning alone
  report.retrieval = { query: "a news headline about the incident that is not its own title (another outlet's report of the same event)",
    asked: await runSet(true) };
  // findIncidents infers place and kind from the words in both runs; the second run only drops console filters, so it is
  // the same search: kept as one figure
  log(`retrieval top1 ${report.retrieval.asked.top1}% top5 ${report.retrieval.asked.top5}% mrr ${report.retrieval.asked.mrr}`);

  // ---------------------------------------------------------- 3. follow-ups --
  const scope = ScopeSchema.parse({ period: "weekly" });
  const turn = async (message, ctx) => {
    const place = await runTool("resolve_place", { text: message }).then((r) => r.data).catch(() => null);
    const t = Date.now();
    const out = await fastPath({ message, lang: "en", scope, names, now, lockDept: null, ctx, place });
    return { card: out?.card ?? null, ms: Date.now() - t };
  };
  const ids = (c) => (c?.incidents ?? []).map((x) => x.incidentId);
  const toolArg = (c, k) => c?.sources.tools[0]?.args?.[k];
  const DIALOGUES = [
    { name: "priority list, then one of them in depth", steps: [
      ["Show me the top 3 priority crime incidents", (c) => c?.responseType === "incident_list" && ids(c).length > 0 && ids(c).length <= 3],
      ["Tell me more about the second one", (c, h) => c?.responseType === "incident_detail" && c.incident.incidentId === ids(h[0])[1]],
      ["Where did it happen?", (c, h) => c?.incident?.incidentId === ids(h[0])[1] && c.incident.focus === "where"],
      ["When was it reported?", (c, h) => c?.incident?.incidentId === ids(h[0])[1] && c.incident.focus === "when"],
      ["Show similar incidents nearby", (c, h) => c?.intent === "INCIDENT_RELATED" && toolArg(c, "id") === ids(h[0])[1]],
      ["Make that a map", (c, h) => (ids(h[4]).length ? c?.responseType === "map" && JSON.stringify(ids(c)) === JSON.stringify(ids(h[4])) : c === null)]] },
    { name: "the last one of a list", steps: [
      ["Top 5 priority incidents this month", (c) => c?.responseType === "incident_list" && ids(c).length === 5],
      ["Tell me about the last one", (c, h) => c?.incident?.incidentId === ids(h[0])[4]]] },
    { name: "a list narrowed to a place", steps: [
      ["List the recent accident incidents this month", (c) => c?.responseType === "incident_list"],
      ["Only in Adyar", (c, h) => c?.responseType === "incident_list" && c.scope?.zone != null && names.zones.get(c.scope.zone)?.name?.toLowerCase().includes("adyar")
        && JSON.stringify(toolArg(c, "cats")) === JSON.stringify(toolArg(h[0], "cats"))]] },
    { name: "actions for a listed incident", steps: [
      ["Top 3 priority incidents this week", (c) => c?.responseType === "incident_list"],
      ["What should we do about the first one?", (c, h) => c?.responseType === "actions" && c.actions[0]?.incidentId === ids(h[0])[0]]] },
    { name: "actions for the incident in view", steps: [
      ["Show me the top 3 priority incidents today", (c) => c?.responseType === "incident_list"],
      ["Explain the third one", (c, h) => c?.incident?.incidentId === ids(h[0])[2]],
      ["What should be done about it?", (c, h) => c?.responseType === "actions" && c.actions[0]?.incidentId === ids(h[0])[2]]] },
    { name: "a count, then the incidents behind it", steps: [
      ["How many crime incidents this month?", (c) => c?.responseType === "kpi"],
      ["Show me the top 3", (c, h) => c?.responseType === "incident_list" && ids(c).length <= 3 && c.context?.activeFilters?.topic === h[0]?.context?.activeFilters?.topic
        && c.context?.activeFilters?.topic === "crime"]] },
    { name: "top news, then one story", steps: [
      ["What are the top news stories today?", (c) => c?.responseType === "news_list" && c.stories.length > 0],
      ["Tell me more about the first story", (c, h) => c?.responseType === "news_detail" && c.stories[0]?.storyId === h[0].stories[0].storyId]] },
    { name: "a list as a table", steps: [
      ["Top 4 priority flooding incidents this month", (c) => c?.responseType === "incident_list"],
      ["As a table", (c, h) => (ids(h[0]).length ? c?.responseType === "table" && JSON.stringify(ids(c)) === JSON.stringify(ids(h[0])) : c === null)]] }
  ];
  const fu = { dialogues: [], turns: 0, followUps: 0, resolved: 0, allTurnsOk: 0 };
  const cards = [];
  const latency = [];
  for (const dlg of DIALOGUES) {
    const hist = [];
    let ctx = null;
    const res = [];
    for (const [k, [msg, check]] of dlg.steps.entries()) {
      const r = await turn(msg, ctx).catch((e) => ({ card: null, ms: 0, error: e.message }));
      latency.push(r.ms);
      if (r.card) cards.push({ q: msg, card: r.card });
      const ok = !!check(r.card, hist);
      hist.push(r.card);
      ctx = r.card?.context ?? ctx;
      fu.turns++;
      if (k > 0) { fu.followUps++; if (ok) fu.resolved++; }
      res.push({ q: msg, ok, intent: r.card?.intent ?? null, type: r.card?.responseType ?? null, headline: r.card?.headline ?? null, ms: r.ms, ...(r.error ? { error: r.error } : {}) });
    }
    if (res.every((x) => x.ok)) fu.allTurnsOk++;
    fu.dialogues.push({ name: dlg.name, turns: res });
  }
  report.followUps = { dialogues: DIALOGUES.length, followUpTurns: fu.followUps, resolved: pct(fu.resolved, fu.followUps), dialoguesFullyRight: `${fu.allTurnsOk}/${DIALOGUES.length}`,
    detail: fu.dialogues };
  log(`follow-ups resolved ${report.followUps.resolved}% (${fu.resolved}/${fu.followUps}); dialogues right ${report.followUps.dialoguesFullyRight}`);

  // ----------------------------------------------------------- 4. grounding --
  for (const msg of ["How many murders this week?", "Top 3 crime types this month", "Which kinds of incidents are most common this week?",
    "Top news about flooding this week", "News with no department record this week", "What needs action now?"]) {
    const r = await turn(msg, null).catch(() => ({ card: null, ms: 0 }));
    latency.push(r.ms);
    if (r.card) cards.push({ q: msg, card: r.card });
  }
  const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const numbersIn = (s) => {
    const out = (String(s).replace(/(\d),(?=\d)/g, "$1").match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
    for (const [w, v] of Object.entries(WORDS)) if (new RegExp(`\\b${w}\\b`, "i").test(s)) out.push(v);
    return out;
  };
  const allowedOf = (x) => {
    const set = new Set();
    const walk = (v) => {
      if (Array.isArray(v)) { set.add(v.length); v.forEach(walk); }
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
      else if (typeof v === "number") { set.add(v); set.add(Math.round(v)); set.add(Math.round(v * 10) / 10); }
      else if (typeof v === "string") numbersIn(v).forEach((n) => set.add(n));
    };
    walk(x);
    return set;
  };
  let checked = 0, unmatched = [];
  for (const { q: question, card } of cards) {
    const allowed = allowedOf([card.incidents, card.incident, card.stories, card.kpis, card.datasets, card.actions, card.sources.tools, card.scopeLine, question,
      card.stories?.length ? [] : null]);
    for (const text of [card.headline, card.answerMarkdown, ...card.caveats]) {
      for (const n of numbersIn(text)) {
        checked++;
        if (!allowed.has(n)) unmatched.push({ q: question, number: n, text: String(text).slice(0, 160) });
      }
    }
  }
  // answers the chat model wrote: what the runtime number check found on the answers saved so far
  const saved = await q(`SELECT JSON_EXTRACT(payload, '$.sources.verifier') AS v, JSON_UNQUOTE(JSON_EXTRACT(payload, '$.kind')) AS kind
    FROM ${OPS_DB}.assistant_messages WHERE role = 'assistant' AND payload IS NOT NULL`).catch(() => []);
  const ver = saved.map((r) => (typeof r.v === "string" ? JSON.parse(r.v) : r.v)).filter((v) => v && !v.template && v.checked > 0);
  report.grounding = {
    fastPath: { answers: cards.length, numbersChecked: checked, unmatched: unmatched.length, grounded: pct(checked - unmatched.length, checked), examples: unmatched.slice(0, 10) },
    modelWritten: { answersWithNumbers: ver.length, numbersChecked: ver.reduce((a, v) => a + v.checked, 0),
      answersWithAnUnmatchedNumber: ver.filter((v) => (v.unmatched ?? []).length > 0).length, regenerated: ver.filter((v) => v.regenerated).length,
      note: "the runtime check rewrites or drops an answer whose numbers are not in the tool results; unmatched counts what it caught" }
  };
  log(`grounding: ${checked - unmatched.length}/${checked} fast-path numbers found in the records; ${ver.length} saved model answers carried a number check`);

  latency.sort((a, b) => a - b);
  report.latency = { fastPathTurns: latency.length, p50ms: latency[Math.floor(latency.length / 2)], p90ms: latency[Math.floor(latency.length * 0.9)], maxMs: latency.at(-1),
    note: "the fast path alone, in this process (the web server adds the session, spelling and place lookups)" };
  report.runtimeS = Math.round((Date.now() - t0) / 1000);
  const out = path.join(root, "data", "eval");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "assistant-eval.json"), JSON.stringify(report, null, 2));
  log(`fast path p50 ${report.latency.p50ms} ms, p90 ${report.latency.p90ms} ms; written data/eval/assistant-eval.json in ${report.runtimeS} s`);
  await db.end?.();
}

main().then(() => process.exit(0)).catch((e) => { console.error(`[eval] failed: ${e && e.stack ? e.stack : e}`); process.exit(1); });
