// A second, unseen set of 20 follow-ups, drafted after the fixes that came from reading the first set's failures, and run once: the first set stopped being held out when it was read.
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
  body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }] }], generationConfig: { temperature: 0.95, responseMimeType: "application/json", maxOutputTokens: 6000 } })
});
if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
const j = await r.json();
const rows = JSON.parse(j.candidates[0].content.parts.map((p) => p.text ?? "").join("").replace(/^```(?:json)?\s*|\s*```$/g, ""));
const out = path.join("eval", "holdout", process.env.FOLLOWUPS_OUT ?? "followups.jsonl");
fs.writeFileSync(out, rows.slice(0, 20).map((x, i) => JSON.stringify({ id: `f${String(i + 1).padStart(2, "0")}`, ...x })).join("\n") + "\n");

console.log("followups", rows.length);
