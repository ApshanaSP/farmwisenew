// QA pass 4, fixer G2, RC-35: a decision reaches every cached reader at once.
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/g2-cache.test.ts
// The readers that keep a result for a while (Jarvis's tool results 30 s, the assistant's shared reads 60 s, its cards 10 min, developing stories 10 min, the map's
// answers and the insight cards) learned of a decision only when their time ran out. A write to the decisions or the officers' steps now empties them all
// (lib/collector/epoch.ts). The write-then-read tests for the real readers are in audit-narrate_and_figures (AUD-NF-10: Jarvis's case screen, a developing
// story) and decision-matrix (DECISIONS-12: Ask District IQ's figures); this file is the mechanism and the class guard.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bumpDataEpoch, dataEpoch, syncEpoch, syncEpochKeys } from "@/lib/collector/epoch";
import { safeHands } from "@/lib/thunai/round";

describe("RC-35 the epoch", () => {
  it("syncEpoch empties a cache once per decision, and not before the first one", () => {
    const m = new Map([["a", 1]]);
    syncEpoch(m);
    expect(m.size).toBe(1);
    syncEpoch(m);
    expect(m.size).toBe(1);
    bumpDataEpoch();
    syncEpoch(m);
    expect(m.size).toBe(0);
    m.set("b", 2);
    syncEpoch(m);
    expect(m.size).toBe(1);
  });
  it("syncEpochKeys does the same for a bag of keys", () => {
    const bag: Record<string, unknown> = { k: 1 };
    const token = {};
    syncEpochKeys(bag, token);
    expect(Object.keys(bag)).toEqual(["k"]);
    bumpDataEpoch();
    syncEpochKeys(bag, token);
    expect(Object.keys(bag)).toEqual([]);
  });
  it("Jarvis's tool results are read again after a decision, and still shared before it", async () => {
    let calls = 0;
    const hands = safeHands({ tool: async (name: string) => ({ name, n: ++calls }), severe: async () => ({}), news: async () => ({}), map: async () => ({}) } as never);
    const a = await hands.tool("overview_kpis", { x: 1 } as never);
    const b = await hands.tool("overview_kpis", { x: 1 } as never);
    expect(calls).toBe(1);
    expect((a as unknown as { n: number }).n).toBe((b as unknown as { n: number }).n);
    bumpDataEpoch();
    expect(((await hands.tool("overview_kpis", { x: 1 } as never)) as unknown as { n: number }).n).toBe(2);
  });
  it("a write to the Collector's decisions or an officer's steps bumps the epoch, whoever wrote it (the store's own write path)", async () => {
    const { awsPool } = await import("@/lib/aws/store");
    const { ops } = await import("@/lib/collector/db");
    const pool = awsPool();
    const before = dataEpoch();
    await pool.query(`INSERT INTO ${ops("collector_decisions")} (incident_id, decision, escalate_to, note, decided_by, decided_role) VALUES (?, 'note', NULL, 'g2 epoch test', 'qa.g2@example.invalid', 'collector')`, ["INC-G2-EPOCH-TEST"]);
    expect(dataEpoch()).toBeGreaterThan(before);
    const mid = dataEpoch();
    await pool.query(`SELECT COUNT(*) AS n FROM ${ops("collector_decisions")}`);
    expect(dataEpoch()).toBe(mid); // a read changes nothing
    await pool.query(`DELETE FROM ${ops("collector_decisions")} WHERE incident_id = ?`, ["INC-G2-EPOCH-TEST"]);
  });
});

