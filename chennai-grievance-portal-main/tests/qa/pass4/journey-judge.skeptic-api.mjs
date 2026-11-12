// hunt-askiq probe: drives Ask District IQ chat, search and export on :3193. node tests/qa/pass4/hunt-askiq.probe.mjs
import fs from "node:fs";
import { accounts } from "../seed-local-users.mjs";
const BASE = "http://127.0.0.1:3193";
const col = accounts().find((a) => a.key === "collector");
const lg = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: col.email, password: col.password }) });
const cookie = lg.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
async function chat(message, extra = {}) {
  const r = await fetch(`${BASE}/api/collector/assistant/chat`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ message, ...extra }) });
  const t = await r.text();
  const ev = [...t.matchAll(/event: (\w+)\ndata: (.*)/g)].map((m) => [m[1], JSON.parse(m[2])]);
  return { status: r.status, ev, answer: ev.find((e) => e[0] === "answer")?.[1], err: ev.find((e) => e[0] === "error")?.[1] ?? (r.status !== 200 ? t : null) };
}
const Q = process.argv.slice(2).length ? process.argv.slice(2) : [
 "how many complaints today","how many complaints are there in Adyar","top 5 zones by complaints","compare Adyar and Ambattur","complaints last 7 days",
 "garbage complaints in zone 5","zone 99 complaints","zone 0","complaints in Atlantis","show overdue cases","how many severe","<script>alert(1)</script>","'; DROP TABLE complaints;--",
 "குப்பை புகார்கள் எத்தனை","adyar la evlo complaints","what about Ambattur","export the list","download action list","give me 0 complaints","???","a","complaints from 2030","complaints yesterday","complaints on 31 February","how many complaints in Adyar in the last 0 days","ward 500 complaints","percentage of resolved complaints","average resolution time","worst zone","best department","compare zone 1 and zone 1"];
const out = [];
for (const q of Q) { const r = await chat(q); const a = r.answer; out.push({ q, status: r.status, err: r.err, headline: a?.headline ?? a?.text ?? a?.title ?? null, keys: a ? Object.keys(a) : null, a }); console.log(q, "=>", r.status, r.err ? JSON.stringify(r.err) : "", JSON.stringify(a?.headline ?? a?.title ?? a?.text ?? "").slice(0, 160)); }
fs.writeFileSync(process.env.OUT || "../docs/qa/pass4/evidence/journeys/skeptic/api.json", JSON.stringify(out, null, 1));
