// QA pass 4: TIME TRAVEL. For each frozen moment and each time zone, starts a server on 3141 at that moment, reads the console, trends, briefing,
// officer overview and Ask District IQ's "yesterday / this week / last month", and compares with the independent oracle (tests/qa/oracle/pinned.mjs)
// at the same moment. No model is called.
//   node tests/qa/pass4/time-travel.mjs [--only name] [--tz UTC|Asia/Kolkata]      writes docs/qa/pass4/evidence/time-travel.json
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Http, EVIDENCE_DIR } from "./same-number.mjs";
import { loadOracle, fmtWall, wallMs } from "../oracle/pinned.mjs";

const PORT = 3141;
const MOMENTS = [
  ["before-asof", "2026-11-05T18:31:00.000Z", "clock earlier than the store's as-of: the console must use the as-of"],
  ["just-before-ist-midnight", "2026-11-06T18:29:30.000Z", "23:59:30 IST on 6 Nov"],
  ["just-after-ist-midnight", "2026-11-06T18:31:00.000Z", "00:01 IST on 7 Nov (still 6 Nov in UTC)"],
  ["monday-morning", "2026-11-09T03:30:00.000Z", "Monday 9 Nov 09:00 IST"],
  ["month-end", "2026-11-30T18:29:30.000Z", "23:59:30 IST on 30 Nov"],
  ["month-start", "2026-11-30T18:31:00.000Z", "00:01 IST on 1 Dec"],
  ["year-end", "2026-12-31T18:29:30.000Z", "23:59:30 IST on 31 Dec 2026"],
  ["new-year", "2026-12-31T18:31:00.000Z", "00:01 IST on 1 Jan 2027"],
  ["pongal", "2027-01-14T06:30:00.000Z", "Pongal, 14 Jan 2027 12:00 IST"],
  ["empty-period", "2027-06-01T06:30:00.000Z", "months after the last data: every window is empty"]
];
const TZS = ["UTC", "Asia/Kolkata"];
const FIG = { reported: "reported", severe: "severe", complaints: "complaints_ongoing", ongoing: "ongoing", resolved: "resolved", severe_open: "severe_open", complaint_inc: "complaint_inc", urgent: "urgent" };
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? null : process.argv[i + 1]; };
const node = process.execPath, srv = path.resolve("tests/qa/pass4/server.mjs");
const stop = () => { try { execFileSync(node, [srv, "stop", "--port", String(PORT)], { stdio: "ignore" }); } catch { /* */ } };
const istDate = (ms) => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
const bad = (s) => /\bNaN\b|\bInfinity\b|\bundefined\b|\[object Object\]/.test(s);

async function chat(h, q) {
  const r = await h.post("collector", "/api/collector/assistant/chat", { message: q, consoleScope: { period: "weekly", zone: null, dept: null, cat: null, taluk: null } }, {}, ["chat", 3300]);
  const m = r.text.match(/event: answer\ndata: (.*)/);
  const a = m ? JSON.parse(m[1]) : null;
  return { status: r.status, headline: a?.headline ?? null, n: a?.kpis?.[0]?.value ?? null, md: a?.answerMarkdown ?? null, raw: a ? null : r.text.slice(0, 300) };
}

const out = { ran_at: new Date().toISOString(), moments: [], problems: [] };
const note = (m, tz, what, detail) => { out.problems.push({ moment: m, tz, what, ...detail }); console.log("PROBLEM", m, tz, what, JSON.stringify(detail).slice(0, 240)); };

