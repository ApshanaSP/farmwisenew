// "9 severe cases this week. 10 are past their deadline": reads the same Jarvis round the browser sent, and the Collector's own list, to see which numbers disagree.
//   node tests/qa/pass4/final-browser.figures.mjs   (server on PORT, default 3232, signed in through the API; the password is never printed)
import { accounts } from "../seed-local-users.mjs";
const BASE = `http://localhost:${process.env.PORT || 3232}`;
const a = accounts().find((x) => x.key === "collector");
const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: a.email, password: a.password }) });
const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const post = async (p, b) => { const x = await fetch(BASE + p, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(b) }); return { s: x.status, j: await x.json().catch(() => ({})) }; };
const state = (over = {}) => ({ page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 3, lastPlace: null, numbers: false, ...over });
const out = {};
for (const [name, text, over] of [["jarvis sentence (daily screen)", "how many severe incidents this week", {}], ["jarvis sentence (weekly screen)", "how many severe incidents this week", { period: "weekly" }], ["jarvis severe, weekly, sev=severe", "show severe cases", { period: "weekly", sev: "severe" }]]) {
  let last = null;
  for (let round = 0; round < 4; round++) { last = await post("/api/collector/thunai/agent/round", { turnId: `fig${Date.now().toString(36)}${round}`, round, text, turns: [], lastText: null, stage: null, direct: null, state: state(over) }); if (last.j?.done || last.j?.result) break; }
  const st = last.j?.result?.stage; const list = st?.blocks?.find((b) => b.kind === "CaseList");
  out[name] = { http: last.s, recipe: st?.recipe, title: st?.title, say: st?.say?.en, total: list?.total, rows: list?.rows?.length, overdue: list?.rows?.filter((x) => x.overdue).length, sev: list?.rows?.map((x) => x.sev).join(",") };
}
console.log(JSON.stringify(out, null, 1));
// the rain-in-Adyar question in three languages (the browser run answered the Tanglish one with a briefing and the Tamil one with the city's highest reading)
for (const text of ["what is the rainfall in Adyar", "அடையாறு பகுதியில் மழை நிலவரம் என்ன", "Adyar la mazhai nilavaram enna", "Adyar la maze nilavaram enna"]) {
  let last = null;
  for (let round = 0; round < 4; round++) { last = await post("/api/collector/thunai/agent/round", { turnId: `fig${Date.now().toString(36)}${round}x`, round, text, turns: [], lastText: null, stage: null, direct: null, state: state() }); if (last.j?.done || last.j?.result) break; }
  const st = last.j?.result?.stage;
  console.log(JSON.stringify({ text, http: last.s, lane: last.j?.lane, recipe: st?.recipe, title: st?.title, slots: st?.slots, say: st?.say?.en }));
}
