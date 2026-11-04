// The 20 follow-ups the acceptance table asks for (understanding.jsonl came back with 15 that carry their earlier sentence).
// Same rule as draft.mjs: written by Gemini without seeing Jarvis's code, frozen by hash before any tuning.
//   node eval/holdout/draft-followups.mjs
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
require("dotenv").config({ path: path.join(process.cwd(), ".env") });

const PROMPT = `You write test sentences for a voice assistant used by the District Collector of Chennai, in a console that shows incidents, complaints, news, rain, reservoirs, air quality, prices and department performance. Zones include Adyar, Anna Nagar, Ambattur, Perungudi, Royapuram, Teynampet, Kodambakkam, Sholinganallur.

Write 20 two-turn exchanges: "after" is the earlier request, and "text" is a follow-up that only makes sense after it. 9 in plain Indian English, 6 in spoken Tamil script, 5 in Tanglish (Tamil in Latin letters). Use a variety of these forms, reworded each time: changing the place ("and in Adyar?"), asking the reason ("why?"), picking from a list ("the second one"), widening the time ("compare with last month"), repeating for another place ("same for Ambattur"), narrowing ("only severe"), changing the view ("as a table"), correcting ("no, Anna Nagar").

"expect" is one object naming what the follow-up really asks for, with: "intent" (one of cases, case, news, readings, ranking, compare, trend, why, performance, dashboard, map, brief, prices, stage_op), and when it applies "place" (the English place name that must now be in focus), "keeps" (true when the earlier request's topic must carry over), "n" (the item number picked).
Return only a JSON array of {"lang":"en"|"ta"|"tanglish","after","text","expect"}.`;

const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.DRAFT_MODEL || "gemini-3.5-flash-lite"}:generateContent`, {
  method: "POST", headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }] }], generationConfig: { temperature: 0.8, responseMimeType: "application/json", maxOutputTokens: 6000 } })
});
if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
const j = await r.json();
const rows = JSON.parse(j.candidates[0].content.parts.map((p) => p.text ?? "").join("").replace(/^```(?:json)?\s*|\s*```$/g, ""));
const out = path.join("eval", "holdout", "followups.jsonl");
fs.writeFileSync(out, rows.slice(0, 20).map((x, i) => JSON.stringify({ id: `f${String(i + 1).padStart(2, "0")}`, ...x })).join("\n") + "\n");

// the planner's frozen sample of understanding.jsonl: 40 by the hash of the id, the first 20 the baseline's like-for-like items
const all = fs.readFileSync(path.join("eval", "holdout", "understanding.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const h = (s) => crypto.createHash("sha256").update(s).digest("hex");
const pick = (lang, n) => all.filter((x) => x.lang === lang).sort((a, b) => h(a.id).localeCompare(h(b.id))).slice(0, n).map((x) => x.id);
const en = pick("en", 16), ta = pick("ta", 13), tg = pick("tanglish", 11);
const first = [...en.slice(0, 8), ...ta.slice(0, 7), ...tg.slice(0, 5)], rest = [...en.slice(8), ...ta.slice(7), ...tg.slice(5)];
fs.writeFileSync(path.join("eval", "holdout", "planner40.json"), JSON.stringify({ baseline20: first, final40: [...first, ...rest] }, null, 1) + "\n");
console.log("followups", rows.length, "planner", first.length, rest.length);
