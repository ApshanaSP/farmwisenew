// QA pass 4: turns a graded run into findings, one for each confident wrong row, grouped by the mechanism behind it. Rows that are wrong but not confident get one finding per mechanism.
//   node tests/qa/pass4/grader/findings.mjs <label> <out-name>     writes docs/qa/pass4/findings/<out-name>.json
// The mechanisms were read from the code and traced row by row (resolveEntity, quickScreen and understand on each sentence). This file names rows, since a finding is about a row; it decides no grade.
// A confident wrong row that no mechanism names comes out as "unclassified", so nothing is dropped.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(here, "..", "..", "..", "..", "..", "docs", "qa", "pass4");

const REPRO = (label) => `QA_P4_SET=open QA_P4_LABEL=${label} npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/grader/run.test.ts; each row is also an it.fails in tests/qa/pass4/grader/open-baseline.findings.test.ts`;

/** Severity: P0 when a code lane states it whatever the model does. P1 when it only shows on a server with no model, or moves the console with no figure said. */
const MECHANISMS = [
  { id: "M01", name: "a place outside the district, beside a word that is also our zone, is read as our zone", severity: "P0", cause: "src/lib/thunai/entities.ts:255 (the outside check is skipped when the only hit is a zone); src/lib/thunai/quick.ts:251-291 (the fast lane builds its screen with no outside check); src/lib/thunai/frame.ts:124 (new-place takes any zone word)",
    rows: ["en-followup-11", "en-other_body-03", "en-other_body-04", "tanglish-other_body-01"] },
  { id: "M02", name: "an everyday word near a zone's name resolves to that zone (அங்க heard as anka, one edit from Anna; அண்ணா யூனிவர்சிட்டி as Anna Nagar)", severity: "P0", cause: "src/lib/thunai/entities.ts:232-233 (wordScore: an edit-distance hit on a one-word alias earns 0.86 and passes the 0.8 bar at 335)",
    rows: ["ta-other_body-03", "ta-other_body-13"] },
  { id: "M03", name: "an order to change a record, with a body's name and the word status in it, gets a brief on that body", severity: "P0", cause: "src/lib/thunai/entities.ts:314 (NOT_A_BRIEF has no change or maathu), src/lib/thunai/privacy.ts:79-84 (asksForbidden has no change-a-status verb in Tanglish)",
    rows: ["tanglish-privacy_safety-14"] },
  { id: "M04", name: "yesterday, last week and last month are not periods the lanes know: the window said is the current one", severity: "P0", cause: "src/lib/thunai/quick.ts:92-97 (periodIn matches week and month anywhere, and has no last or yesterday), src/lib/thunai/quick.ts:291 (period defaults to weekly); src/lib/thunai/understand.ts (the same reading in the rules)",
    rows: ["en-brief-09", "en-list-13", "ta-followup-06", "ta-brief-14", "ta-list-20", "ta-numbers-13"] },
  { id: "M05", name: "up-or-down and which-zone-most questions lose what they ask: a list instead of a comparison, a ranking on all case types instead of the topic", severity: "P0", cause: "src/lib/thunai/quick.ts:284 (ranking drops the category and uses the attention score), src/lib/thunai/quick.ts:290-291 (anything with a category and a period becomes a list)",
    rows: ["en-numbers-06", "tanglish-numbers-03"] },
  { id: "M06", name: "closed cases are told as past their deadline and needing the Collector first", severity: "P0", cause: "src/lib/thunai/screens.ts:133 (overdue comes from the breached flag whatever the status), src/lib/thunai/screens.ts:498-500 (casesSay leads with it); src/lib/thunai/frame.ts:124 (a followed-up case becomes a list)",
    rows: ["en-followup-08"] },
  { id: "M07", name: "a list asked for open cases only comes with closed ones in it, and its total counts them", severity: "P0", cause: "src/lib/thunai/quick.ts:290 (status is only ever overdue: still open and mudiyaadha are dropped)",
    rows: ["tanglish-list-01"] },
  { id: "M08", name: "the word unresolved goes to the fill-in-the-blanks screen, which says there is nothing to complete", severity: "P0", cause: "src/lib/thunai/quick.ts:120 and 258 (unresolved is in COMPLETE)",
    rows: ["en-list-18"] },
  { id: "M09", name: "a false no data: any word before department is taken for an unknown agency", severity: "P0", cause: "src/lib/thunai/entities.ts:264-266",
    rows: ["tanglish-brief-18"] },
  { id: "M10", name: "the next step names a body by the topic, not the body that holds the case", severity: "P1", cause: "src/lib/thunai/screens.ts:200-226 (actionForOne goes by the topic's words), src/lib/thunai/narrate.ts factSheet (next)",
    rows: ["tanglish-explain-02"] },
  { id: "M11", name: "vilakku, street light, fires the explain-this-chart step, and the browser reads a chart out", severity: "P1", cause: "src/lib/thunai/understand.ts:202 (விளக்கு, vilakku and vilakkam mean explain), src/components/collector/app/thunai/Thunai.tsx:503-516 and 657",
    rows: ["en-noisy-09", "ta-list-19", "tanglish-brief-14"] },
  { id: "M12", name: "with no model, the rules put a filter on our data for a place or body outside it", severity: "P1", cause: "src/lib/thunai/understand.ts (no outside check before view steps), src/components/collector/app/thunai/Thunai.tsx:1282",
    rows: ["en-noisy-17", "en-other_body-08", "en-other_body-12", "ta-noisy-17", "ta-other_body-08", "ta-other_body-18", "tanglish-other_body-03", "tanglish-other_body-04", "tanglish-other_body-07", "tanglish-other_body-11", "tanglish-other_body-15", "tanglish-other_body-17", "tanglish-other_body-19"] },
  { id: "M13", name: "with no model, the rules settle on the wrong body or topic with high confidence", severity: "P1", cause: "src/lib/thunai/understand.ts (word and spelling matches: revenue is the corporation's Revenue, பள்ளம் is road damage, a violent-crime sentence reads as VECTOR_DISEASE at 0.95)",
    rows: ["en-brief-15", "ta-explain-19", "ta-numbers-14"] },
  { id: "M14", name: "with no model, a number word opens a case or a zone: second opens the console's own second item, Top five zones opens zone 5", severity: "P1", cause: "src/lib/thunai/understand.ts and normalise.ts (number words become zone and item numbers), src/components/collector/app/thunai/Thunai.tsx:592-599",
    rows: ["en-followup-03", "en-numbers-05"] },
  { id: "M15", name: "with no model, a word near a reservoir's name reads that reservoir out (pannidu heard as Poondi)", severity: "P1", cause: "src/lib/thunai/understand.ts:299",
    rows: ["tanglish-followup-10"] }
];

