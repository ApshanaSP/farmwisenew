/**
 * v6: the latency waterfall from the real runs (tests/e2e/real6.spec.ts's eval/v6/latency/<tag>-<part>.json). Every figure gets its
 * n, p50 and p90 (nearest rank, as the v5 specs: the value at floor(n * p) of the sorted list). Times are ms from the clip's TRUE last
 * voiced sample. A stage's span is the difference of two stamps of the same turn; turns missing either stamp are left out of it.
 *   node scripts/jarvis6/waterfall.mjs <tag> [<tag2> ...]     -> eval/v6/latency/<tag>-waterfall.md (and .json)
 */
import fs from "fs";
import path from "path";

const DIR = path.join("eval", "v6", "latency");
export function pct(xs, p) { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; }
const stat = (xs) => { const v = xs.filter((x) => typeof x === "number" && Number.isFinite(x)); return { n: v.length, p50: pct(v, 0.5), p90: pct(v, 0.9) }; };
const fmt = (s) => (s.n ? `${s.n} · ${s.p50} · ${s.p90}` : "0 · - · -");

const SPANS = [
  ["detector lag (true end → detector's last voiced sample)", (t) => t.zeroVsTrue],
  ["end-of-turn wait (last voiced → end decided)", (t) => d(t, "voicedEnd", "eou")],
  ["upload (end decided → upload sent)", (t) => d(t, "eou", "uploadSent")],
  ["server → speech-to-text sent", (t) => d(t, "uploadSent", "sttSent")],
  ["speech-to-text (sent → decode back)", (t) => d(t, "sttSent", "sttBack")],
  ["transcript to the page (decode back → page has it)", (t) => d(t, "sttBack", "hearBack")],
  ["address gate and rules", (t) => d(t, "hearBack", "gateDone")],
  ["gate → planner call sent", (t) => d(t, "gateDone", "plannerSent")],
  ["planner (call sent → back)", (t) => d(t, "plannerSent", "plannerBack")],
  ["tools and first sentence (planner back → tools done)", (t) => d(t, "plannerBack", "toolsDone")],
  ["first streamed event (gate → first event)", (t) => d(t, "gateDone", "firstEvent")],
  ["to speak() (gate → speak called)", (t) => d(t, "gateDone", "speakCalled")],
  ["TTS (speak called → voice start)", (t) => d(t, "speakCalled", "voiceStart")]
];
const d = (t, a, b) => (t.at?.[a] != null && t.at?.[b] != null ? t.at[b] - t.at[a] : null);

const tags = process.argv.slice(2);
if (!tags.length) { console.error("usage: node scripts/jarvis6/waterfall.mjs <tag> ..."); process.exit(2); }
for (const tag of tags) {
  const files = fs.readdirSync(DIR).filter((f) => f.startsWith(`${tag}-`) && f.endsWith(".json") && !f.endsWith("-waterfall.json"));
  const out = { tag, parts: {} };
  let md = `# Latency waterfall: ${tag}\n\nFrom \`eval/v6/latency/${tag}-*.json\` (tests/e2e/real6.spec.ts). Each cell: **n · p50 · p90**, ms. Ends are from the clip's true last voiced sample; stage spans are between two stamps of the v5 trace in the same turn (server stages placed on the page clock at the request that sent them).\n`;
  for (const f of files.sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    const rows = j.rows.filter(Boolean);
    const lanes = {};
    for (const r of rows) { const l = r.trace?.lane ?? "none"; lanes[l] = (lanes[l] ?? 0) + 1; }
    const ends = {
      "first sound (any: earcon, voice)": stat(rows.map((r) => r.firstSound)),
      "first speech (a voice, not a tone)": stat(rows.map((r) => r.firstSpeech)),
      "answer handed to the voice (console's finding mark)": stat(rows.map((r) => r.handed)),
      "first word of the answer (the voice's own start)": stat(rows.map((r) => r.finding)),
      "voice start delay (handed → first word)": stat(rows.map((r) => (r.finding != null && r.handed != null ? r.finding - r.handed : null))),
      "end of the answer": stat(rows.map((r) => r.answerEnd)),
      "screen change": stat(rows.map((r) => r.screen)),
      "transcript at the page (transcribed mark)": stat(rows.map((r) => r.transcribed))
    };
    const firstKinds = {};
    for (const r of rows) firstKinds[r.firstSoundKind ?? "none"] = (firstKinds[r.firstSoundKind ?? "none"] ?? 0) + 1;
    const spans = Object.fromEntries(SPANS.map(([name, fn]) => [name, stat(rows.map((r) => (r.trace ? fn(r.trace) : null)))]));
    out.parts[j.part] = { n: rows.length, lanes, firstKinds, ends, spans, woke: rows.some((r) => "woke" in r) ? rows.filter((r) => r.woke).length : undefined };
    md += `\n## ${j.part} (${rows.length} turns; lanes ${Object.entries(lanes).map(([k, v]) => `${k} ${v}`).join(", ")}; first sound ${Object.entries(firstKinds).map(([k, v]) => `${k} ${v}`).join(", ")}${out.parts[j.part].woke != null ? `; woke ${out.parts[j.part].woke}/${rows.length}` : ""})\n\n| Moment, from the end of speech | n · p50 · p90 |\n|---|---|\n`;
    for (const [k, v] of Object.entries(ends)) md += `| ${k} | ${fmt(v)} |\n`;
    md += `\n| Stage | n · p50 · p90 |\n|---|---|\n`;
    for (const [k, v] of Object.entries(spans)) md += `| ${k} | ${fmt(v)} |\n`;
  }
  fs.writeFileSync(path.join(DIR, `${tag}-waterfall.md`), md);
  fs.writeFileSync(path.join(DIR, `${tag}-waterfall.json`), JSON.stringify(out, null, 1));
  console.log(md);
}
