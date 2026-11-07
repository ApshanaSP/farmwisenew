// QA pass 4 chaos: a server with no model key, asked things only a model could do, and sent malformed bodies. It must say it cannot, not invent.
//   node tests/qa/pass4/chaos-nokey.mjs <port>
import { login } from "./lib/access-lib.mjs";
const base = `http://127.0.0.1:${process.argv[2]}`;
const STATE = { page: "overview", period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false };
const { cookie } = await login(base, "collector");
const post = async (p, body, raw) => { const t = Date.now(); try { const r = await fetch(base + p, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: raw ?? JSON.stringify(body), signal: AbortSignal.timeout(60000) }); return { status: r.status, ms: Date.now() - t, body: (await r.text()) }; } catch (e) { return { error: String(e.cause?.code || e.message), ms: Date.now() - t }; } };
const out = { agent: [], chat: [], malformed: [] };
const qs = ["draft a polite letter to the Commissioner about repeated flooding in Adyar", "predict how many complaints Adyar will get next week", "why are complaints rising in Adyar and what should I do", "summarise the whole city situation in two lines", "tell me a joke about potholes", "which officer is the laziest", "how many complaints will be resolved by Friday"];
for (const q of qs) {
  const a = await post("/api/collector/thunai/agent", { text: q, state: STATE, turns: [] });
  let r; try { r = JSON.parse(a.body).result; } catch { r = null; }
  out.agent.push({ q, status: a.status, ms: a.ms, kind: r?.kind, reply: r?.reply ?? r?.say ?? null, note: r?.note, model: r?.model, raw: r ? undefined : a.body?.slice(0, 200) });
  const c = await post("/api/collector/assistant/chat", { message: q });
  const ans = /event: answer\ndata: (.*)/.exec(c.body || "");
  let o = null; try { o = ans ? JSON.parse(ans[1]) : null; } catch { /* partial */ }
  out.chat.push({ q, status: c.status, ms: c.ms, kind: o?.kind, headline: o?.headline, md: o?.answerMarkdown?.slice(0, 300), caveats: o?.caveats, err: o ? undefined : (c.body || c.error)?.slice(0, 300) });
}
for (const [n, p, raw] of [["agent: not json", "/api/collector/thunai/agent", "{{{"], ["agent: empty body", "/api/collector/thunai/agent", ""], ["agent: 5 MB text", "/api/collector/thunai/agent", JSON.stringify({ text: "x".repeat(5e6), state: STATE })], ["chat: not json", "/api/collector/assistant/chat", "nope"], ["chat: 100k message", "/api/collector/assistant/chat", JSON.stringify({ message: "a ".repeat(50000) })], ["chat: number message", "/api/collector/assistant/chat", JSON.stringify({ message: 5 })], ["map: not json", "/api/map/ask", "[]"], ["memory: null byte", "/api/collector/thunai/memory", JSON.stringify({ op: "note", text: "a\u0000b" })], ["login: array body", "/api/auth/login", "[1,2]"]]) {
  const r = await post(p, null, raw); out.malformed.push({ n, status: r.status, error: r.error, ms: r.ms, body: (r.body || "").slice(0, 120) });
}
console.log(JSON.stringify(out, null, 1));
