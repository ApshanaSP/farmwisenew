// Drafts the third held-out set, for the requests Jarvis v4 adds: explain one case, what changed, how do you know, a multi-step
// mission, a brief, remember and recall, and three-turn follow-ups; and side talk for the address gate. Gemini drafts from a prompt
// that sees none of Jarvis's code, rules or prompts (eval/holdout and eval/holdout2 have been read and tuned on: they are used here
// only to drop repeats). A second, different model labels every sentence blind, and a sentence stays only when both read it the same
// way, in the same language; a side-talk line stays only when the second model also hears it as talk between people. Run once, before
// any tuning; the output is frozen by hash (HASHES.txt). This script never prints a sentence, only counts, so whoever runs it stays
// blind to the set.
// A first attempt (15 Nov) broke off when all three labellers failed on overload (503) and rate limits (429) partway through: it had
// no side talk and lopsided Tanglish, so its output was set aside unread. This version waits and rotates labellers instead of dropping
// them, holds the drafter to a JSON schema, and writes nothing unless both parts of the set were labelled.
//   node eval/holdout3/draft.mjs
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
require("dotenv").config({ path: path.join(process.cwd(), ".env"), quiet: true });
const KEY = process.env.GEMINI_API_KEY;
const DRAFTER = process.env.DRAFT_MODEL || "gemini-3.5-flash-lite";
// the labeller is never the drafter
const LABELLERS = (process.env.LABEL_MODELS || "gemini-3.5-flash,gemini-3.6-flash,gemini-3.8-flash").split(",").map((m) => m.trim()).filter((m) => m && m !== DRAFTER);
const OUT = path.join("eval", "holdout3");
const OLD = [path.join("eval", "holdout"), path.join("eval", "holdout2")];
const SEED = 20261115;
const OVER = Number(process.env.OVER || 1.6);
const ROUNDS = Number(process.env.ROUNDS || 5);
const FILES = ["understanding.jsonl", "live30.json", "ambient.jsonl"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!KEY) { console.error("no GEMINI_API_KEY in .env: nothing drafted"); process.exit(1); }
if (!LABELLERS.length) { console.error("no labeller that differs from the drafter: nothing drafted"); process.exit(1); }
if ([...FILES, "HASHES.txt"].some((f) => fs.existsSync(path.join(OUT, f)))) { console.error("eval/holdout3 already holds a frozen set: nothing drafted"); process.exit(1); }