// Every module that keeps a timed cache of something read from the store either follows the epoch, or is here with the reason it does not need to.
describe("RC-35 class guard: a timed cache over the store follows the epoch or says why not", () => {
  const NOT_NEEDED: Record<string, string> = {
    "lib/officer/data.ts": "caches a department profile (name, head, reference lists) and the zone and taluk lists: reference data, no status in it",
    "lib/collector/alerts.ts": "caches the weather alert feeds: external, nothing a decision changes",
    "lib/collector/fulltext.ts": "caches fetched article text: external",
    "lib/collector/nearby.ts": "caches the neighbouring districts news: external, no incident status",
    "lib/collector/conflicts.ts": "keyed by the stories and their documents; holds where reports of one event disagree (a toll, a place), never a status",
    "lib/collector/intel.ts": "caches the as-of clock and whether the officer tables exist: not a figure",
    "lib/collector/lakes.ts": "caches the reservoir feed: external",
    "lib/collector/nlp.ts": "caches the gazetteer of place names: reference data",
    "lib/collector/sources.ts": "the sources page: feed settings, not incident status",
    "lib/assistant/scope.ts": "caches zone, department, category and taluk names: reference data",
    "lib/assistant/spell.ts": "caches the spelling vocabulary: reference data",
    "lib/map/followups.ts": "a time budget for a loop, not a cache",
    "lib/studio/pipeline.ts": "Data Studio refresh schedule, not incident status",
    "components/collector/app/CollectorApp.tsx": "a browser timer, not a server cache",
    "lib/aws/store.ts": "is the store itself (it is what bumps the epoch)",
    "lib/rehearsal/cfmlive.ts": "rain rehearsal feed: external",
    "lib/rehearsal/traffic.ts": "rain rehearsal traffic feed: external",
    "lib/studio/connect/browser.ts": "Data Studio link fetching",
    "lib/studio/connect/robots.ts": "robots.txt of other sites",
    "lib/studio/fetchurl.ts": "Data Studio link fetching",
    "lib/studio/link.ts": "Data Studio link fetching",
    "lib/studio/refs.ts": "reference lists for an upload",
    // QA pass 5: main's Manu Desk. Its timed cache is the list of GCC areas (reference data); the case writes it makes bump the epoch (cases.ts)
    "lib/manu/petitions.ts": "caches the list of GCC areas for the check screen: reference data"
  };
  const root = path.join(process.cwd(), "src");
  const files: string[] = [];
  (function walk(d: string) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/\.(test|live)\.tsx?$/.test(e.name)) files.push(p);
    }
  })(root);
  const timedCache = (s: string) => /Date\.now\(\) - [\w.[\]?]+ *[<>]|Date\.now\(\) - [\w.[\]?]+\.at\b/.test(s) && /new Map|global\.__\w+/.test(s);
  it("finds the cached readers", () => {
    expect(files.filter((f) => timedCache(fs.readFileSync(f, "utf8"))).length).toBeGreaterThan(15);
  });
  it("each is either epoch-aware or listed with its reason", () => {
    const loose = files.map((f) => ({ f: path.relative(root, f).replace(/\\/g, "/"), s: fs.readFileSync(f, "utf8") }))
      .filter(({ s }) => timedCache(s))
      .filter(({ f, s }) => !/syncEpoch(Keys)?\(/.test(s) && !NOT_NEEDED[f]).map(({ f }) => f);
    expect(loose).toEqual([]);
  });
  // g-review (smaller point): the check above is per file, so a second cache added to a file that already syncs one would pass. This one is per cache: every module-level Map or WeakMap of a file that
  // follows the epoch is synced itself, or is named here with the reason it holds nothing a decision changes.
  const MAP_NOT_SYNCED: Record<string, string> = {
    "lib/assistant/tools.ts:BY_NAME": "the registry of tool definitions by name: code, not data read from the store",
    "lib/map/ask.ts:byIncident": "an index of the news documents by incident, held weakly and rebuilt when the documents array is replaced: it caches no status",
    "lib/thunai/round.ts:turns": "the turn memory of a conversation: what was said, not what the store holds",
    "lib/thunai/round.ts:planCache": "the model's plan for a request: it holds no figure, and the results of the tools it calls go through toolCache, which is synced"
  };
  const mapsOf = (s: string) => [...s.matchAll(/^(?:export )?(?:const|let) (\w+)(?:\s*:[^=\n]+)?\s*=\s*(?:new Map|new WeakMap)/gm)].map((m) => m[1]);
  it("every module-level Map or WeakMap in an epoch-aware file is itself synced, or is listed with its reason", () => {
    const loose: string[] = [];
    for (const f of files) {
      const s = fs.readFileSync(f, "utf8");
      if (!timedCache(s) || !/syncEpoch(Keys)?\(/.test(s)) continue;
      const rel = path.relative(root, f).split(path.sep).join("/");
      for (const n of mapsOf(s)) if (!new RegExp(String.raw`syncEpoch(?:Keys)?\(\s*${n}\b`).test(s) && !MAP_NOT_SYNCED[`${rel}:${n}`]) loose.push(`${rel}:${n}`);
    }
    expect(loose).toEqual([]);
  });
  it("every listed unsynced Map is still declared (the list does not rot)", () => {
    const stale = Object.keys(MAP_NOT_SYNCED).filter((k) => {
      const [f, n] = k.split(":");
      const p = path.join(root, f);
      return !fs.existsSync(p) || !mapsOf(fs.readFileSync(p, "utf8")).includes(n);
    });
    expect(stale).toEqual([]);
  });
  it("every listed exception is still a cached reader (the list does not rot)", () => {
    const stale = Object.keys(NOT_NEEDED).filter((f) => !files.some((x) => x.replace(/\\/g, "/").endsWith(`/src/${f}`) && timedCache(fs.readFileSync(x, "utf8"))));
    expect(stale).toEqual([]);
  });
});
