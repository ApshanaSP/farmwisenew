// Drafts the second held-out set with Gemini, from a prompt that does not see Jarvis's rules, lexicon or prompts: the sets in
// eval/holdout have been read and are no longer held out. A second model labels every sentence blind, and a sentence stays only
// when both read it the same way. Run once, before any tuning; the output is frozen by hash (HASHES.txt). This script never
// prints a sentence, so whoever runs it stays blind to the set.
//   node eval/holdout2/draft.mjs
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
require("dotenv").config({ path: path.join(process.cwd(), ".env") });
const KEY = process.env.GEMINI_API_KEY;
const DRAFTER = process.env.DRAFT_MODEL || "gemini-3.5-flash-lite";
const LABELLERS = (process.env.LABEL_MODELS || "gemini-3.5-flash,gemini-3.6-flash,gemini-3.8-flash").split(",");
const OUT = path.join("eval", "holdout2");
const OLD = path.join("eval", "holdout");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function askModel(model, prompt, temperature) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature, responseMimeType: "application/json", maxOutputTokens: 8000 } })
    });
    if (r.status === 429 || r.status >= 500) { console.warn(model, "retry", r.status); await sleep(20000); continue; }
    if (!r.ok) throw new Error(`${model} ${r.status}`);
    const j = await r.json();
    const t = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    try { return JSON.parse(t.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { console.warn(model, "unparsable reply, length", t.length); await sleep(5000); }
  }
  throw new Error(`${model}: gave up`);
}

const INTENTS = `cases (list incidents or complaints, optionally by severity, place, department, topic, period) | case (one incident in depth) | news | readings (rain, air quality, reservoir level at a place or all) | ranking (top or worst N of something) | compare (two or more places or departments side by side) | trend (a measure over time) | why (reasons behind a change) | performance (department-wise or zone-wise performance) | dashboard (build a multi-part screen on a topic) | map (show something on a map) | nearby (places within a distance of something) | brief (the day's situation or summary) | prices (market prices) | navigate (go to a page, open a panel, change a filter or period on the console, no question) | save (save the current view as a named workspace, pin it, or remember a note) | insight (find what stands out, outliers, anomalies, unusual rises) | complete (fill in missing data in a table or dataset, or list what is unresolved) | general (a general-knowledge question unrelated to the district) | refuse (asks to send, approve, delete, or reveal private citizen data)`;
const NAMES = new Set(INTENTS.split(" | ").map((s) => s.split(" ")[0]));
const ROLE = `You write test sentences for a voice assistant used by the District Collector of Chennai, India, in the console where they watch civic incidents, complaints, news, rain, reservoirs, air quality, market prices and department performance. The 15 zones of Chennai are: Thiruvottiyur, Manali, Madhavaram, Tondiarpet, Royapuram, Thiru-Vi-Ka Nagar, Ambattur, Anna Nagar, Teynampet, Kodambakkam, Valasaravakkam, Alandur, Adyar, Perungudi, Sholinganallur. Other places: Velachery, Mylapore, T Nagar, Guindy, Egmore. Reservoirs: Chembarambakkam, Puzhal, Poondi, Cholavaram, Veeranam. Departments: Metro Water (CMWSSB), Storm Water Drains, Solid Waste Management, Greater Chennai Police, PWD Water Resources, GCC Public Health, GCC Electrical. Speak the way a busy senior official actually talks to an aide: half sentences, varied word order, natural phrasing, some long and some very short. Do not repeat a sentence pattern. Each sentence is what they would say aloud, so plain words only: no emoji, no markup.`;
const SYSTEM = `${ROLE}

Every item has "intent", exactly one of:
${INTENTS} | followup (only makes sense after an earlier sentence).
And "places": the zone or place names mentioned, in English spelling (empty list if none). Return only a JSON array of objects {"text","intent","places"}.`;

const REQ = (n, lang, extra) => `${SYSTEM}\n\nWrite ${n} items in ${lang}. ${extra}`;
const EN = "plain Indian English";
const TA = "Tamil script only, spoken Chennai Tamil, not literary";
const TG = "Tanglish: Tamil written in Latin letters mixed with English words, as typed in WhatsApp in Chennai (for example the style of: Adyar la enna nadakkudhu)";
const MIX = "Cover these intents about evenly: cases, news, readings, ranking, compare, trend, why, performance, dashboard, map, nearby, brief, prices, navigate.";
const OWNER = "Use only these intents, evenly: compare, insight, complete, save, general, refuse.";
const FOLLOW = 'Each item is a follow-up that only makes sense after an earlier sentence. Add a field "after" with that earlier sentence (in the same language) and set intent to "followup", with a field "expect" naming what the follow-up really asks for (same intent names as above). Include forms like: and in Adyar?, why?, the second one, compare with last month, same for Ambattur, only severe.';

