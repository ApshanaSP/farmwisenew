// QA pass 4: word pattern audit. Lists every regex, keyword list and includes() matcher in src/lib/thunai and src/lib/assistant (TypeScript compiler API),
// compiles what it can, and runs each over every real title, category and place in the pinned snapshot plus an adversarial corpus.
// A hit is "mid-word" when the match starts inside a longer word ("tree" in "street", விளக்கு in தெருவிளக்கு), and "extends" when it only ends inside one
// ("leak" in "leakage": usually fine, so listed apart). Output: docs/qa/pass4/evidence/word-patterns.json and .md.   node tests/qa/pass4/word-pattern-audit.mjs
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { APP_ROOT, loadTable } from "../oracle/load.mjs";

const EVID = path.resolve(APP_ROOT, "..", "docs", "qa", "pass4", "evidence");
const DIRS = ["src/lib/thunai", "src/lib/assistant"].map((d) => path.join(APP_ROOT, d));
const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== "__tests__") walk(p); }
    else if (/\.ts$/.test(e.name) && !/\.(test|live|pass\d)\.ts$|\.cases\.ts$/.test(e.name)) files.push(p);
  }
};
DIRS.forEach(walk);

// ---- 1. static scan
const items = [];
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true);
  const rel = path.relative(APP_ROOT, f).replace(/\\/g, "/");
  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const visit = (n) => {
    if (ts.isRegularExpressionLiteral(n)) {
      const m = /^\/([\s\S]*)\/([a-z]*)$/.exec(n.text);
      items.push({ kind: "regex", file: rel, line: line(n), source: m[1], flags: m[2] });
    } else if (ts.isNewExpression(n) && n.expression.getText() === "RegExp" && n.arguments?.[0] && ts.isStringLiteralLike(n.arguments[0])) {
      items.push({ kind: "regex", file: rel, line: line(n), source: n.arguments[0].text, flags: n.arguments[1] && ts.isStringLiteralLike(n.arguments[1]) ? n.arguments[1].text : "" });
    } else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ["includes", "indexOf", "startsWith", "endsWith"].includes(n.expression.name.text)
      && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0]) && n.arguments[0].text.length >= 2) {
      const recv = n.expression.expression.getText();
      if (!/^\[/.test(recv)) items.push({ kind: "includes", file: rel, line: line(n), method: n.expression.name.text, needle: n.arguments[0].text, receiver: recv.slice(0, 40) });
    } else if (ts.isArrayLiteralExpression(n) && n.elements.length >= 3 && n.elements.every((e) => ts.isStringLiteralLike(e))) {
      const words = n.elements.map((e) => e.text);
      if (words.every((w) => w.length <= 40) && words.some((w) => /\p{L}{3,}/u.test(w))) items.push({ kind: "list", file: rel, line: line(n), words });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

// ---- 2. corpus
const T = path.join(APP_ROOT, "data", "aws-cache", "qa", "pinned", "tables");
const inc = loadTable("incidents", T).objects();
const uniq = (a) => [...new Set(a.filter(Boolean).map((x) => String(x).trim()))];
const corpus = {
  title: uniq(inc.map((r) => r.title)),
  category: uniq([...inc.map((r) => r.category_label), ...loadTable("ref_categories", T).objects().map((r) => r.label)]),
  place: uniq([...inc.map((r) => r.place_text), ...inc.map((r) => r.zone_name)])
};
corpus.adversarial = [
  "street light not working", "streetlight out", "tree fell on the street", "treetop wires", "street tree branch", "main street drain", "dustbin overflow", "pothole on the road", "carpool lane",
  "water logging near subway", "waterfall road", "cattle near the bus stand", "battle road", "the leakage of gas", "broadcast of news", "road rage", "abroad", "cross road", "railroad crossing", "ward 12", "forward the file", "toward the sea",
  "overdue bills", "severe weather", "several complaints", "eastern road", "least affected", "yeast", "fire station", "campfire", "sewage", "message", "passage", "garbage truck", "electric pole", "electrician", "electricity board",
  "how many are open", "show me the opening hours", "sanitation", "total", "metro rail", "metronome", "police", "closed", "disclosed", "enclosed", "reopened", "open", "unopened",
  "zone", "ozone", "milestone", "adyar", "ambattur", "ennore", "guindy", "ward", "reward", "steward", "awarded",
  "தெருவிளக்கு", "விளக்கு எரியவில்லை", "தெரு விளக்கு", "மரம் விழுந்தது", "மரங்கள்", "குப்பை", "குப்பைத்தொட்டி", "குப்பைகள்", "தண்ணீர்", "குடிநீர்", "கழிவுநீர்", "சாலை", "சாலையோரம்", "நெடுஞ்சாலை", "மின்சாரம்", "மின்கம்பம்", "மின்விளக்கு", "பள்ளம்", "பள்ளிக்கூடம்", "பள்ளி", "மழை", "மழைநீர்", "திறந்த", "திறக்கப்படாத", "மூடிய", "எத்தனை", "எத்தனையோ", "காவல்", "காவலர்", "தீ", "தீர்வு", "தீவிரம்", "அடையாறு", "வார்டு", "மண்டலம்", "புகார்", "புகார்கள்", "வடிகால்", "வடிகாலில்", "நாய்", "நாயுடு", "கொசு", "கொசுத்தொல்லை",
  "enna complaint irukku", "street light eriyala", "kuppai ellam", "road la pallam", "thanneer varala", "mazhai neer", "adyar la evlo", "ward 5 la open", "sewage overflow", "no water supply", "dog bite", "stray cattle", "fallen tree on road", "fire accident", "flooded subway"
];

// ---- 3. matching
const WORD = /[\p{L}\p{M}\p{N}]/u;
const isW = (c) => !!c && WORD.test(c);
function classify(text, idx, len) {
  const startsMid = isW(text[idx - 1]) && isW(text[idx]);
  const endsMid = isW(text[idx + len]) && isW(text[idx + len - 1]);
  return startsMid ? "mid-word" : endsMid ? "extends" : "whole";
}
function matchesOf(item, text) {
  const out = [];
  if (item.kind === "regex") {
    const re = new RegExp(item.re.source, item.re.flags.replace(/[gy]/g, "") + "g");
    let m, n = 0;
    while ((m = re.exec(text)) && n++ < 20) { if (!m[0]) { re.lastIndex++; continue; } if (m[0].length < (/[஀-௿]/.test(m[0]) ? 3 : 4)) continue; out.push({ at: m.index, hit: m[0] }); }
  } else {
    const t = text.toLowerCase();
    for (const w of item.needles) { let i = -1, n = 0; while ((i = t.indexOf(w, i + 1)) >= 0 && n++ < 20) out.push({ at: i, hit: w }); }
  }
  return out;
}

const report = [], uncompiled = [], runnable = [];
for (const it of items) {
  if (it.kind === "regex") {
    try {
      it.re = new RegExp(it.source, it.flags);
      // a pattern built from character classes, \d, \w, any-char or backreferences is a shape, not a word: "inside a word" does not apply
      if (/\[|\\[dDwWsS1-9]|(^|[^\\])\.|\{\d/.test(it.source)) it.shape = true; else runnable.push(it);
    }
    catch (e) { uncompiled.push({ file: it.file, line: it.line, source: it.source.slice(0, 100), error: String(e.message).slice(0, 80) }); }
  } else {
    const ws = it.kind === "includes" ? [it.needle.toLowerCase()] : it.words.map((w) => w.toLowerCase());
    // a needle with a space or symbol at its edge is deliberately delimited
    it.needles = ws.filter((w) => w.length >= (/[஀-௿]/.test(w) ? 3 : 4) && isW(w[0]) && isW(w[w.length - 1]));
    if (it.needles.length) runnable.push(it);
  }
}
for (const it of runnable) {
  const hits = { "mid-word": new Map(), extends: new Map() };
  for (const [cname, texts] of Object.entries(corpus)) for (const text of texts) {
    const hay = it.kind === "regex" ? text : text.toLowerCase();
    for (const m of matchesOf(it, hay)) {
      const c = classify(hay, m.at, m.hit.length);
      if (c === "whole") continue;
      const box = hits[c]; const e = box.get(m.hit) ?? { hit: m.hit, count: 0, examples: [] };
      e.count++; if (e.examples.length < 3) e.examples.push({ corpus: cname, text: text.slice(0, 90) }); box.set(m.hit, e);
    }
  }
  const mid = [...hits["mid-word"].values()].sort((a, b) => b.count - a.count), ext = [...hits.extends.values()].sort((a, b) => b.count - a.count);
  if (mid.length || ext.length) report.push({
    kind: it.kind, file: it.file, line: it.line,
    pattern: it.kind === "regex" ? `/${it.source}/${it.flags}`.slice(0, 160) : it.kind === "includes" ? `${it.receiver}.${it.method}("${it.needle}")` : `[${it.words.slice(0, 8).join(", ")}${it.words.length > 8 ? ", ..." : ""}]`,
    mid_word: mid.slice(0, 12), mid_word_total: mid.reduce((a, b) => a + b.count, 0), extends: ext.slice(0, 5), extends_total: ext.reduce((a, b) => a + b.count, 0)
  });
}
const realMid = (r) => r.mid_word.some((h) => h.examples.some((e) => e.corpus !== "adversarial"));
report.sort((a, b) => Number(realMid(b)) - Number(realMid(a)) || b.mid_word_total - a.mid_word_total);
const summary = {
  files: files.length, regexes: items.filter((i) => i.kind === "regex").length, regexes_not_compiled: uncompiled.length, includes_matchers: items.filter((i) => i.kind === "includes").length,
  keyword_lists: items.filter((i) => i.kind === "list").length, patterns_run: runnable.length, shape_regexes_skipped: items.filter((i) => i.shape).length, corpus: Object.fromEntries(Object.entries(corpus).map(([k, v]) => [k, v.length])),
  patterns_with_mid_word_hits: report.filter((r) => r.mid_word.length).length, patterns_with_mid_word_hits_on_real_data: report.filter(realMid).length
};
fs.mkdirSync(EVID, { recursive: true });
fs.writeFileSync(path.join(EVID, "word-patterns.json"), JSON.stringify({ summary, uncompiled, report, inventory: items.map(({ re, ...r }) => r) }, null, 1));
const md = ["# Word pattern audit (pass 4)", "", "Made by tests/qa/pass4/word-pattern-audit.mjs. A mid-word hit starts inside a longer word. \"extends\" only ends inside one (often a fine stem match).", "",
  "```json", JSON.stringify(summary, null, 1), "```", "", "## Mid-word matches (worst first, real data first)", ""];
for (const r of report.filter((x) => x.mid_word.length).slice(0, 80)) {
  md.push(`- \`${r.file}:${r.line}\` ${r.kind} ${r.pattern} : ${r.mid_word_total} hits`);
  for (const h of r.mid_word.slice(0, 4)) md.push(`  - "${h.hit}" x${h.count}, e.g. [${h.examples[0].corpus}] ${h.examples[0].text}`);
}
md.push("", "## Not compiled", ...uncompiled.map((u) => `- ${u.file}:${u.line} ${u.error}`));
fs.writeFileSync(path.join(EVID, "word-patterns.md"), md.join("\n"));
console.log(JSON.stringify(summary));