// a failure no retry will mend: a request the model refuses outright, or its quota for the day spent
class Fatal extends Error {}
const parseLoose = (t) => {
  const s = t.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  if (!s) return undefined;
  for (const c of [s, `[${s}]`, s.slice(s.indexOf("["), s.lastIndexOf("]") + 1)]) { try { return JSON.parse(c); } catch { /* the next reading */ } }
  return undefined;
};
// a labeller from another family (15 Nov, 09:00): the Gemini labellers' daily quota (20 a day) was spent by the first attempt, so a
// "groq:<model>" labeller asks Groq's chat endpoint instead. Same rules: only counts and status words are ever printed.
async function askGroq(model, prompt, temperature) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Fatal("groq: no key");
  for (let i = 0; i < 6; i++) {
    let r;
    try {
      r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature, max_completion_tokens: 8000, ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}) })
      });
    } catch { console.warn(model, "network error, retry"); await sleep(15000 * (i + 1)); continue; }
    if (r.status === 429 || r.status >= 500) {
      const ms = Math.min(90000, Math.max((Number(r.headers.get("retry-after")) || 0) * 1000 + 2000, 15000 * (i + 1)));
      console.warn(model, "retry", r.status, "in", Math.round(ms / 1000), "s");
      await sleep(ms);
      continue;
    }
    if (!r.ok) throw new Fatal(`${model} ${r.status}`);
    const j = await r.json();
    const v = parseLoose(String(j.choices?.[0]?.message?.content ?? ""));
    if (v !== undefined) return v;
    console.warn(model, "unparsable reply");
    await sleep(5000);
  }
  throw new Error(`${model}: gave up`);
}
async function askModel(model, prompt, temperature, schema) {
  if (model.startsWith("groq:")) return askGroq(model.slice(5), prompt, temperature);
  for (let i = 0; i < 6; i++) {
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature, responseMimeType: "application/json", ...(schema ? { responseSchema: schema } : {}), maxOutputTokens: 8000 } })
      });
    } catch { console.warn(model, "network error, retry"); await sleep(15000 * (i + 1)); continue; }
    if (r.status === 429 || r.status >= 500) {
      // only the quota's name and the wait it asks for are read from the error, never its message
      const e = await r.json().then((j) => j.error ?? {}, () => ({}));
      const details = Array.isArray(e.details) ? e.details : [];
      if (r.status === 429 && details.some((d) => (d.violations ?? []).some((v) => /PerDay/i.test(String(v.quotaId ?? ""))))) throw new Fatal(`${model} 429 daily quota spent`);
      const asked = Number(String(details.find((d) => d.retryDelay)?.retryDelay ?? "").replace(/s$/, "")) || 0;
      const ms = Math.min(90000, Math.max(asked * 1000 + 2000, 15000 * (i + 1)));
      console.warn(model, "retry", r.status, "in", Math.round(ms / 1000), "s");
      await sleep(ms);
      continue;
    }
    // only the error's status word: a message could echo the request, and the labeller's request holds sentences
    if (!r.ok) { const s = await r.json().then((j) => j.error?.status ?? "", () => ""); throw new Fatal(`${model} ${r.status} ${s}`); }
    const j = await r.json();
    const t = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const v = parseLoose(t);
    if (v !== undefined) return v;
    console.warn(model, "unparsable reply, length", t.length, j.candidates?.[0]?.finishReason ?? "");
    await sleep(5000);
  }
  throw new Error(`${model}: gave up`);
}
// the drafter is held to the shape of each request; the labellers answer free, as in holdout2
const STR = { type: "STRING" }, STRS = { type: "ARRAY", items: STR };
const shape = (props) => ({ type: "ARRAY", items: { type: "OBJECT", properties: props, required: Object.keys(props) } });
const ONE_SHAPE = shape({ text: STR, intent: STR, places: STRS });
const FOLLOW_SHAPE = shape({ script: STRS, text: STR, intent: STR, expect: STR, places: STRS });
const SIDE_SHAPE = shape({ text: STR });
const asArray = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v).find(Array.isArray) ?? [] : []);

// the closed list of this set, and the other things a third turn may ask for
const SET = {
  explain: "explain one specific case, incident, complaint or one change: what it is, why it matters, what to do about it",
  changed: "what has changed over a period (since yesterday, this week, since last week), and what drove the change",
  howknow: "asks for the evidence or source behind the assistant's last answer: where it is from, what data it rests on, how sure it is",
  mission: "a multi-step job: build or prepare several things at once for one purpose (for example a board for a crisis together with the cases and the teams to call, or everything needed for a review or a visit)",
  brief: "brief me: what should I know right now, is there anything I should worry about today",
  remember: "asks the assistant to remember a personal preference of the official, or a note for later",
  recall: "asks what the assistant remembers about the official, or tells it to forget something it remembered"
};
const MORE = {
  cases: "list incidents or complaints, optionally by severity, place, department, topic or period",
  compare: "two or more places or departments side by side",
  trend: "a measure over time",
  why: "the reasons behind a rise or fall in a measure",
  ranking: "the top or worst N of something",
  map: "show something on a map",
  news: "news items",
  readings: "rain, air quality or a reservoir level, at a place or all",
  performance: "department-wise or zone-wise performance",
  dashboard: "show one screen of charts and figures on one topic, nothing more"
};
const LABELS = { ...SET, ...MORE };
const lines = (o) => Object.entries(o).map(([k, v]) => `- ${k}: ${v}`).join("\n");