const BATCH = 24;
// how many to keep, and how many to draft: the blind label and the filters remove some
const PLAN = { en: { lang: EN, keep: { mix: 32, owner: 11, follow: 7 } }, ta: { lang: TA, keep: { mix: 51, owner: 18, follow: 11 } }, tanglish: { lang: TG, keep: { mix: 32, owner: 11, follow: 7 } } };
const EXTRAS = { mix: MIX, owner: OWNER, follow: FOLLOW };
const OVER = 1.6;

const normText = (s) => String(s).toLowerCase().normalize("NFC").replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
const seen = new Set();
for (const f of ["understanding.jsonl", "ambient.jsonl", "followups.jsonl", "followups2.jsonl"]) {
  for (const l of fs.readFileSync(path.join(OLD, f), "utf8").trim().split("\n")) seen.add(normText(JSON.parse(l).text));
}
const TAMIL = /[஀-௿]/g;
const clean = (text, k) => {
  if (typeof text !== "string" || text.trim().length < 2) return false;
  if (!/^[\p{Script=Latin}\p{Script=Tamil}\p{Mn}\p{Mc}\p{N}\p{P}\p{Zs}\p{Sc}\p{Sm}]+$/u.test(text)) return false;
  const letters = (text.match(/\p{L}/gu) ?? []).length, tamil = (text.match(TAMIL) ?? []).length;
  return k === "ta" ? tamil >= 0.5 * Math.max(1, letters) : tamil === 0;
};
const fresh = (text) => { const n = normText(text); if (seen.has(n)) return false; seen.add(n); return true; };
const expectOf = (x) => { const e = typeof x.expect === "string" ? x.expect : x.expect?.intent; return NAMES.has(e) ? e : null; };

const stats = { drafter: DRAFTER, labellers: [], drafted: 0, filtered: 0, duplicate: 0, labelDropped: 0, unlabelled: 0 };
const drafted = [];
for (const [k, p] of Object.entries(PLAN)) {
  for (const [block, keep] of Object.entries(p.keep)) {
    let want = Math.ceil(keep * OVER);
    while (want > 0) {
      const n = Math.min(BATCH, want);
      const items = await askModel(DRAFTER, REQ(n, p.lang, EXTRAS[block]), 0.9);
      for (const x of Array.isArray(items) ? items.slice(0, n) : []) {
        stats.drafted++;
        if (!clean(x.text, k) || (x.after != null && !clean(x.after, k))) { stats.filtered++; continue; }
        if (!fresh(x.text)) { stats.duplicate++; continue; }
        const gold = block === "follow" ? expectOf(x) : (NAMES.has(x.intent) ? x.intent : null);
        if (!gold || (block === "follow" && !x.after)) { stats.filtered++; continue; }
        drafted.push({ lang: k, block, text: x.text.trim(), intent: block === "follow" ? "followup" : gold, gold, places: Array.isArray(x.places) ? x.places : [], ...(block === "follow" ? { after: String(x.after).trim(), expect: gold } : {}) });
      }
      want -= n;
      console.log(k, block, "batch", n, "total kept so far", drafted.length);
      await sleep(7000);
    }
  }
}

// the blind label: a different model, given only the intents and the sentence
const LABEL_PROMPT = (rows) => `A voice assistant serves the District Collector of Chennai, India, in the console where they watch civic incidents, complaints, news, rain, reservoirs, air quality, market prices and department performance. Sentences below are in English, Tamil or Tanglish. For each one, say what it asks for. If it has "after", it follows that earlier sentence: say what the follow-up itself really asks for.
Intents, exactly one of:
${INTENTS}.
Return only a JSON array of {"id","intent"}, one per sentence.

${JSON.stringify(rows)}`;
const labels = new Map();
let li = 0;
for (let i = 0; i < drafted.length; i += 40) {
  const rows = drafted.slice(i, i + 40).map((x, j) => ({ id: i + j, text: x.text, ...(x.after ? { after: x.after } : {}) }));
  let got = null;
  while (!got && li < LABELLERS.length) {
    try { got = await askModel(LABELLERS[li], LABEL_PROMPT(rows), 0); if (!stats.labellers.includes(LABELLERS[li])) stats.labellers.push(LABELLERS[li]); }
    catch (e) { console.warn("labeller moved on:", e.message); li++; }
  }
  if (!got) throw new Error("no labeller left: nothing written, nothing frozen");
  for (const x of got) labels.set(Number(x.id), x.intent);
  console.log("labelled", Math.min(i + 40, drafted.length), "of", drafted.length);
  await sleep(14000);
}
const agreed = drafted.filter((x, i) => {
  const l = labels.get(i);
  if (!l) { stats.unlabelled++; return false; }
  if (l !== x.gold) { stats.labelDropped++; return false; }
  return true;
});

