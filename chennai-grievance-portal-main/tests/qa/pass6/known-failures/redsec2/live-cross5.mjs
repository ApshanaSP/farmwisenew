// QA pass 6, redsec2: more Ask District IQ fast-path intents for a locked officer (officerB, GCC-ELE) on an SWM incident id.
// Prints response types, counts and the departments on the cards; never a citizen detail.
import { call } from "../../lib/live.mjs";
const P = 3106, off = { referer: "http://127.0.0.1:3106/officer" };
const gA = await call(P, "officerA", "GET", "/api/officer/grievances?tab=all&period=quarterly");
const id = (gA.text.match(/INC-\d{8}-[A-F0-9]{6}/) ?? [])[0];
const answer = (text) => { for (const b of text.split(/\n\n/)) if (/^event: answer/m.test(b)) { try { return JSON.parse(b.split("\n").find((l) => l.startsWith("data:")).slice(5)); } catch { /* */ } } return null; };
for (const msg of [`incidents like ${id}`, `what should be done about ${id}`, `who is responsible for ${id}`, `where did ${id} happen`]) {
  const c = await call(P, "officerB", "POST", "/api/collector/assistant/chat", { body: { message: msg }, headers: off });
  const a = answer(c.text);
  const depts = [...new Set([...(a?.incidents ?? []).map((x) => x.department), a?.incident?.department].filter(Boolean))];
  console.log(`officerB ${JSON.stringify(msg.replace(id, "<SWM-ID>"))} -> ${c.status} type=${a?.responseType} tools=${JSON.stringify(a?.sources?.tools?.map((t) => t.name))} incidents=${a?.incidents?.length ?? 0} actions=${a?.actions?.length ?? 0} card=${!!a?.incident} depts=${JSON.stringify(depts)} officials=${a?.incident?.officials?.length ?? 0} md=${String(a?.answerMarkdown ?? "").length}ch`);
}