/** Wrong, not confident: one finding for each. */
const GROUPS = [
  { id: "M20", name: "a code lane takes a data question for a console move, shows a filter, and the model is never asked, on any server", severity: "P1", cause: "src/lib/thunai/plan.ts:327-333 (isNavCommand), src/components/collector/app/thunai/Thunai.tsx:1183",
    rows: ["en-noisy-06", "en-numbers-01", "en-numbers-13", "ta-list-02", "ta-list-10", "ta-list-16", "ta-list-17", "tanglish-list-02"], should: "A question that asks for a list or a number gets a list or a number." },
  { id: "M21", name: "மெதுவா in a question about a slow department slows Jarvis's voice instead", severity: "P1", cause: "src/lib/thunai/plan.ts:336 (speed is a reflex), src/components/collector/app/thunai/Thunai.tsx:1177",
    rows: ["ta-numbers-10"], should: "The question reaches the planner." },
  { id: "M22", name: "a forbidden request moves the console instead of being refused or asked about", severity: "P1", cause: "src/lib/thunai/privacy.ts:79-84 (no verb for release, close all, or change in Tamil and Tanglish), src/lib/thunai/plan.ts:327-333 for the two that a code lane takes on any server",
    rows: ["en-privacy_safety-15", "ta-privacy_safety-04", "ta-privacy_safety-05", "ta-privacy_safety-09", "ta-privacy_safety-16", "tanglish-privacy_safety-11"], should: "Refused or asked about, in code, with the console left alone." },
  { id: "M23", name: "the reply is in the wrong language: the brief's own lines are English, and detectLang misses Tanglish", severity: "P2", cause: "src/lib/thunai/screens.ts:1310 (the zone brief's Tamil line carries points[0].text in English), src/lib/thunai/screens.ts:1262-1268 and stagelocal.ts:301 (brief points are English only, and are read out as they are), src/lib/thunai/normalise.ts:110-113 (a short word list decides)",
    rows: ["ta-brief-02", "ta-followup-01", "tanglish-brief-04", "tanglish-brief-05", "tanglish-brief-07", "tanglish-brief-08", "tanglish-brief-10", "tanglish-other_body-08", "tanglish-privacy_safety-03"], should: "Tamil script for Tamil or Tanglish, the product's own rule (normalise.ts:109, round.ts:105)." }
];

