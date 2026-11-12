// QA pass 6, redsec2: more phrasings on an SWM incident as officerB (types, tools, departments on the card only).
import { call } from "../../lib/live.mjs";
const P = 3106, off = { referer: "http://127.0.0.1:3106/officer" };
const gA = await call(P, "officerA", "GET", "/api/officer/grievances?tab=all&period=quarterly");
const id = (gA.text.match(/INC-\d{8}-[A-F0-9]{6}/) ?? [])[0];
const answer = (text) => { for (const b of text.split(/\n\n/)) if (/^event: answer/m.test(b)) { try { return JSON.parse(b.split("\n").find((l) => l.startsWith("data:")).slice(5)); } catch { /* */ } } return null; };
for (const msg of [`next steps for ${id}`, `actions for ${id}`, `timeline of ${id}`, `status of ${id}`, `who are the officials on ${id}`]) {
  const c = await call(P, "officerB", "POST", "/api/collector/assistant/chat", { body: { message: msg }, headers: off });
  const a = answer(c.text);
  console.log(`officerB ${JSON.stringify(msg.replace(id, "<SWM-ID>"))} -> ${c.status} type=${a?.responseType} tools=${JSON.stringify(a?.sources?.tools?.map((t) => t.name))} card=${!!a?.incident} dept=${JSON.stringify(a?.incident?.department ?? null)} actions=${JSON.stringify((a?.actions ?? []).map((g) => g.items?.length))} officials=${a?.incident?.officials?.length ?? 0}`);
}
