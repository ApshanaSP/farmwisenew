// QA pass 6, redsec2: does officerB's Ask District IQ answer about officerA's incident carry its title (key paths only)?
import { call } from "../../lib/live.mjs";
const P = 3106, off = { referer: "http://127.0.0.1:3106/officer" };
const gA = await call(P, "officerA", "GET", "/api/officer/grievances?tab=all&period=quarterly");
const id = (gA.text.match(/INC-\d{8}-[A-F0-9]{6}/) ?? [])[0];
const d = JSON.parse((await call(P, "officerA", "GET", `/api/officer/grievances/${id}`)).text);
const title = String((d.grievance ?? d).title ?? "");
const c = await call(P, "officerB", "POST", "/api/collector/assistant/chat", { body: { message: `tell me about ${id}` }, headers: off });
const blocks = c.text.split(/\n\n/);
const paths = (v, p = "", out = []) => { if (typeof v === "string") { if (v.includes(title) || v.includes(id)) out.push(p); } else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) paths(x, `${p}.${k}`, out); return out; };
for (const b of blocks) {
  const ev = (b.match(/^event: (\w+)/m) ?? [])[1]; const line = b.split("\n").find((l) => l.startsWith("data:"));
  if (!line) continue; let j; try { j = JSON.parse(line.slice(5)); } catch { continue; }
  const p = paths(j);
  if (ev !== "status" || p.length) console.log(ev, "paths with SWM title/id:", JSON.stringify(p).slice(0, 300), "| headline:", JSON.stringify(String(j.card?.headline ?? j.headline ?? "").split(title).join("<SWM-TITLE>").split(id).join("<SWM-ID>")).slice(0, 160));
}
// the incident card's fields (names and sizes only), and which tool built it
for (const b of blocks) {
  if (!/^event: answer/m.test(b)) continue;
  const j = JSON.parse(b.split("\n").find((l) => l.startsWith("data:")).slice(5));
  const inc = j.incident ?? {};
  console.log("tool:", JSON.stringify(j.sources?.tools?.map((t) => t.name)), "| route/lane:", JSON.stringify(j.route ?? j.lane ?? j.kind ?? j.display ?? null));
  console.log("incident card fields:", Object.entries(inc).map(([k, v]) => `${k}:${Array.isArray(v) ? `[${v.length}]` : typeof v === "string" ? `${v.length}ch` : typeof v}`).join(" "));
  console.log("department on the card:", JSON.stringify(inc.department ?? inc.dept ?? null), "| answerMarkdown length:", String(j.answerMarkdown ?? "").length);
}
