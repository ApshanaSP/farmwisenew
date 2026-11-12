// QA pass 6, redsec2: where another department's incident id shows up in officerB's map and chat answers (key paths only).
import { call } from "../../lib/live.mjs";
const P = 3106, off = { referer: "http://127.0.0.1:3106/officer" };
const gA = await call(P, "officerA", "GET", "/api/officer/grievances?tab=all&period=quarterly");
const id = (gA.text.match(/INC-\d{8}-[A-F0-9]{6}/) ?? [])[0];
const detailA = await call(P, "officerA", "GET", `/api/officer/grievances/${id}`);
let titleA = ""; try { titleA = JSON.parse(detailA.text).grievance?.title ?? JSON.parse(detailA.text).title ?? ""; } catch { /* */ }
const words = titleA.split(/\s+/).filter((w) => w.length >= 5).slice(0, 3);
const paths = (v, p = "", out = []) => { if (typeof v === "string") { if (v.includes(id) || (words.length && words.every((w) => v.includes(w)))) out.push(p); } else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) paths(x, `${p}.${k}`, out); return out; };
const m = await call(P, "officerB", "POST", "/api/map/ask", { body: { text: null, plan: null, prev: null, context: { zone: null, taluk: null, incidentId: id, ward: null, drawn: null } }, headers: off });
try { console.log("map: paths holding the SWM id or its title words:", JSON.stringify(paths(JSON.parse(m.text))).slice(0, 600)); } catch { console.log("map not json"); }
const c = await call(P, "officerB", "POST", "/api/collector/assistant/chat", { body: { message: `tell me about ${id}` }, headers: off });
const events = c.text.split(/\n\n/).map((b) => { const d = b.split("\n").find((l) => l.startsWith("data:")); try { return { ev: (b.match(/^event: (\w+)/m) ?? [])[1], d: JSON.parse(d.slice(5)) }; } catch { return null; } }).filter(Boolean);
const fin = events.filter((e) => e.ev !== "status").pop();
console.log("chat events", events.map((e) => e.ev).join(","), "| final paths with SWM id/title:", JSON.stringify(paths(fin?.d)).slice(0, 500));
console.log("chat headline:", JSON.stringify(fin?.d?.card?.headline ?? fin?.d?.headline ?? "").slice(0, 160), "| incident card title present:", !!fin?.d?.card?.incident, "| title words found:", words.length ? words.every((w) => c.text.includes(w)) : "n/a");