for (const [name, iso, why] of MOMENTS) for (const tz of TZS) {
  if (arg("only") && arg("only") !== name) continue;
  if (arg("tz") && arg("tz") !== tz) continue;
  stop();
  const ms = Date.parse(iso), clockWall = fmtWall(ms + 330 * 60_000);
  execFileSync(node, [srv, "start", "--port", String(PORT), "--frozen", iso, "--instance", "tt", "--env", `TZ=${tz}`], { stdio: "ignore", timeout: 150000 });
  const rec = { moment: name, why, iso, tz, clockWallIST: clockWall, checks: [] };
  try {
    const o = loadOracle({ clock: clockWall });
    rec.oracleNow = o.now;
    const h = new Http(PORT);
    for (const period of ["daily", "weekly", "monthly", "quarterly"]) {
      const r = await h.get("collector", `/api/collector/overview?period=${period}`);
      if (r.status !== 200) { note(name, tz, "overview not 200", { period, status: r.status }); continue; }
      if (r.json.now !== o.now) note(name, tz, "console now differs from the oracle", { period, app: r.json.now, oracle: o.now });
      if (bad(r.text)) note(name, tz, "overview has NaN/undefined text", { period });
      for (const [k, def] of Object.entries(FIG)) {
        const app = r.json.kpi?.cur?.[k], want = o.value(def, { period });
        const ok = Number(app) === want;
        rec.checks.push({ surface: "overview", period, figure: k, app, oracle: want, ok });
        if (!ok) note(name, tz, "overview figure differs from the oracle", { period, figure: k, app, oracle: want });
      }
      const l = await h.get("collector", `/api/collector/list?period=${period}`);
      const total = l.json?.incidents ?? null, want = o.value("reported", { period });
      rec.checks.push({ surface: "list.total", period, app: total, oracle: want, ok: total === want });
      if (total !== null && total !== want) note(name, tz, "list total differs from the oracle", { period, app: total, oracle: want });
    }
    for (const part of ["briefing", "trends"]) {
      const r = await h.get("collector", `/api/collector/insights?period=weekly&part=${part}`);
      const ok = r.status === 200 && r.json?.now === o.now && !bad(r.text);
      rec.checks.push({ surface: `insights.${part}`, status: r.status, now: r.json?.now, ok });
      if (!ok) note(name, tz, `insights ${part} wrong`, { status: r.status, now: r.json?.now, oracle: o.now, badText: bad(r.text) });
    }
    const ob = await h.get("officerA", "/api/officer/overview");
    rec.checks.push({ surface: "officer/overview", status: ob.status, ok: ob.status === 200 && !bad(ob.text) });
    if (ob.status !== 200 || bad(ob.text)) note(name, tz, "officer overview failed", { status: ob.status, badText: bad(ob.text) });
    const bf = await h.post("collector", "/api/collector/assistant/briefing", {});
    const expectDate = istDate(wallMs(o.now) - 330 * 60_000);
    const nm = bf.json?.name ?? "";
    rec.checks.push({ surface: "briefing.name", name: nm, expectDate, ok: nm.includes(expectDate) });
    if (!nm.includes(expectDate)) note(name, tz, "saved briefing carries the wrong date", { name: nm, expectedISTDate: expectDate, status: bf.status });
    // Jarvis words. Wall times are IST written as if UTC, so a UTC day boundary is an IST midnight.
    const nowMs = wallMs(o.now), dayStart = Math.floor(nowMs / 86400000) * 86400000;
    const sumC = (lo, hi) => o.layers.effective.filter((r) => r.t != null && r.t > lo && r.t <= hi).reduce((a, r) => a + (Number(r.complaints) || 0), 0);
    const exp = {
      yesterday: { cal: sumC(dayStart - 86400000 - 1, dayStart - 1), roll: sumC(nowMs - 48 * 3600e3, nowMs - 24 * 3600e3) },
      "this week": { roll7: o.value("complaints_all", { period: "weekly" }) },
      "last month": { roll30: o.value("complaints_all", { period: "monthly" }) }
    };
    for (const w of ["yesterday", "this week", "last month"]) {
      const a = await chat(h, `how many complaints ${w}`);
      const n = typeof a.n === "number" ? a.n : Number(String(a.n).replace(/,/g, ""));
      const matches = Object.entries(exp[w]).filter(([, v]) => v === n).map(([k]) => k);
      rec.checks.push({ surface: `chat:${w}`, headline: a.headline, n, expected: exp[w], matches, ok: matches.length > 0 });
      if (!a.headline) note(name, tz, `Jarvis "${w}" gave no answer`, { status: a.status, raw: a.raw });
      else if (!matches.length) note(name, tz, `Jarvis "${w}" number matches no window`, { headline: a.headline, n, expected: exp[w] });
      if (bad(a.md ?? "")) note(name, tz, `Jarvis "${w}" text has NaN/undefined`, { md: a.md?.slice(0, 200) });
    }
    const log = fs.readFileSync(path.resolve("data/aws-cache/qa/run/srv-3141.log"), "utf8");
    const errs = log.split("\n").filter((x) => /error|exception|unhandled/i.test(x)).slice(0, 5);
    if (errs.length) note(name, tz, "server log has errors", { errs });
  } catch (e) { note(name, tz, "run crashed", { error: String(e).slice(0, 300) }); }
  out.moments.push(rec);
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE_DIR, "time-travel.json"), JSON.stringify(out, null, 1));
}
stop();
console.log(`done: ${out.moments.length} runs, ${out.problems.length} problem(s)`);
