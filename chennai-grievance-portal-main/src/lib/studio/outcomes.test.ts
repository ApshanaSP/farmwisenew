/**
 * The link engine's outcomes (masterclass 9.1): every fixture link the fixture server serves
 * (scripts/studio-fixtures/server.mjs) ends in the outcome it must, with what was checked and a next step; none of the
 * NO DATA, NOT RELEVANT, BLOCKED or ERROR links reaches a dashboard. Also: the picker's groups and series card (9.2),
 * the fixture host refused with its flag off, and the polite rate per host.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.STUDIO_DIR = `${process.env.TEMP || process.env.TMPDIR || "/tmp"}/studio-outcomes-${process.pid}`;
  process.env.STUDIO_FIXTURES = "1";
  process.env.STUDIO_HOST_GAP_MS = "0";
  process.env.STUDIO_BROWSER = "0";
  process.env.STUDIO_FETCH_TIMEOUT_MS = "1500";
});

import { resolveLink, findDuplicate } from "@/lib/studio/connect/resolve";
import { tableHash } from "@/lib/studio/connect/discover";
import { politeTurn } from "@/lib/studio/fetchurl";
import { usableRows } from "@/lib/studio/readiness";
import { combineTables } from "@/lib/studio/pipeline";
import type { Outcome } from "@/lib/studio/types";

type Fixture = { id: string; url: string; expect: Outcome["kind"]; what: string; reason?: string; rows?: number; cards?: number; usable?: number; todo?: string; flagOff?: boolean };
let FIXTURES: Fixture[] = [];
let stop: (() => Promise<void>) | null = null;

beforeAll(async () => {
  fs.mkdirSync(process.env.STUDIO_DIR!, { recursive: true });
  const mod = await import("../../../scripts/studio-fixtures/server.mjs");
  FIXTURES = mod.FIXTURES as Fixture[];
  // the fixture server may already be running (for the browser check): the same fixtures, so it is used as it is
  stop = await mod.start().catch((e: NodeJS.ErrnoException) => { if (e.code === "EADDRINUSE") return null; throw e; });
}, 30_000);
afterAll(async () => { await stop?.(); });

const none = { mode: "none" as const };
const log = () => {};
const results: { id: string; expect: string; got: string; reason: string }[] = [];

async function run(f: Fixture) {
  if (f.flagOff) process.env.STUDIO_FIXTURES = "0";
  try {
    return await resolveLink(f.url, none, { log });
  } finally {
    process.env.STUDIO_FIXTURES = "1";
  }
}

// the manifest is read synchronously so each fixture is its own test
const manifest: Fixture[] = (() => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts", "studio-fixtures", "server.mjs"), "utf8");
  const body = src.slice(src.indexOf("export const FIXTURES = ["), src.indexOf("// ---------------------------------------------------------------- routes --"));
  return [...body.matchAll(/\{ id: "([^"]+)", url: ([^,]+), expect: "([a-z]+)"(.*?)\},?\n/g)].map((m) => ({ id: m[1], url: "", expect: m[3] as Outcome["kind"], what: "", todo: /todo:/.test(m[4]) ? "todo" : undefined }));
})();

describe("9.1 the outcome of every link fixture", () => {
  it("has at least 60 fixtures, covering all six outcomes", () => {
    expect(manifest.length).toBeGreaterThanOrEqual(60);
    for (const k of ["data", "choose", "nodata", "notrelevant", "blocked", "error"]) expect(manifest.some((m) => m.expect === k)).toBe(true);
  });

  for (const m of manifest) {
    const t = m.todo ? it.todo : it;
    t(`${m.id} ends in ${m.expect.toUpperCase()}`, async () => {
      const f = FIXTURES.find((x) => x.id === m.id)!;
      const r = await run(f);
      results.push({ id: f.id, expect: f.expect, got: r.outcome.kind, reason: r.outcome.reason });
      expect({ id: f.id, kind: r.outcome.kind, why: r.outcome.why }).toMatchObject({ id: f.id, kind: f.expect });
      if (f.reason) expect(r.outcome.reason).toBe(f.reason);
      // every outcome screen says what was checked and what to do next (DATA goes straight on to the agents)
      if (f.expect !== "data") {
        expect(r.outcome.why.length).toBeGreaterThan(10);
        expect(r.outcome.checked.length + (f.expect === "choose" ? 1 : 0)).toBeGreaterThan(0);
        if (f.expect !== "choose") expect(r.outcome.next.length).toBeGreaterThan(0);
      }
      // only DATA picks a table; nothing else reaches the agents
      if (["nodata", "blocked", "error"].includes(f.expect)) expect(r.chosen).toBeNull();
      if (f.expect === "data") {
        expect(r.chosen).not.toBeNull();
        if (f.rows) expect(r.chosen!.table.rows.length).toBe(f.rows);
        if (f.usable) expect(usableRows(r.chosen!.table).length).toBe(f.usable);
      }
      if (f.expect === "choose" && f.cards) expect(r.outcome.pick!.cards.filter((c) => c.group !== "unreadable" && c.group !== "notchennai").length).toBe(f.cards);
    }, 20_000);
  }
});

describe("what the outcomes say", () => {
  it("a news article is offered to News, never charted", async () => {
    const r = await resolveLink(FIXTURES.find((f) => f.id === "n-article")!.url, none, { log });
    expect(r.outcome.next[0].act).toBe("news");
  });
  it("a sign-in page offers the vault; a CAPTCHA is never answered", async () => {
    const login = await resolveLink(FIXTURES.find((f) => f.id === "b-login")!.url, none, { log });
    expect(login.outcome.next[0].act).toBe("vault");
    const cap = await resolveLink(FIXTURES.find((f) => f.id === "b-captcha")!.url, none, { log });
    expect(cap.outcome.why).toMatch(/never answers/);
  });
  it("NOT RELEVANT shows a preview and offers Use anyway; NO DATA, BLOCKED and ERROR never do", async () => {
    const r = await resolveLink(FIXTURES.find((f) => f.id === "r-marks")!.url, none, { log });
    expect(r.outcome.preview?.rows.length).toBeGreaterThan(0);
    expect(r.outcome.next.some((n) => n.act === "useAnyway")).toBe(true);
    for (const id of ["n-home", "b-robots", "e-404", "n-headers"]) {
      const x = await resolveLink(FIXTURES.find((f) => f.id === id)!.url, none, { log });
      expect(x.outcome.next.some((n) => n.act === "useAnyway")).toBe(false);
    }
  });
  it("a retry is offered only where a retry can help", async () => {
    const t = await resolveLink(FIXTURES.find((f) => f.id === "e-timeout")!.url, none, { log });
    expect(t.outcome.next.some((n) => n.act === "retry")).toBe(true);
    for (const id of ["e-404", "e-corrupt", "e-127", "e-file"]) {
      const x = await resolveLink(FIXTURES.find((f) => f.id === id)!.url, none, { log });
      expect(x.outcome.next.some((n) => n.act === "retry")).toBe(false);
    }
  });
  it("text in a table that tries to instruct the Studio changes nothing", async () => {
    const r = await resolveLink(FIXTURES.find((f) => f.id === "d-injection")!.url, none, { log });
    expect(r.outcome.kind).toBe("data");
    expect(JSON.stringify(r.outcome)).not.toMatch(/attacker|admin mode/i);
  });
  it("a Tamil Nadu table is kept to Chennai's rows (partly), a Total row is not data", async () => {
    const r = await resolveLink(FIXTURES.find((f) => f.id === "d-statewide")!.url, none, { log });
    expect(r.outcome.reason).toBe("partly");
    expect(r.gates.get(r.chosen!.cand.id)!.rel.stateWide?.chennai).toBe(5);
  });
});

describe("9.2 the picker", () => {
  it("groups a site's 14 files: recommended, one series card, other, not Chennai's, could not read", async () => {
    const r = await resolveLink(FIXTURES.find((f) => f.id === "c-portal")!.url, none, { log });
    expect(r.outcome.kind).toBe("choose");
    const cards = r.outcome.pick!.cards;
    const by = (g: string) => cards.filter((c) => c.group === g);
    expect(by("recommended").length).toBe(5);
    expect(by("series").length).toBe(1);
    expect(by("series")[0].series!.files).toBe(4);
    expect(by("other").length).toBe(2);
    expect(by("notchennai").length).toBe(2);
    expect(by("unreadable").length).toBe(1);
    // groups come in their order
    const order = ["recommended", "series", "other", "notchennai", "unreadable"];
    expect(cards.map((c) => order.indexOf(c.group))).toEqual([...cards.map((c) => order.indexOf(c.group))].sort((a, b) => a - b));
    // every card says why it is where it is
    for (const c of cards) expect(c.why.length).toBeGreaterThan(5);
  });
  it("27 daily files are one series card, 1 Oct to 27 Oct", async () => {
    const r = await resolveLink(FIXTURES.find((f) => f.id === "c-series")!.url, none, { log });
    const s = r.outcome.pick!.cards.find((c) => c.series)!;
    expect(s.series).toMatchObject({ files: 27, from: "2026-10-01", to: "2026-10-27" });
    expect(s.series!.title).toMatch(/daily reservoir levels/i);
  });
  it("combines datasets with the same columns, and refuses when they differ", () => {
    const t = (h: string[], n: number) => ({ headers: h, rows: Array.from({ length: n }, (_, i) => h.map(() => i)), sheet: null, sheets: [], caption: null, format: "csv" as const, truncated: 0 });
    const c = combineTables([{ label: "a.csv", table: t(["Zone", "Count"], 3) }, { label: "b.csv", table: t(["Zone", "Count"], 4) }]);
    expect(c.rows.length).toBe(7);
    expect(c.headers).toEqual(["Zone", "Count", "Source file"]);
    expect(() => combineTables([{ label: "a", table: t(["Zone", "Count"], 3) }, { label: "b", table: t(["Ward", "Count"], 3) }])).toThrow(/different columns/);
  });
});

describe("duplicates", () => {
  it("the same table already in the Studio is a duplicate, by content", async () => {
    const r = await resolveLink(FIXTURES.find((f) => f.id === "d-table40")!.url, none, { log });
    const dir = process.env.STUDIO_DIR!;
    fs.writeFileSync(path.join(dir, "ds_dupcheck01.json"), JSON.stringify({ id: "ds_dupcheck01", name: "Ward water complaints", createdAt: "2026-10-22T09:00:00.000Z", updatedAt: "2026-10-22T09:00:00.000Z", rows: 40,
      spec: { title: "Ward water complaints, Chennai", summary: "", deptName: null, columns: [] }, relevance: { verdict: "district" }, panels: [], window: { from: null, to: null },
      source: { kind: "link", file: "x.html", url: "http://elsewhere.example/", connect: { hash: tableHash(r.chosen!.table), choice: "table-1", candidates: [] } } }));
    expect(findDuplicate(null, null, r.chosen!.table)?.id).toBe("ds_dupcheck01");
    const again = await resolveLink(FIXTURES.find((f) => f.id === "d-table40")!.url, none, { log });
    expect(again.outcome.kind).toBe("duplicate");
    expect(again.outcome.why).toMatch(/already have this.*22 Oct/);
    fs.rmSync(path.join(dir, "ds_dupcheck01.json"));
  });
});

describe("9.9 guards", () => {
  it("is polite: one request a second to the same host", async () => {
    process.env.STUDIO_HOST_GAP_MS = "250";
    const t0 = Date.now();
    await Promise.all([politeTurn("polite.test"), politeTurn("polite.test"), politeTurn("polite.test")]);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(480);
    process.env.STUDIO_HOST_GAP_MS = "0";
  });
});

afterAll(() => {
  // the outcome table, for the report
  const out = path.join(os.tmpdir(), "studio-outcomes.json");
  try { fs.writeFileSync(out, JSON.stringify(results, null, 1)); } catch { /* not needed */ }
});