const PLACES = `The 15 zones of Chennai are: Thiruvottiyur, Manali, Madhavaram, Tondiarpet, Royapuram, Thiru-Vi-Ka Nagar, Ambattur, Anna Nagar, Teynampet, Kodambakkam, Valasaravakkam, Alandur, Adyar, Perungudi, Sholinganallur. Other places: Velachery, Mylapore, T Nagar, Guindy, Egmore. Reservoirs: Chembarambakkam, Puzhal, Poondi, Cholavaram, Veeranam. Departments: Metro Water (CMWSSB), Storm Water Drains, Solid Waste Management, Greater Chennai Police, PWD Water Resources, GCC Public Health, GCC Electrical.`;
const ROLE = `You write test sentences for a voice assistant used by the District Collector of Chennai, India, in the console where they watch civic incidents, complaints, news, rain, reservoirs, air quality, market prices and department performance. ${PLACES} Speak the way a busy senior official actually talks to an aide: half sentences, varied word order, natural phrasing, some long and some very short. Do not repeat a sentence pattern. Each sentence is what they would say aloud, so plain words only: no emoji, no markup.`;
const SYSTEM = `${ROLE}

Every item has "intent", exactly one of:
${lines(SET)}
- followup: the third thing said in a three-turn conversation, which only makes sense after the first two
And "places": the zone or place names mentioned in "text", in English spelling (empty list if none).`;
const REQ_ONE = (n, lang, intent) => `${SYSTEM}\n\nWrite ${n} items in ${lang}, every one with intent "${intent}". Make every one different: other places, departments, topics and periods, other ways of asking, some very short and some long. Return only a JSON array of objects {"text","intent","places"}.`;
const REQ_FOLLOW = (n, lang) => `${SYSTEM}\n\nWrite ${n} items in ${lang}, every one with intent "followup". Each is a three-turn conversation with the assistant: "script" is an array of the first two things the official said, in order, both in ${lang}, and "text" is the third, which only makes sense after those two because it leans on them (another place for the same question, a pick from a list, the reason, another period, the same for another department, a narrowing, the evidence for the last answer, explaining one item, what changed there, keeping a note of it). "expect" names what the third sentence itself really asks for, exactly one of:\n${lines(LABELS)}\nSpread "expect" across many of these names, explain, changed and howknow among them. Return only a JSON array of objects {"script","text","intent","expect","places"}.`;
const EN = "plain Indian English";
const TA = "Tamil script only, spoken Chennai Tamil, not literary";
const TG = "Tanglish: Tamil written in Latin letters mixed with English words, as typed in WhatsApp in Chennai (for example the style of: Adyar la enna nadakkudhu)";
const LANGS = { ta: TA, en: EN, tanglish: TG };
// how many to keep, per language and intent: Tamil 50, English 35, Tanglish 35, and across them explain 20, changed 18, howknow 12,
// mission 14, brief 10, remember 10, recall 8, followup 28
const PLAN = {
  ta: { explain: 8, changed: 8, howknow: 5, mission: 6, brief: 4, remember: 4, recall: 3, followup: 12 },
  en: { explain: 6, changed: 5, howknow: 3, mission: 4, brief: 3, remember: 3, recall: 3, followup: 8 },
  tanglish: { explain: 6, changed: 5, howknow: 4, mission: 4, brief: 3, remember: 3, recall: 2, followup: 8 }
};
const LIVE = { ta: 12, en: 9, tanglish: 9 };
const AMB_PLAN = { ta: 16, en: 12, tanglish: 12 };

