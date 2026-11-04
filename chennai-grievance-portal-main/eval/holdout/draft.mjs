// Drafts the held-out sets with Gemini, with a prompt that does not see Jarvis's rules or lexicon, so they are not written
// to fit the code. Run once in Phase 0: the output is frozen by hash (HASHES.txt) before any tuning.
//   node eval/holdout/draft.mjs
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
require("dotenv").config({ path: path.join(process.cwd(), ".env") });
const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.DRAFT_MODEL || "gemini-3.5-flash-lite";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(prompt) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST", headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9, responseMimeType: "application/json", maxOutputTokens: 8000 } })
    });
    if (r.status === 429 || r.status >= 500) { console.warn("retry", r.status); await sleep(20000); continue; }
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const t = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return JSON.parse(t.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  }
  throw new Error("gave up");
}

const SYSTEM = `You write test sentences for a voice assistant used by the District Collector of Chennai, India, in the console where they watch civic incidents, complaints, news, rain, reservoirs, air quality, market prices and department performance. The 15 zones of Chennai are: Thiruvottiyur, Manali, Madhavaram, Tondiarpet, Royapuram, Thiru-Vi-Ka Nagar, Ambattur, Anna Nagar, Teynampet, Kodambakkam, Valasaravakkam, Alandur, Adyar, Perungudi, Sholinganallur. Other places: Velachery, Mylapore, T Nagar, Guindy, Egmore. Reservoirs: Chembarambakkam, Puzhal, Poondi, Cholavaram, Veeranam. Departments: Metro Water (CMWSSB), Storm Water Drains, Solid Waste Management, Greater Chennai Police, PWD Water Resources, GCC Public Health, GCC Electrical. Speak the way a busy senior official actually talks to an aide: half sentences, varied word order, natural phrasing, some long and some very short. Do not repeat a sentence pattern.

Every item has "intent", exactly one of:
cases (list incidents or complaints, optionally by severity, place, department, topic, period) | case (one incident in depth) | news | readings (rain, air quality, reservoir level at a place or all) | ranking (top or worst N of something) | compare (two or more places or departments side by side) | trend (a measure over time) | why (reasons behind a change) | performance (department-wise or zone-wise performance) | dashboard (build a multi-part screen on a topic) | map (show something on a map) | nearby (places within a distance of something) | brief (the day's situation or summary) | prices (market prices) | navigate (go to a page, open a panel, change a filter or period on the console, no question) | save (save the current view as a named workspace, pin it, or remember a note) | insight (find what stands out, outliers, anomalies, unusual rises) | complete (fill in missing data in a table or dataset, or list what is unresolved) | general (a general-knowledge question unrelated to the district) | refuse (asks to send, approve, delete, or reveal private citizen data) | followup (only makes sense after an earlier sentence).
And "places": the zone or place names mentioned, in English spelling (empty list if none). Return only a JSON array of objects {"text","intent","places"}.`;

const REQ = (n, lang, extra) => `${SYSTEM}\n\nWrite ${n} items in ${lang}. ${extra}`;
const EN = "plain Indian English";
const TA = "Tamil script only, spoken Chennai Tamil, not literary";
const TG = "Tanglish: Tamil written in Latin letters mixed with English words, as typed in WhatsApp in Chennai (for example the style of: Adyar la enna nadakkudhu)";

// the plan: 150 in all (EN 60, TA 50, Tanglish 40), with follow-ups and the owner's own intents in every language
const MIX = "Cover these intents about evenly: cases, news, readings, ranking, compare, trend, why, performance, dashboard, map, nearby, brief, prices, navigate.";
const OWNER = "Use only these intents, evenly: compare, insight, complete, save, general, refuse.";
const FOLLOW = 'Each item is a follow-up that only makes sense after an earlier sentence. Add a field "after" with that earlier sentence (in the same language) and set intent to "followup", with a field "expect" naming what the follow-up really asks for (same intent names as above). Include forms like: and in Adyar?, why?, the second one, compare with last month, same for Ambattur, only severe.';

const out = { en: [], ta: [], tanglish: [] };
const plan = [
  ["en", EN, 38, MIX], ["en", EN, 14, OWNER], ["en", EN, 8, FOLLOW],
  ["ta", TA, 32, MIX], ["ta", TA, 11, OWNER], ["ta", TA, 7, FOLLOW],
  ["tanglish", TG, 25, MIX], ["tanglish", TG, 10, OWNER], ["tanglish", TG, 5, FOLLOW]
];
for (const [k, lang, n, extra] of plan) {
  const items = await ask(REQ(n, lang, extra));
  out[k].push(...items.slice(0, n).map((x) => ({ ...x, lang: k })));
  console.log(k, n, "->", items.length);
  await sleep(7000);
}
const understanding = [...out.en, ...out.ta, ...out.tanglish].map((x, i) => ({ id: `u${String(i + 1).padStart(3, "0")}`, ...x }));
fs.writeFileSync(path.join("eval", "holdout", "understanding.jsonl"), understanding.map((x) => JSON.stringify(x)).join("\n") + "\n");

// ambient: side conversation, and unnamed commands
const AMB = (n, lang) => `You write what people in a government office in Chennai say to EACH OTHER while a voice assistant is listening in the room. These are side conversations NOT addressed to the assistant: lunch, a phone call, meetings, a colleague's leave, the weather, cricket, traffic on the way in, gossip about a transfer, and also talk that happens to mention work, for example: the Adyar file is on your table; did you see the rain in Velachery yesterday; the Collector wants the report by five; show him the Ambattur figures later; we should compare notes after lunch. Write ${n} sentences in ${lang}. Return only a JSON array of {"text"}.`;
const CMD = (n, lang) => `${SYSTEM}\n\nWrite ${n} direct commands in ${lang} addressed to the assistant WITHOUT using its name, each an imperative that clearly asks the console to do or show something, each naming a place, topic, or page (for example the style of: show Adyar's cases). Use intent values as above. Return the JSON array.`;
const ambient = [];
for (const [k, lang, n] of [["en", EN, 16], ["ta", TA, 12], ["tanglish", TG, 12]]) {
  const a = await ask(AMB(n, lang)); ambient.push(...a.slice(0, n).map((x) => ({ text: x.text, lang: k, kind: "side" }))); await sleep(7000);
  const c = await ask(CMD(n, lang)); ambient.push(...c.slice(0, n).map((x) => ({ text: x.text, lang: k, kind: "command", intent: x.intent }))); await sleep(7000);
}
fs.writeFileSync(path.join("eval", "holdout", "ambient.jsonl"), ambient.map((x, i) => JSON.stringify({ id: `a${String(i + 1).padStart(3, "0")}`, ...x })).join("\n") + "\n");
console.log("understanding", understanding.length, "ambient", ambient.length);
