// QA pass 6, hunter pass4-open: pass 4's open RC-38 (PB-314) and RC-15 rows, re-checked on this tree on the pinned snapshot (real intel.ts, officer data, Jarvis path).
//   QA_PIN_PORT=3197 timeout 600 npx vitest run --config vitest.qa4.config.ts --dir tests/qa/pass6/probes/pass4-open p6-rc38-15
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// only under vitest.qa4.config.ts (dry-run store reading the pinned snapshot on 127.0.0.1); under another config this file stops before any import runs
vi.hoisted(() => { if (!(process.env.QA_GROQ_ONLY === "1" && process.env.AWS_STORE_DRY_RUN === "1" && /^http:\/\/127\.0\.0\.1:/.test(process.env.AWS_API_URL ?? ""))) throw new Error("pass4-open probe: run with vitest.qa4.config.ts only"); });
import "@/lib/collector/derive";
import { asOf, overview } from "@/lib/collector/intel";
import { deptProfile, search as officerSearch } from "@/lib/officer/data";
import { clearCaches } from "@/lib/thunai/round";
import { browserWorld, ClientSim, runConversation } from "../../../../../../../../tests/qa/pass4/grader/client-sim";

const FROZEN = "2026-11-06T06:30:00.000Z";
const EVID = path.resolve(process.cwd(), "..", "docs", "qa", "pass6", "evidence", "pass4-open");
const seen: Record<string, unknown> = {};
let world: any, list: any;
beforeAll(async () => { vi.useFakeTimers({ toFake: ["Date"], now: new Date(FROZEN) }); await asOf(); ({ world, list } = await browserWorld()); }, 300_000);
afterAll(() => { vi.useRealTimers(); fs.mkdirSync(EVID, { recursive: true }); fs.writeFileSync(path.join(EVID, "p6-rc38-15.json"), JSON.stringify(seen, null, 1)); });

describe("PB-314: the officer search finds a complaint by its complaint number", () => {
  it("a citizen complaint that is already in an incident of the department is found by its number", async () => {
    const db = (await import("@/lib/collector/db")).default;
    const [rows] = await db.query<any[]>(`SELECT e.source_record_id AS code, e.incident_id AS id, i.lead_dept AS dept FROM events e JOIN incidents i ON i.incident_id = e.incident_id
      WHERE e.source = 'grievance' AND e.source_record_id IS NOT NULL AND i.lead_dept IS NOT NULL ORDER BY e.reported_at DESC LIMIT 5`);
    expect(rows.length).toBeGreaterThan(0);
    const out: unknown[] = [];
    let found = 0;
    for (const r of rows) {
      const dept = await deptProfile(String(r.dept));
      if (!dept) continue;
      const byId = (await officerSearch(dept, String(r.id))).some((x: any) => String(x.id ?? x.incident_id) === String(r.id));
      const byCode = (await officerSearch(dept, String(r.code))).some((x: any) => String(x.id ?? x.incident_id) === String(r.id));
      out.push({ code: r.code, id: r.id, dept: r.dept, byId, byCode });
      if (byCode) found++;
    }
    seen.pb314 = out;
    // the incident id search works (the control); the complaint number search is the bug
    expect(out.some((x: any) => x.byId), JSON.stringify(out)).toBe(true);
    expect(found, JSON.stringify(out)).toBe(out.length);
  });
});

describe("RC-15 on the real data", () => {
  it("PB-302 sibling: the Collector's My Tasks reasons do not say 'Severe severity'", async () => {
    const o: any = await overview("weekly" as never, null);
    const because = (o.tasks?.rows ?? []).flatMap((r: any) => r.because ?? []);
    seen.pb302_because = [...new Set(because)].slice(0, 10);
    expect(because.length).toBeGreaterThan(0);
    expect(because.filter((b: string) => /Severe severity/.test(b))).toEqual([]);
  });

  it.each([
    ["PB-281 orig", "remind me at 5 pm to call the zone officer", /5(:00)?\s*(pm|PM)|17:00|மாலை 5/],
    ["PB-281 variant tomorrow", "remind me tomorrow at 9:30 am to call the Adyar officer", /9:30/],
    ["PB-281 variant Tamil", "நாளை காலை 9 மணிக்கு அடையாறு அதிகாரியை அழைக்க நினைவூட்டு", /9/]
  ])("%s: the reminder line shows a readable Chennai time, not an ISO string", async (name, text, time) => {
    clearCaches();
    vi.setSystemTime(new Date(FROZEN));
    const sim = new ClientSim(world, {}, list);
    const c = await runConversation(sim, [], text as string);
    seen[`reminder ${name}`] = { text, said: c.last.said, kind: c.last.kind, lane: c.last.lane };
    expect(c.last.said).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:|\d{2}:\d{2}:\d{2}(\.\d+)?Z/);
    expect(c.last.said, c.last.said).toMatch(time as RegExp);
  });

  const LATIN_RUN =/\b[A-Za-z][A-Za-z'-]{2,}(?:\s+[A-Za-z][A-Za-z'-]{1,}){3,}/; // four or more English words in a row
  it.each([
    ["ta count", "அடையாறு மண்டலத்தில் இந்த வாரம் கடுமையான சம்பவங்கள் எத்தனை?"],
    ["ta ranking", "இந்த வாரம் அதிக புகார்கள் உள்ள துறைகள் எவை?"],
    ["ta overdue", "காலக்கெடு தாண்டிய வழக்குகள் எத்தனை?"],
    ["ta brief zone", "தேனாம்பேட்டை நிலைமை சுருக்கமா சொல்லு"],
    ["ta trend", "இந்த மாதம் புகார்கள் போக்கு எப்படி இருக்கு?"],
    ["tanglish count", "Royapuram la indha vaaram evlo severe cases irukku"],
    ["tanglish list", "Adyar la pending complaints ellam kaattu"],
    ["tanglish dept", "garbage department la evlo cases pending"]
  ])("PB-161/PB-174/PB-207 class, %s: a Tamil reply has no English sentence", async (name, text) => {
    clearCaches();
    vi.setSystemTime(new Date(FROZEN));
    const sim = new ClientSim(world, {}, list);
    const c = await runConversation(sim, [], text as string);
    const o = c.last;
    const spoken = o.stage ? String(o.stage.say?.ta ?? "") : o.lang === "ta" ? o.said : "";
    const items = (o.items ?? []).join("\n");
    seen[`rc15 ${name}`] = { text, lang: o.lang, lane: o.lane, said: o.said, spoken_ta: spoken, items: items.slice(0, 800), title: o.stage?.title ?? null };
    expect(o.lang, o.said).toBe("ta");
    // record titles may stay as the record has them (owner's decision OPEN-12): drop text before a colon and inside quotes
    const own = (s: string) => s.split("\n").map((l) => (l.includes(": ") ? l.slice(l.lastIndexOf(": ") + 2) : l)).join("\n").replace(/["“][^"”]*["”]/g, "");
    expect(own(`${o.said}\n${spoken}`), o.said).not.toMatch(LATIN_RUN);
    expect(`${o.said}\n${spoken}`, "PB-224: one with a plural").not.toMatch(/(?<![\d,.])1 கடுமையான சம்பவங்கள்/);
  });
});
