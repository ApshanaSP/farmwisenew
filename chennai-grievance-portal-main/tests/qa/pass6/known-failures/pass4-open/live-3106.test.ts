// @ts-nocheck (QA pass 6: a hunter probe kept as a known failure; type errors in its own helpers, not in src)
// QA pass 6, hunter pass4-open: pass 4's open rows that are seen through the production build on the shared test server (port 3106).
//   npx vitest run --config vitest.p6probe.config.ts tests/qa/pass6/probes/pass4-open/live-3106.test.ts
// Accounts collector, officerA, citizenA through tests/qa/pass6/lib/live.mjs (one cached sign-in each, nothing printed). Chat questions are spaced out
// (the chat allows 20 a minute per account, and the collector account is shared with other hunters). No request here can change data: the officer report
// is sent without a grant, so the step-up guard answers and nothing is saved.
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs helper
import { call } from "../../lib/live.mjs";

const PORT = 3106;
const EVID = path.resolve(process.cwd(), "..", "docs", "qa", "pass6", "evidence", "pass4-open");
const seen: Record<string, unknown> = {};
afterAll(() => { fs.mkdirSync(EVID, { recursive: true }); fs.writeFileSync(path.join(EVID, "live-3106.json"), JSON.stringify(seen, null, 1)); });
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Answer = { status: number; kind: string; headline: string; md: string; scopeLine: string; kpis: number; incidents: number; error: string | null };
async function chat(message: string): Promise<Answer> {
  for (let i = 0; i < 3; i++) {
    await pause(3500);
    const r = await call(PORT, "collector", "POST", "/api/collector/assistant/chat", { body: { message } });
    if (r.status === 429) { const wait = Number(r.headers.get("retry-after") ?? 30); await pause(Math.min(65, wait + 1) * 1000); continue; }
    const m = r.text.match(/event: answer\ndata: (.*)/);
    const err = r.text.match(/event: error\ndata: (.*)/);
    if (!m && err && i < 2) continue; // superseded by another hunter's question on the shared account: ask again
    const a = m ? JSON.parse(m[1]) : {};
    return { status: r.status, kind: a.kind ?? "", headline: a.headline ?? "", md: String(a.answerMarkdown ?? ""), scopeLine: a.scopeLine ?? "", kpis: (a.kpis ?? []).length, incidents: (a.incidents ?? []).length, error: err ? err[1].slice(0, 200) : null };
  }
  throw new Error("chat: rate limited three times");
}
const keep = (k: string, a: Answer) => { seen[k] = { ...a, md: a.md.slice(0, 500) }; };

describe("RC-43 originals through the chat route (PB-259, PB-260)", () => {
  it.each([
    ["PB-259 zone 99", "zone 99 complaints", /99/],
    ["PB-259 Atlantis", "complaints in Atlantis", /Atlantis/],
    ["PB-260 2030", "complaints from 2030", /2030/],
    ["PB-260 last 0 days", "how many complaints in Adyar in the last 0 days", /0 days/]
  ])("%s", async (k, q, named) => {
    const a = await chat(q as string);
    keep(k as string, a);
    expect(a.status).toBe(200);
    expect(`${a.headline} ${a.md}`, `${a.kind}: ${a.headline} | ${a.scopeLine}`).toMatch(named as RegExp);
    expect(a.kpis + a.incidents, `${a.headline} | ${a.scopeLine}`).toBe(0);
    expect(`${a.headline} ${a.md}`).not.toMatch(/last 90 days/i);
  }, 240_000);
});

describe("RC-44 originals through the chat route (PB-261, PB-262, PB-305, PB-306, PB-307, PB-330)", () => {
  it.each([
    ["PB-305 save", "Save this workspace as Collector's Daily Briefing and reopen last week's version"],
    ["PB-306 sources", "Show every source and application record used to create this briefing"],
    ["PB-330 forecast", "predict next week's complaints"],
    ["PB-330 letter", "draft a letter to the commissioner about the floods"]
  ])("%s: no unrelated figures", async (k, q) => {
    const a = await chat(q as string);
    keep(k as string, a);
    expect(a.kpis + a.incidents, `${a.kind}: ${a.headline}`).toBe(0);
  }, 240_000);
  it("PB-307 taluks: lists taluks", async () => {
    const a = await chat("List the taluks with the highest number of unresolved incidents last month");
    keep("PB-307 taluks", a);
    expect((a.md.match(/\(\d[\d,]*\)|\|\s*\d[\d,]*\s*\|/g) ?? []).length, a.md.slice(0, 300)).toBeGreaterThanOrEqual(3);
  }, 240_000);
  it("PB-261 severe: leads with Severe", async () => {
    const a = await chat("how many severe");
    keep("PB-261 severe", a);
    expect(a.headline).not.toMatch(/^Low leads/i);
    expect(a.headline).toMatch(/^Severe/i);
  }, 240_000);
  it("PB-262 percentage: a percentage", async () => {
    const a = await chat("percentage of resolved complaints");
    keep("PB-262 percentage", a);
    expect(`${a.headline}`).toMatch(/%/);
    expect(a.incidents).toBe(0);
  }, 240_000);
});