// the blind label: a different model, given only the intents and the sentence (and, for a third turn, the two before it)
const LANG_LINE = `"lang", exactly one of: "ta" (Tamil script), "tanglish" (Tamil words written in Latin letters, mixed with English), "en" (plain English; Indian place names alone do not make it Tanglish).`;
const LABEL_PROMPT = (rows) => `A voice assistant serves the District Collector of Chennai, India, in the console where they watch civic incidents, complaints, news, rain, reservoirs, air quality, market prices and department performance. Each row below is a sentence the Collector said to it, in English, Tamil or Tanglish. For each one, say what it asks for. If a row has "script", the sentence is the third turn of a conversation and "script" holds the first two turns, in order: say what the third sentence itself really asks for, given them.
"intent", exactly one of:
${lines(LABELS)}
${LANG_LINE}
Return only a JSON array of {"id","intent","lang"}, one per row.

${JSON.stringify(rows)}`;
// the address gate's look-alikes: talk between people in the room, some of it about work
const AMB = (n, lang) => `You write what people in the District Collector's office in Chennai say to EACH OTHER while a voice assistant is listening in the room. These are side conversations between people (officers, staff, a PA, a visitor), NOT addressed to the assistant. Mix ordinary talk (lunch, a phone call, a meeting, someone's leave, the weather, cricket, traffic on the way in, a transfer) with, in more than half of them, talk about work that could be mistaken for a request to the assistant: naming zones, places, reservoirs and departments, giving numbers and times, using words such as remember, explain, brief, changed, how do you know, build, prepare, review, board, forget, but said to a colleague. ${PLACES} Write ${n} lines in ${lang}. Each is one line one person says aloud: plain words, no emoji, no speaker names, no quotation marks around it. Do not repeat a sentence pattern. Return only a JSON array of {"text"}.`;
const HEARD_PROMPT = (rows) => `In the District Collector's office in Chennai a voice assistant listens to everything said in the room. Each row below is a line someone said aloud, in English, Tamil or Tanglish. For each, say who the speaker is talking to: "to" is "assistant" when they ask the assistant to show, explain, brief, remember, build or answer something, and "person" when they are talking to another person in the room.
${LANG_LINE}
Return only a JSON array of {"id","to","lang"}, one per row.

${JSON.stringify(rows)}`;

// repeats: the old sets (read and tuned on), and the example requests the brief for this set was written with
const normText = (s) => String(s).toLowerCase().normalize("NFC").replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
const seen = new Set();
let oldRows = 0;
for (const d of OLD) for (const f of fs.readdirSync(d).filter((f) => f.endsWith(".jsonl")).sort()) {
  for (const l of fs.readFileSync(path.join(d, f), "utf8").split(/\r?\n/)) {
    if (!l.trim()) continue;
    const x = JSON.parse(l);
    oldRows++;
    for (const s of [x.text, x.after, ...(Array.isArray(x.script) ? x.script : [])]) if (typeof s === "string") seen.add(normText(s));
  }
}
for (const s of ["explain this one", "why does this Velachery drain issue matter", "tell me about the second case", "what's different from yesterday", "what moved this week in Adyar", "how do you know", "where's that from", "what data is this based on", "how sure are you", "build me a water-crisis board for Velachery", "get me ready for the monsoon review: flood cases, reservoirs, drains team", "brief me", "what should I know now", "anything I should worry about today", "remember I want Tamil in the mornings", "note that I follow Adyar closely", "what do you remember about me", "forget that"]) seen.add(normText(s));
const TAMIL = /[஀-௿]/g;
const clean = (text, k) => {
  if (typeof text !== "string" || text.trim().length < 2) return false;
  if (!/^[\p{Script=Latin}\p{Script=Tamil}\p{Mn}\p{Mc}\p{N}\p{P}\p{Zs}\p{Sc}\p{Sm}]+$/u.test(text)) return false;
  const letters = (text.match(/\p{L}/gu) ?? []).length, tamil = (text.match(TAMIL) ?? []).length;
  return k === "ta" ? tamil >= 0.5 * Math.max(1, letters) : tamil === 0;
};
const fresh = (text) => { const n = normText(text); if (seen.has(n)) return false; seen.add(n); return true; };
const word = (v) => (typeof v === "string" ? v : typeof v?.intent === "string" ? v.intent : "").trim().toLowerCase();
const placesOf = (x) => (Array.isArray(x.places) ? x.places.filter((p) => typeof p === "string" && p.trim()).map((p) => p.trim()) : []);