const clip = (s, n) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
function faultWords(r) {
  const out = [];
  for (const [name, v] of Object.entries(r.checks ?? {})) {
    if (v.pass) continue;
    const ev = v.evidence;
    if (name === "1_case") out.push(`it retold ${ev.case_id}, but ${(ev.faults ?? []).map((f) => `its ${f.field} is ${f.got} and ${f.want} was asked`).join("; ")}`);
    else if (name === "1_case_body") out.push(`it names a body other than the holder, ${ev.holder_name}`);
    else if (name === "1_honest_none") out.push(`it says none, and the data holds ${JSON.stringify(ev.oracle)}`);
    else if (name === "2_list") out.push(`${(ev.faults ?? []).length} of the ${ev.rows_checked} rows fail: ${(ev.faults ?? []).slice(0, 3).map((f) => `${f.id} ${f.field} ${f.got}, wanted ${f.want}`).join("; ")}`);
    else if (name === "2_total") out.push(`the total said is ${ev.said}, and the oracle's is ${ev.oracle} (${ev.window})`);
    else if (name === "2_compare") out.push(`the comparison fails: ${JSON.stringify(ev.bad ?? ev).slice(0, 220)}`);
    else if (name === "3_figures") out.push(`these figures are not the oracle's: ${(ev.bad ?? []).slice(0, 5).map((b) => `${b.said} as ${b.as}${b.want?.length ? `, oracle ${b.want.slice(0, 2).join(" or ")}` : ""}`).join("; ")} (${ev.window})`);
    else if (name === "3_screen_figures") out.push(`the screen's tiles: ${(ev.bad ?? []).map((b) => `${b.tile} ${b.shown}, ${b.want.join(" or ")}`).join("; ")}`);
    else if (name === "3_period_words") out.push(`${ev.asked} was asked, and it says ${ev.says}`);
    else if (name === "3_count") out.push(`the count: said ${JSON.stringify(ev.said)}, the oracle ${JSON.stringify(ev.oracle)}`);
    else if (name === "4_open_closed") out.push(`state told wrong: ${JSON.stringify(ev.told_wrong ?? ev.faults).slice(0, 220)}`);
    else if (name === "5_language") out.push(`the reply's language is wrong for a ${r.lang} row`);
    else if (name === "6_scope") out.push(`the scope is wrong: ${JSON.stringify(ev.mismatch ?? ev.step_faults).slice(0, 220)}`);
    else if (name === "6_outside") out.push(`it put ${ev.screen ?? JSON.stringify((ev.steps ?? []).map((s) => s.view ?? s.what ?? s.a))} on our data for ${JSON.stringify(ev.outside)}`);
    else if (name === "6_privacy") out.push(`it did not refuse or ask (did ${ev.did})`);
    else if (name === "7_action") out.push(`${ev.asked} was asked, and it did ${ev.did}`);
    else out.push(name);
  }
  return out.join(". ") || (r.reasons ?? []).join(". ");
}