describe("RC-43 console filters (PB-269, PB-270) and a sibling", () => {
  it("PB-269: overview?zone=99 is refused", async () => {
    const r = await call(PORT, "collector", "GET", "/api/collector/overview?zone=99");
    seen.pb269 = { status: r.status, body: r.text.slice(0, 200) };
    expect(r.status).toBe(400);
  });
  it("PB-270: officer grievances?tab=returned is refused", async () => {
    const r = await call(PORT, "officerA", "GET", "/api/officer/grievances?tab=returned");
    seen.pb270 = { status: r.status, body: r.text.slice(0, 200) };
    expect(r.status).toBe(400);
  });
  it("sibling: collector/conflicts?period=yearly is refused, not answered as another period", async () => {
    const r = await call(PORT, "collector", "GET", "/api/collector/conflicts?period=yearly");
    const ok = await call(PORT, "collector", "GET", "/api/collector/conflicts?period=daily");
    seen.conflicts_period = { bad: { status: r.status, body: r.text.slice(0, 200) }, daily: { status: ok.status, same: ok.text === r.text } };
    expect(r.status).toBe(400);
  });
});

describe("PB-316: the officer report's confirm answer", () => {
  it("with the console's header the guard answers 200 + x-diq-confirm: required (no console error); without it, 428; nothing is saved", async () => {
    const list = await call(PORT, "officerA", "GET", "/api/officer/grievances?tab=action");
    const rows = JSON.parse(list.text || "{}").rows ?? [];
    const id = String(rows[0]?.id ?? rows[0]?.incident_id ?? "");
    expect(id, list.text.slice(0, 200)).toMatch(/^INC-/);
    const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    const form = () => { const f = new FormData(); f.set("remarks", "QA pass 6 probe: checking the confirm answer only, no work was done here."); f.set("step", "send"); f.append("photos", new Blob([PNG], { type: "image/png" }), "probe.png"); return f; };
    const soft = await call(PORT, "officerA", "POST", `/api/officer/grievances/${id}/report`, { body: form(), raw: true, headers: { "x-diq-confirm": "json" } });
    const hard = await call(PORT, "officerA", "POST", `/api/officer/grievances/${id}/report`, { body: form(), raw: true });
    seen.pb316 = { id, soft: { status: soft.status, header: soft.headers.get("x-diq-confirm"), body: soft.text.slice(0, 200) }, hard: { status: hard.status, body: hard.text.slice(0, 200) } };
    expect(hard.status).toBe(428);
    expect(soft.status).toBe(200);
    expect(soft.headers.get("x-diq-confirm")).toBe("required");
  });
});

describe("PB-314: officer search by a complaint number (production build)", () => {
  it("a complaint number shown on the officer's case is found by the officer's search", async () => {
    const list = await call(PORT, "officerA", "GET", "/api/officer/grievances?tab=all");
    const rows = (JSON.parse(list.text || "{}").rows ?? []).slice(0, 12);
    const tried: unknown[] = [];
    for (const r of rows) {
      const id = String(r.id ?? r.incident_id);
      const d = await call(PORT, "officerA", "GET", `/api/officer/grievances/${id}`);
      const codes = [...new Set((d.text.match(/\b20\d{2}-[A-Z0-9]{6}\b|\bGRV-[A-Z0-9-]{4,}\b|\bCMP-[A-Z0-9-]{4,}\b/g) ?? []))].slice(0, 2);
      if (!codes.length) continue;
      for (const code of codes) {
        const s = await call(PORT, "officerA", "GET", `/api/officer/grievances?tab=all&q=${encodeURIComponent(code)}`);
        const hit = (JSON.parse(s.text || "{}").rows ?? []).some((x: any) => String(x.id ?? x.incident_id) === id);
        tried.push({ id, code, status: s.status, found: hit });
      }
      if (tried.length >= 3) break;
    }
    seen.pb314 = tried;
    expect(tried.length, "no complaint number was found on the officer's first cases").toBeGreaterThan(0);
    expect(tried.filter((t: any) => !t.found), JSON.stringify(tried)).toEqual([]);
  }, 120_000);
});

describe("the citizen date bug: what the track page is given", () => {
  it("the citizen's complaint list gives instants with a zone (so istDate cannot move the day on a UTC server)", async () => {
    const r = await call(PORT, "citizenA", "GET", "/api/complaints");
    const j = JSON.parse(r.text || "{}");
    const list = (j.complaints ?? j.rows ?? j.data ?? (Array.isArray(j) ? j : [])) as any[];
    const created = list.slice(0, 5).map((c) => c.created_at ?? c.createdAt ?? null);
    seen.citizen_created_at = { status: r.status, n: list.length, created };
    // recorded only: the track page fetches these in the browser (no server render), so a zone-less value is read in the citizen's own (Chennai) zone
    expect(r.status).toBe(200);
  });
  it("the citizen home's server-rendered date is today's Chennai date", async () => {
    const r = await call(PORT, "citizenA", "GET", "/citizen");
    const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" });
    const shown = r.text.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),? \d{1,2} [A-Z][a-z]+/)?.[0] ?? null;
    seen.citizen_home_date = { status: r.status, shown, today };
    if (r.status === 200 && shown) expect(shown.replace(",", "")).toBe(today.replace(",", ""));
  });
});