// a seeded shuffle: the choice of what stays is not mine
function shuffle(a, seed) {
  const out = [...a];
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

const stats = { attempt: 3, drafter: DRAFTER, labellers: [], seed: SEED, over: OVER, oldRows, rounds: 0, drafted: 0, filtered: 0, duplicate: 0, labelDropped: 0, langDropped: 0, unlabelled: 0, agreed: 0, borrowed: 0 };
const astats = { rounds: 0, drafted: 0, filtered: 0, duplicate: 0, heardAsAddressed: 0, langDropped: 0, unlabelled: 0, agreed: 0 };
// a labeller that fails a batch hands it to the next; one is out for the run only on a refusal or a spent daily quota. When every
// labeller fails a batch, wait and go round again, three times, before the labelling breaks off
const dead = new Set();
let cur = 0, labelOut = false, drafterOut = false;
async function labelBatch(prompt) {
  for (let cycle = 1; cycle <= 3; cycle++) {
    for (let n = 0; n < LABELLERS.length; n++) {
      const m = LABELLERS[(cur + n) % LABELLERS.length];
      if (dead.has(m)) continue;
      try {
        const ans = asArray(await askModel(m, prompt, 0));
        cur = LABELLERS.indexOf(m);
        if (!stats.labellers.includes(m)) stats.labellers.push(m);
        return ans;
      } catch (e) { if (e instanceof Fatal) dead.add(m); console.warn("labeller failed:", e.message, e instanceof Fatal ? "(out for the run)" : "(next labeller)"); }
    }
    if (dead.size === LABELLERS.length) break;
    if (cycle < 3) { console.warn("every labeller failed this batch: waiting 2 minutes"); await sleep(120000); }
  }
  return null;
}
async function labelAll(rows, makePrompt, size) {
  const got = new Map();
  for (let i = 0; i < rows.length; i += size) {
    const ans = await labelBatch(makePrompt(rows.slice(i, i + size)));
    if (!ans) { console.warn("no labeller left"); labelOut = true; return got; }
    for (const x of ans) if (x && x.id != null) got.set(Number(x.id), x);
    console.log("labelled", Math.min(i + size, rows.length), "of", rows.length);
    await sleep(14000);
  }
  return got;
}
async function draft(prompt, schema) {
  if (drafterOut) return null;
  try { return asArray(await askModel(DRAFTER, prompt, 0.9, schema)); }
  catch (e) { if (e instanceof Fatal) drafterOut = true; console.warn("drafter batch lost:", e.message, e instanceof Fatal ? "(drafter out for the run)" : ""); await sleep(7000); return null; }
}

// the requests: draft each language and intent, label blind, keep what agrees; then draft again for whatever came up short
const pool = [];
const tried = {};
const inCell = (k, c) => pool.filter((x) => x.lang === k && x.cell === c).length;
async function draftCell(k, asked, want, into) {
  const size = asked === "followup" ? 12 : 20;
  const t = (tried[`${k}/${asked}`] ??= { drafted: 0, agreed: 0 });
  while (want > 0) {
    const n = Math.min(size, want);
    want -= n;
    const items = await draft(asked === "followup" ? REQ_FOLLOW(n, LANGS[k]) : REQ_ONE(n, LANGS[k], asked), asked === "followup" ? FOLLOW_SHAPE : ONE_SHAPE);
    if (!items) continue;
    for (const x of items.slice(0, n)) {
      stats.drafted++;
      t.drafted++;
      if (!x || !clean(x.text, k)) { stats.filtered++; continue; }
      if (asked === "followup") {
        const script = Array.isArray(x.script) ? x.script : [];
        const expect = word(x.expect);
        if (script.length !== 2 || !script.every((s) => clean(s, k)) || !(expect in LABELS)) { stats.filtered++; continue; }
        if (!fresh([...script, x.text].join(" "))) { stats.duplicate++; continue; }
        into.push({ lang: k, cell: "followup", asked, text: x.text.trim(), intent: "followup", places: placesOf(x), script: script.map((s) => s.trim()), expect, gold: expect });
      } else {
        const intent = word(x.intent);
        if (!(intent in SET)) { stats.filtered++; continue; }
        if (!fresh(x.text)) { stats.duplicate++; continue; }
        into.push({ lang: k, cell: intent, asked, text: x.text.trim(), intent, places: placesOf(x), gold: intent });
      }
    }
    console.log(k, asked, "batch", n, "kept for labelling this round", into.length);
    await sleep(7000);
  }
}
for (let round = 1; round <= ROUNDS && !labelOut; round++) {
  const batch = [];
  let short = 0;
  for (const [k, cells] of Object.entries(PLAN)) for (const [cell, keep] of Object.entries(cells)) {
    const need = keep - inCell(k, cell);
    if (need <= 0) continue;
    short += need;
    const t = tried[`${k}/${cell}`];
    const rate = t && t.drafted ? t.agreed / t.drafted : 0.5;
    await draftCell(k, cell, round === 1 ? Math.ceil(keep * OVER) : Math.min(48, Math.ceil(need * Math.max(OVER, 1.2 / Math.max(rate, 0.15))) + 1), batch);
  }
  if (!short) break;
  stats.rounds = round;
  if (!batch.length) { console.warn("round", round, "drafted nothing usable: no more rounds"); break; }
  const got = await labelAll(batch.map((x, i) => ({ id: i, text: x.text, ...(x.script ? { script: x.script } : {}) })), LABEL_PROMPT, 30);
  batch.forEach((x, i) => {
    const l = got.get(i);
    if (!l || !word(l.intent)) stats.unlabelled++;
    else if (word(l.intent) !== x.gold) stats.labelDropped++;
    else if (word(l.lang) !== x.lang) stats.langDropped++;
    else { stats.agreed++; tried[`${x.lang}/${x.asked}`].agreed++; pool.push(x); }
  });
  console.log("round", round, "drafted", batch.length, "agreed so far", pool.length);
}
if (!pool.length) { console.error("nothing agreed (no labeller?): nothing written, nothing frozen", JSON.stringify(stats)); process.exit(1); }

// the side talk, checked the same way: it stays only when the second model hears it as talk between people. It gets its own try at
// the labellers even when the requests' labelling broke off in a later round
const sides = [];
const atried = {};
labelOut = false;
for (let round = 1; round <= ROUNDS && !labelOut; round++) {
  const batch = [];
  let short = 0;
  for (const [k, keep] of Object.entries(AMB_PLAN)) {
    const need = keep - sides.filter((x) => x.lang === k).length;
    if (need <= 0) continue;
    short += need;
    const t = (atried[k] ??= { drafted: 0, agreed: 0 });
    const rate = t.drafted ? t.agreed / t.drafted : 0.5;
    let want = round === 1 ? Math.ceil(keep * 1.75) + 2 : Math.min(48, Math.ceil(need * Math.max(2, 1.2 / Math.max(rate, 0.15))) + 2);
    while (want > 0) {
      const n = Math.min(24, want);
      want -= n;
      const items = await draft(AMB(n, LANGS[k]), SIDE_SHAPE);
      if (!items) continue;
      for (const x of items.slice(0, n)) {
        astats.drafted++;
        t.drafted++;
        if (!x || !clean(x.text, k)) { astats.filtered++; continue; }
        if (!fresh(x.text)) { astats.duplicate++; continue; }
        batch.push({ lang: k, kind: "side", text: x.text.trim() });
      }
      console.log("side", k, "batch", n, "kept for the check this round", batch.length);
      await sleep(7000);
    }
  }
  if (!short) break;
  astats.rounds = round;
  if (!batch.length) { console.warn("side round", round, "drafted nothing usable: no more rounds"); break; }
  const got = await labelAll(batch.map((x, i) => ({ id: i, text: x.text })), HEARD_PROMPT, 40);
  batch.forEach((x, i) => {
    const l = got.get(i), to = word(l?.to);
    if (to !== "person" && to !== "assistant") astats.unlabelled++;
    else if (to === "assistant") astats.heardAsAddressed++;
    else if (word(l.lang) !== x.lang) astats.langDropped++;
    else { astats.agreed++; atried[x.lang].agreed++; sides.push(x); }
  });
  console.log("side round", round, "drafted", batch.length, "agreed so far", sides.length);
}

// what stays: per language and intent, a seeded pick; a cell that came up short is made up from the rest of its language
const kept = [];
for (const [lang, cells] of Object.entries(PLAN)) {
  const mine = [];
  for (const [cell, keep] of Object.entries(cells)) mine.push(...shuffle(pool.filter((x) => x.lang === lang && x.cell === cell), SEED).slice(0, keep));
  const total = Object.values(cells).reduce((a, b) => a + b, 0);
  if (mine.length < total) {
    const rest = shuffle(pool.filter((x) => x.lang === lang && !mine.includes(x)), SEED + 3).slice(0, total - mine.length);
    stats.borrowed += rest.length;
    mine.push(...rest);
  }
  kept.push(...mine);
}
const understanding = shuffle(kept, SEED + 2).map((x, i) => ({ id: `w${String(i + 1).padStart(3, "0")}`, lang: x.lang, text: x.text, intent: x.intent, places: x.places, ...(x.script ? { script: x.script, expect: x.expect } : {}) }));
// the live sample: for runs that cannot afford all 120. Tamil is the priority, so it gets the most
const live = Object.entries(LIVE).flatMap(([lang, n]) => shuffle(understanding.filter((x) => x.lang === lang), SEED + 1).slice(0, n).map((x) => x.id));
const ambient = shuffle(Object.entries(AMB_PLAN).flatMap(([lang, n]) => shuffle(sides.filter((x) => x.lang === lang), SEED).slice(0, n)), SEED + 4).map((x, i) => ({ id: `c${String(i + 1).padStart(3, "0")}`, lang: x.lang, kind: x.kind, text: x.text }));

// half a set is not frozen: both parts must have been labelled, or nothing is written
if (!ambient.length) { console.error("no side talk got through the check (no labeller?): nothing written, nothing frozen", JSON.stringify({ understanding: understanding.length, ...stats, ambientDraft: astats })); process.exit(1); }
const jsonl = (rows) => rows.map((x) => JSON.stringify(x)).join("\n") + "\n";
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "understanding.jsonl"), jsonl(understanding));
fs.writeFileSync(path.join(OUT, "live30.json"), JSON.stringify({ live30: live }, null, 1) + "\n");
fs.writeFileSync(path.join(OUT, "ambient.jsonl"), jsonl(ambient));
// git may change the line endings on checkout: the hash is of the text with LF endings, as holdout.live.ts checks it
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(path.join(OUT, f), "utf8").replace(/\r\n/g, "\n")).digest("hex");
fs.writeFileSync(path.join(OUT, "HASHES.txt"), FILES.map((f) => `${sha(f)} *eval/holdout3/${f}`).join("\n") + "\n");

const count = (rows, key) => rows.reduce((m, x) => ((m[key(x)] = (m[key(x)] ?? 0) + 1), m), {});
const summary = {
  at: new Date().toISOString(), ...stats,
  understanding: understanding.length, target: 120, shortfall: 120 - understanding.length,
  byLang: count(understanding, (x) => x.lang), byIntent: count(understanding, (x) => x.intent),
  followupExpect: count(understanding.filter((x) => x.expect), (x) => x.expect),
  byLangIntent: Object.fromEntries(Object.keys(PLAN).map((lang) => [lang, count(understanding.filter((x) => x.lang === lang), (x) => x.intent)])),
  live: live.length, liveByLang: count(understanding.filter((x) => live.includes(x.id)), (x) => x.lang),
  ambient: ambient.length, ambientTarget: 40, ambientShortfall: 40 - ambient.length, ambientByLang: count(ambient, (x) => x.lang),
  ambientDraft: astats
};
fs.writeFileSync(path.join(OUT, "draft-stats.json"), JSON.stringify(summary, null, 1) + "\n");
console.log(JSON.stringify(summary));
