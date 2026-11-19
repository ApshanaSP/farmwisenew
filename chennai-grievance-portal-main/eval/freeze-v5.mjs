/**
 * Freezes the v5 build's two drafted sets (section 6.5) WITHOUT printing a row: counts only. Run from the app folder:
 *   node eval/freeze-v5.mjs <drafts folder>
 * The drafts folder holds sidetalk-draft.jsonl + sidetalk-labels.jsonl and dev200-draft.jsonl + dev200-labels.jsonl, written by two
 * agents that saw no code and no eval file (a drafter, then a blind labeller that saw only id, text, lang and any earlier sentence).
 * A row the labeller read differently from the drafter is dropped. Then a seeded, language-balanced choice:
 *   eval/sidetalk200/ambient.jsonl  200 side lines (+ every agreed unnamed command), rows {id, text, lang, kind}
 *   eval/dev200/understanding.jsonl 200 sentences (70 en, 70 ta, 60 tanglish), rows as eval/holdout/understanding.jsonl;
 *   eval/dev200/live60.json         {"live60": [all 200 ids]} (the runner takes its id list from that file)
 * and HASHES.txt beside each (sha256 of the text with \n line ends: the runner's own check, holdout.live.ts).
 * The person running this never reads the rows; neither does the build's lead. Nothing here is tuned on.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";

const SEED = 20261115;
const dir = process.argv[2];
if (!dir) throw new Error("usage: node eval/freeze-v5.mjs <drafts folder>");
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
const norm = (s) => String(s).normalize("NFC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const shuffle = (xs, r) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const hashOf = (file) => crypto.createHash("sha256").update(fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n")).digest("hex");
const writeSet = (rel, text) => { fs.mkdirSync(path.dirname(rel), { recursive: true }); fs.writeFileSync(rel, text); };
const count = (xs, k) => xs.reduce((o, x) => ((o[x[k]] = (o[x[k]] ?? 0) + 1), o), {});
const LANGS = ["en", "ta", "tanglish"];
const NAME = /jarvis|ஜார்விஸ்|ஜார்விஸ/i;

// ---- side talk
{
  const draft = read("sidetalk-draft.jsonl"), labels = new Map(read("sidetalk-labels.jsonl").map((x) => [x.id, x.kind]));
  const seen = new Set();
  const dropped = { disagreed: 0, unlabelled: 0, named: 0, duplicate: 0, badShape: 0 };
  const kept = [];
  for (const x of draft) {
    if (!x || typeof x.text !== "string" || !LANGS.includes(x.lang) || !["side", "command"].includes(x.kind)) { dropped.badShape++; continue; }
    if (!labels.has(x.id)) { dropped.unlabelled++; continue; }
    if (labels.get(x.id) !== x.kind) { dropped.disagreed++; continue; }
    if (NAME.test(x.text)) { dropped.named++; continue; }
    const k = norm(x.text);
    if (seen.has(k)) { dropped.duplicate++; continue; }
    seen.add(k);
    kept.push({ id: x.id, text: x.text, lang: x.lang, kind: x.kind });
  }
  const r = rng(SEED);
  const side = kept.filter((x) => x.kind === "side"), cmd = kept.filter((x) => x.kind === "command");
  // 200 side lines, as even across the three forms as the agreed lines allow
  const by = Object.fromEntries(LANGS.map((l) => [l, shuffle(side.filter((x) => x.lang === l), r)]));
  const pick = [];
  for (let i = 0; pick.length < 200 && LANGS.some((l) => by[l][i]); i++) for (const l of LANGS) if (by[l][i] && pick.length < 200) pick.push(by[l][i]);
  const rows = shuffle([...pick, ...cmd], r);
  const rel = "eval/sidetalk200/ambient.jsonl";
  writeSet(rel, rows.map((x) => JSON.stringify(x)).join("\n") + "\n");
  writeSet("eval/sidetalk200/HASHES.txt", `${hashOf(rel)} *${rel}\n`);
  console.log(JSON.stringify({ set: "sidetalk200", drafted: draft.length, dropped, agreedSide: side.length, side: pick.length, sideByLang: count(pick, "lang"), commands: cmd.length, commandsByLang: count(cmd, "lang") }));
}

// ---- the dev set
{
  const INTENTS = new Set(["cases", "case", "news", "readings", "ranking", "compare", "trend", "why", "performance", "dashboard", "map", "nearby", "brief", "prices", "navigate", "save", "insight", "complete", "general", "refuse", "changed", "explain", "situation"]);
  const gold = (x) => (x.intent === "followup" && x.expect ? (typeof x.expect === "string" ? x.expect : x.expect.intent) : x.intent);
  const draft = read("dev200-draft.jsonl"), labels = new Map(read("dev200-labels.jsonl").map((x) => [x.id, x.intent]));
  const seen = new Set();
  const dropped = { disagreed: 0, unlabelled: 0, badIntent: 0, duplicate: 0, badShape: 0, digit: 0 };
  const kept = [];
  for (const x of draft) {
    if (!x || typeof x.text !== "string" || !LANGS.includes(x.lang)) { dropped.badShape++; continue; }
    if (!INTENTS.has(gold(x))) { dropped.badIntent++; continue; }
    if (!labels.has(x.id)) { dropped.unlabelled++; continue; }
    if (labels.get(x.id) !== gold(x)) { dropped.disagreed++; continue; }
    if (/\d/.test(x.text)) { dropped.digit++; continue; }
    const k = norm(x.text) + "|" + norm(x.after ?? "");
    if (seen.has(k)) { dropped.duplicate++; continue; }
    seen.add(k);
    kept.push({ id: x.id, text: x.text, intent: x.intent, places: Array.isArray(x.places) ? x.places : [], lang: x.lang, ...(x.after ? { after: x.after } : {}), ...(x.expect ? { expect: x.expect } : {}) });
  }
  const r = rng(SEED + 1);
  const want = { en: 70, ta: 70, tanglish: 60 };
  const pick = LANGS.flatMap((l) => shuffle(kept.filter((x) => x.lang === l), r).slice(0, want[l]));
  const rows = shuffle(pick, r);
  const rel = "eval/dev200/understanding.jsonl", ids = "eval/dev200/live60.json";
  writeSet(rel, rows.map((x) => JSON.stringify(x)).join("\n") + "\n");
  writeSet(ids, JSON.stringify({ live60: rows.map((x) => x.id) }) + "\n");
  writeSet("eval/dev200/HASHES.txt", `${hashOf(rel)} *${rel}\n${hashOf(ids)} *${ids}\n`);
  const intents = rows.reduce((o, x) => ((o[gold(x)] = (o[gold(x)] ?? 0) + 1), o), {});
  console.log(JSON.stringify({ set: "dev200", drafted: draft.length, dropped, agreed: kept.length, kept: rows.length, byLang: count(rows, "lang"), followups: rows.filter((x) => x.after).length, byIntent: intents }));
}
