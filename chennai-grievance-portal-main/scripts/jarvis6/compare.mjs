/**
 * v6: before/after on the moments the brief targets, from two runs of tests/e2e/real6.spec.ts (eval/v6/latency/<tag>-<part>.json).
 * Every cell: n · p50 · p90 (nearest rank, as waterfall.mjs). Pooled rows join the parts named.
 *   node scripts/jarvis6/compare.mjs phase0 v6a    -> eval/v6/latency/compare-phase0-v6a.md
 */
import fs from "fs";
import path from "path";

const DIR = path.join("eval", "v6", "latency");
const [A, B] = process.argv.slice(2);
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };
const stat = (xs) => { const v = xs.filter((x) => typeof x === "number" && Number.isFinite(x)); return v.length ? `${v.length} · ${pct(v, 0.5)} · ${pct(v, 0.9)}` : "0 · - · -"; };
const rows = (tag, parts) => parts.flatMap((p) => { const f = path.join(DIR, `${tag}-${p}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")).rows.filter(Boolean) : []; });
const isHey = (r) => /zira|mark|puck/.test(r.clip);
const lines = [
  ["Wake, open, \"Hey Jarvis\" -> first audible reply", (t) => rows(t, ["wake"]).filter(isHey).map((r) => r.firstSound)],
  ["Wake, open, \"Hi/Hello Jarvis\" and Tamil -> first audible reply", (t) => rows(t, ["wake"]).filter((r) => !isHey(r)).map((r) => r.firstSound)],
  ["Wake, open, all -> first audible reply", (t) => rows(t, ["wake"]).map((r) => r.firstSound)],
  ["Wake, closed -> first audible reply (fired / tried in the first column)", (t) => rows(t, ["closed"]).map((r) => r.firstSound)],
  ["Command -> the screen changes", (t) => rows(t, ["cmd"]).map((r) => r.screen)],
  ["Command -> first sound", (t) => rows(t, ["cmd"]).map((r) => r.firstSound)],
  ["Question (EN, TA, Tanglish) -> first sound", (t) => rows(t, ["en", "ta", "tg"]).map((r) => r.firstSound)],
  ["Question -> first word of the answer", (t) => rows(t, ["en", "ta", "tg"]).map((r) => r.finding)],
  ["  English", (t) => rows(t, ["en"]).map((r) => r.finding)],
  ["  Tamil", (t) => rows(t, ["ta"]).map((r) => r.finding)],
  ["  Tanglish", (t) => rows(t, ["tg"]).map((r) => r.finding)],
  ["Question -> the whole answer in hand (the console's answer mark)", (t) => rows(t, ["en", "ta", "tg"]).map((r) => r.answerReady)],
  ["Question -> the answer's last word spoken", (t) => rows(t, ["en", "ta", "tg"]).map((r) => r.answerEnd)],
  ["Voice start (answer handed -> its first word)", (t) => rows(t, ["cmd", "en", "ta", "tg"]).map((r) => (r.finding != null && r.handed != null ? r.finding - r.handed : null))],
  ["Transcript at the page (questions)", (t) => rows(t, ["en", "ta", "tg"]).map((r) => r.transcribed)]
];
let md = `# Before / after: ${A} -> ${B}\n\nFrom \`eval/v6/latency/${A}-*.json\` and \`${B}-*.json\` (tests/e2e/real6.spec.ts: real providers, Edge's natural voices, synthetic clips, ms from each clip's true end of speech). Each cell: **n · p50 · p90**.\n\n| Moment | ${A} | ${B} |\n|---|---|---|\n`;
for (const [name, fn] of lines) md += `| ${name} | ${stat(fn(A))} | ${stat(fn(B))} |\n`;
const closed = (t) => { const r = rows(t, ["closed"]); return `${r.filter((x) => x.woke).length}/${r.length}`; };
md += `\nClosed wakes that fired: ${A} ${closed(A)}, ${B} ${closed(B)}. Heard in the wrong language (a clip's language against what Whisper returned, by script): ${["en", "cmd"].map((p) => `${p}: ${A} ${rows(A, [p]).filter((r) => /[஀-௿]/.test(r.heard ?? "")).length}/${rows(A, [p]).length}, ${B} ${rows(B, [p]).filter((r) => /[஀-௿]/.test(r.heard ?? "")).length}/${rows(B, [p]).length}`).join("; ")}.\n`;
fs.writeFileSync(path.join(DIR, `compare-${A}-${B}.md`), md);
console.log(md);
