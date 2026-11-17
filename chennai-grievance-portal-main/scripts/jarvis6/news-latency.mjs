/**
 * v6 Phase 4: the spoken news turns from tests/e2e/real6.spec.ts (V6_PARTS=news): n · p50 · p90 (nearest rank, as waterfall.mjs), ms from
 * the clip's true end of speech, for the reads ("Read the Nth article.", English and Tamil) and the web look-ups apart.
 *   node scripts/jarvis6/news-latency.mjs v6b     -> eval/v6/latency/v6b-news-summary.md
 */
import fs from "fs";
import path from "path";
const tag = process.argv[2] || "v6b";
const DIR = path.join("eval", "v6", "latency");
const j = JSON.parse(fs.readFileSync(path.join(DIR, `${tag}-news.json`), "utf8"));
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };
const stat = (xs) => { const v = xs.filter((x) => typeof x === "number" && Number.isFinite(x)); return v.length ? `${v.length} · ${pct(v, 0.5)} · ${pct(v, 0.9)}` : "0 · - · -"; };
const rows = j.rows.filter(Boolean);
const groups = [["Reads (\"Read the Nth article.\", EN and TA)", rows.filter((r) => /^news_(read|ta_read)/.test(r.clip))], ["Web look-ups (Met department, rain, red alert)", rows.filter((r) => /^news_look/.test(r.clip))]];
const lines = [
  ["taken by the news lane (marks present) / asked", (rs) => `${rs.filter((r) => r.newsFirst != null).length} / ${rs.length}`],
  ["first sound (the end-of-speech earcon)", (rs) => stat(rs.map((r) => r.firstSound))],
  ["the server's first line in hand (\"Reading The Hindu's report...\")", (rs) => stat(rs.map((r) => r.newsFirst))],
  ["the first line's voice starts", (rs) => stat(rs.map((r) => r.firstLineVoice))],
  ["the brief in hand (article read and answered)", (rs) => stat(rs.map((r) => r.newsBrief))],
  ["the brief's first sentence starts in the voice", (rs) => stat(rs.map((r) => r.briefVoice))],
  ["related coverage in hand", (rs) => stat(rs.map((r) => r.newsRelated))],
  ["the coverage brief in hand", (rs) => stat(rs.map((r) => r.newsCoverage))],
  ["the turn done (every event in)", (rs) => stat(rs.map((r) => r.newsDone))],
  ["transcript at the page", (rs) => stat(rs.map((r) => r.transcribed))]
];
let md = `# The news turn, spoken: ${tag}\n\nFrom \`eval/v6/latency/${tag}-news.json\` (tests/e2e/real6.spec.ts, V6_PARTS=news: real providers, Edge's natural voices, synthetic clips, live outlets). The news list is put on Jarvis's screen as a tap on an offered step builds it; then "Hey Jarvis" and the clip. Each cell: **n · p50 · p90**, ms from the clip's true end of speech.\n\n| Moment | ${groups.map((g) => g[0]).join(" | ")} |\n|---|${groups.map(() => "---").join("|")}|\n`;
for (const [name, fn] of lines) md += `| ${name} | ${groups.map((g) => fn(g[1])).join(" | ")} |\n`;
md += `\nHeard: ${rows.map((r) => `${r.clip} "${r.heard}"`).join("; ")}.\n`;
fs.writeFileSync(path.join(DIR, `${tag}-news-summary.md`), md);
console.log(md);
