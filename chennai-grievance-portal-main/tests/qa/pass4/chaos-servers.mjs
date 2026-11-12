// QA pass 4 chaos: probes a server that is degraded (store down / corrupt cache / no model key) and records how it answers.
//   node tests/qa/pass4/chaos-servers.mjs <port> <label> > evidence
import { login } from "./lib/access-lib.mjs";
const [port, label] = process.argv.slice(2);
const base = `http://127.0.0.1:${port}`;
const out = { label, port, probes: [] };
const hit = async (name, path, o = {}) => {
  const t = Date.now();
  try {
    const r = await fetch(base + path, { ...o, signal: AbortSignal.timeout(45000), redirect: "manual" });
    const text = await r.text();
    out.probes.push({ name, path, status: r.status, ms: Date.now() - t, type: r.headers.get("content-type"), body: text.slice(0, 300), leaksStack: /\bat .*\(.*:\d+:\d+\)|node_modules|ECONN|undici|E:\\/.test(text) });
  } catch (e) { out.probes.push({ name, path, error: String(e.message), ms: Date.now() - t }); }
};
const j = (cookie, body) => ({ method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
const ck = {};
for (const k of ["collector", "citizenA", "officerA"]) { try { ck[k] = await login(base, k); out.probes.push({ name: `login ${k}`, status: ck[k].status }); } catch (e) { out.probes.push({ name: `login ${k}`, error: String(e.message) }); ck[k] = { cookie: "" }; } }
await hit("login page", "/login");
await hit("home", "/");
await hit("auth me (collector)", "/api/auth/me", { headers: { cookie: ck.collector.cookie } });
await hit("bad login", "/api/auth/login", j("", { email: "x@y.z", password: "nope" }));
await hit("citizen complaints list", "/api/complaints", { headers: { cookie: ck.citizenA.cookie } });
await hit("collector brief", "/api/collector/brief", { headers: { cookie: ck.collector.cookie } });
await hit("collector overview page", "/collector", { headers: { cookie: ck.collector.cookie } });
await hit("assistant status", "/api/collector/assistant/status", { headers: { cookie: ck.collector.cookie } });
await hit("assistant chat (how many open complaints)", "/api/collector/assistant/chat", j(ck.collector.cookie, { message: "how many open complaints are there in Adyar" }));
await hit("thunai agent (how many open complaints)", "/api/collector/thunai/agent", j(ck.collector.cookie, { text: "how many open complaints are there in Adyar", state: {} }));
await hit("map ask", "/api/map/ask", j(ck.collector.cookie, { question: "which ward has most complaints" }));
await hit("collector assistant insights", "/api/collector/assistant/insights", { headers: { cookie: ck.collector.cookie } });
await hit("collector assistant briefing", "/api/collector/assistant/briefing", { headers: { cookie: ck.collector.cookie } });
console.log(JSON.stringify(out, null, 1));