/** The findings of a graded run. Pure, so its test can feed it a small run. */
export function buildFindings(doc, label, outName) {
  const evidence = `docs/qa/pass4/results/${label}.json`;
  const rows = new Map(doc.rows.map((r) => [r.id, r]));
  const out = [];
  let n = 0;
  const nextId = () => `${outName}-${++n}`;
  const of = new Map(MECHANISMS.flatMap((m) => m.rows.map((id) => [id, m])));
  const cw = doc.rows.filter((r) => r.confident_wrong);
  for (const m of [...MECHANISMS, { id: "M99", name: "not yet traced to a mechanism", severity: "P0", cause: "unknown" }]) {
    for (const r of cw.filter((x) => (of.get(x.id)?.id ?? "M99") === m.id)) {
      out.push({ id: nextId(), area: "jarvis, real path", severity: m.severity, title: `${r.id}: ${m.name}`,
        what_happens: `Said: ${clip(r.text, 200)} -> ${r.lane} lane${r.model_needed ? " (no model answering)" : ""} said: ${clip(r.said, 240)}. ${clip(faultWords(r), 500)}.`,
        what_should_happen: `${r.expect?.action}${r.expect?.zone ? `, zone ${r.expect.zone}` : ""}${r.expect?.body ? `, body ${r.expect.body}` : ""}${r.expect?.topic ? `, topic ${r.expect.topic}` : ""}${r.expect?.status ? `, ${r.expect.status}` : ""}${r.expect?.period ? `, ${r.expect.period}` : ""}${r.expect?.place_outside ? `, outside: ${r.expect.place_outside}` : ""}${r.expect?.body_outside ? `, outside: ${r.expect.body_outside}` : ""}. ${(r.must ?? []).join(" ")}`,
        repro: REPRO(label), evidence: `${evidence}, row ${r.id}`, root_cause_guess: m.cause, class: `${m.id}: ${m.name}`, lang: r.lang, row_id: r.id, mechanism: m.id, model_needed: !!r.model_needed, lane: r.lane });
    }
  }
  for (const g of GROUPS) {
    const hit = g.rows.map((id) => rows.get(id)).filter((r) => r && r.grade === "wrong" && !r.confident_wrong);
    if (!hit.length) continue;
    out.push({ id: nextId(), area: "jarvis, real path", severity: g.severity, title: g.name,
      what_happens: hit.slice(0, 12).map((r) => `${r.id}: ${clip(r.text, 80)} -> ${clip(r.said, 60)}`).join(" | "), what_should_happen: g.should, repro: REPRO(label), evidence: `${evidence}, rows ${hit.map((r) => r.id).join(", ")}`, root_cause_guess: g.cause,
      class: `${g.id}: ${g.name}`, lang: [...new Set(hit.map((r) => r.lang))].join(",") || "all", row_ids: hit.map((r) => r.id), mechanism: g.id });
  }
  const listed = new Set(GROUPS.flatMap((g) => g.rows));
  const left = doc.rows.filter((r) => r.grade === "wrong" && !r.confident_wrong && !listed.has(r.id));
  if (left.length) out.push({ id: nextId(), area: "jarvis, real path", severity: "P2", title: "wrong, not confident, not yet traced to a mechanism", what_happens: left.map((r) => `${r.id}: ${clip(r.reasons?.join("; "), 80)}`).join(" | "), what_should_happen: "", repro: REPRO(label), evidence, root_cause_guess: "unknown", class: "M98: not traced", lang: "all", row_ids: left.map((r) => r.id), mechanism: "M98" });
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [label, outName] = process.argv.slice(2);
  if (!label || !outName) { console.error("usage: findings.mjs <label> <out-name>"); process.exit(2); }
  const doc = JSON.parse(fs.readFileSync(path.join(DOCS, "results", `${label}.json`), "utf8"));
  const list = buildFindings(doc, label, outName);
  fs.writeFileSync(path.join(DOCS, "findings", `${outName}.json`), JSON.stringify(list, null, 1));
  const by = {};
  for (const f of list) by[f.mechanism] = (by[f.mechanism] ?? 0) + 1;
  console.log(JSON.stringify({ findings: list.length, by_mechanism: by }));
}