// a seeded shuffle: the choice of what stays is not mine
function shuffle(a, seed) {
  const out = [...a];
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
const SEED = 20261104;
const kept = [];
for (const [k, p] of Object.entries(PLAN)) for (const [block, keep] of Object.entries(p.keep)) kept.push(...shuffle(agreed.filter((x) => x.lang === k && x.block === block), SEED).slice(0, keep));
const understanding = kept.map((x, i) => { const { gold, block, ...rest } = x; void gold; void block; return { id: `v${String(i + 1).padStart(3, "0")}`, ...rest }; });
fs.writeFileSync(path.join(OUT, "understanding.jsonl"), understanding.map((x) => JSON.stringify(x)).join("\n") + "\n");

// the live sample: the part of the set that goes through the models. Tamil is the priority, so it gets half
const LIVE = { en: 15, ta: 30, tanglish: 15 };
const live = Object.entries(LIVE).flatMap(([k, n]) => shuffle(understanding.filter((x) => x.lang === k), SEED + 1).slice(0, n).map((x) => x.id));
fs.writeFileSync(path.join(OUT, "live60.json"), JSON.stringify({ live60: live }, null, 1) + "\n");

// the address gate: side talk and unnamed commands
const AMB = (n, lang) => `You write what people in a government office in Chennai say to EACH OTHER while a voice assistant is listening in the room. These are side conversations NOT addressed to the assistant: lunch, a phone call, meetings, a colleague's leave, the weather, cricket, traffic on the way in, gossip about a transfer, and also talk that happens to mention work, for example: the Adyar file is on your table; did you see the rain in Velachery yesterday; the Collector wants the report by five; show him the Ambattur figures later; we should compare notes after lunch. Write ${n} sentences in ${lang}. Return only a JSON array of {"text"}.`;
const CMD = (n, lang) => `${SYSTEM}\n\nWrite ${n} direct commands in ${lang} addressed to the assistant WITHOUT using its name, each an imperative that clearly asks the console to do or show something, each naming a place, topic, or page (for example the style of: show Adyar's cases). Use intent values as above. Return the JSON array.`;
const ambient = [];
const AMB_PLAN = { en: [EN, 20, 12], ta: [TA, 20, 16], tanglish: [TG, 20, 12] };
for (const [k, [lang, sides, cmds]] of Object.entries(AMB_PLAN)) {
  for (const [kind, make, n] of [["side", AMB, sides], ["command", CMD, cmds]]) {
    const items = await askModel(DRAFTER, make(n + 6, lang), 0.9);
    const ok = (Array.isArray(items) ? items : []).filter((x) => clean(x.text, k) && fresh(x.text)).slice(0, n);
    ambient.push(...ok.map((x) => ({ text: x.text.trim(), lang: k, kind, ...(kind === "command" && x.intent ? { intent: x.intent } : {}) })));
    await sleep(7000);
  }
}
fs.writeFileSync(path.join(OUT, "ambient.jsonl"), ambient.map((x, i) => JSON.stringify({ id: `b${String(i + 1).padStart(3, "0")}`, ...x })).join("\n") + "\n");

const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(path.join(OUT, f))).digest("hex");
fs.writeFileSync(path.join(OUT, "HASHES.txt"), ["understanding.jsonl", "live60.json", "ambient.jsonl"].map((f) => `${sha(f)} *eval/holdout2/${f}`).join("\n") + "\n");

const count = (rows, key) => rows.reduce((m, x) => ((m[x[key]] = (m[x[key]] ?? 0) + 1), m), {});
const summary = { at: new Date().toISOString(), ...stats, agreed: agreed.length, understanding: understanding.length, byLang: count(understanding, "lang"), byIntent: count(understanding.map((x) => ({ i: x.expect ?? x.intent })), "i"), live: live.length, ambient: ambient.length, ambientKinds: count(ambient.map((x) => ({ k: `${x.lang}/${x.kind}` })), "k") };
fs.writeFileSync(path.join(OUT, "draft-stats.json"), JSON.stringify(summary, null, 1) + "\n");
console.log(JSON.stringify(summary));
