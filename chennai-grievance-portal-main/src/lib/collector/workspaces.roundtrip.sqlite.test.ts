/**
 * A saved workspace through the server's own save and open (workspaces.ts), on an isolated in-memory store through the AWS store's
 * MySQL -> SQLite translation (28 Nov 2026): the Briefing page's copy goes into the archive's fact pack and comes back whole, once (the raw
 * pack is not sent a second time), and a version saved before it, with only its markdown, still opens.
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expand, registerFunctions, setDatabaseNames, translate } from "@/lib/aws/dialect";

const h = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
const run = async (sql: string, params: unknown[] = []) => {
  const [s, p] = expand(translate(sql), params);
  const st = h.db.prepare(s);
  if (/^\s*(SELECT|WITH)/i.test(s)) return [st.all(...(p as never[]))];
  const r = st.run(...(p as never[]));
  return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }];
};
const conn = { query: run, beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, release: () => undefined };
vi.mock("@/lib/collector/db", () => ({ default: { query: run, getConnection: async () => conn }, ops: (t: string) => t, OPS_DB: "district_intel_ops" }));
vi.mock("@/lib/db", () => ({ default: { query: run } }));
vi.mock("@/lib/collector/sources", () => ({ audit: async () => undefined, auditIn: async () => undefined, inTransaction: async (f: (c: typeof conn) => unknown) => f(conn) }));

const { BRIEFING_MAX_BYTES, briefingBytes, openWorkspace, saveWorkspace } = await import("./workspaces");
const { readSavedBrief, BRIEF_VIEW_V } = await import("./workspacesnap");

beforeEach(() => {
  setDatabaseNames(["district_collector_dashboard", "district_intel", "district_intel_ops"]);
  h.db = new DatabaseSync(":memory:");
  registerFunctions(h.db);
  h.db.exec(`
    CREATE TABLE workspaces (workspace_id INTEGER PRIMARY KEY, owner TEXT, name TEXT, version INTEGER, is_current INTEGER, layout TEXT, filters TEXT,
      created_at TEXT DEFAULT '2026-11-28 10:31:00');
    CREATE TABLE briefing_archive (archive_id INTEGER PRIMARY KEY, briefing_id TEXT, period TEXT, as_of TEXT, markdown TEXT, fact_pack TEXT, method TEXT,
      issued_by TEXT, issued_at TEXT DEFAULT '2026-11-28 10:31:00');`);
});

const glance = { empty: false, situation: { en: ["172 incidents were reported today."], ta: ["இன்று 172 சம்பவங்கள் பதிவாகின."] },
  figures: [{ key: "reported", label: "Reported", v: 172, prev: 176, good: null, sub: null, open: { k: "list", preset: {}, title: "Reported today" } }],
  happening: [{ key: "kinds", icon: "pulse", tone: "info", en: ["Most were ", { nm: "Theft" }], ta: [{ nm: "Theft" }, " அதிகம்"], open: { k: "list", preset: {}, title: "Theft" }, act: "Open the list" }],
  needs: [], next: [] };
const view = { v: BRIEF_VIEW_V, now: "2026-11-28 10:30:00", period: "daily", periodLabel: "Today", scopeName: "District-wide", whole: true,
  status: { level: "watchful", reasons: ["1 death"] }, warned: null, glance, ai: null,
  days: [{ day: "2026-11-28", reported: 172, resolved: 175 }], oldest: null, departments: [{ code: "POL", name: "Police", n: 77, open: 60, dead: 1, severe: 3, overdue: 6 }],
  stories: { threads: [] }, gaps: [], news: null, differ: null };

describe("a workspace through the server's save and open", () => {
  it("keeps the Briefing page's copy whole, Tamil included, and sends the pack back once", async () => {
    const r = await saveWorkspace("collector@x.in", { name: "Daily", filters: { period: "daily", zone: null }, layout: { pages: {} },
      briefing: { md: "# Briefing", facts: { headline: "172 reported", attention: [], scope: "District-wide", view }, period: "daily", asOf: "2026-11-28 10:30:00" } });
    expect(r.version).toBe(1);
    const w = await openWorkspace("collector@x.in", r.id);
    expect(w).toBeTruthy();
    expect(w!.briefing).not.toHaveProperty("fact_pack");
    expect(w!.briefing!.facts.view).toEqual(view);
    expect(w!.briefing!.markdown).toBe("# Briefing");
    const b = readSavedBrief(w!.briefing);
    if (b?.kind !== "view") throw new Error(`the copy came back as ${b?.kind ?? "nothing"}`);
    expect(b.view.glance).toEqual(glance);
    // another owner never opens it
    expect(await openWorkspace("someone@x.in", r.id)).toBeNull();
  });
  it("a version saved before 28 Nov (markdown and a small fact pack) opens in the written format", async () => {
    h.db.prepare(`INSERT INTO briefing_archive (briefing_id, period, as_of, markdown, fact_pack, method, issued_by) VALUES ('WS-Old', 'daily', '2026-11-20 09:00:00', '# Old briefing', ?, 'workspace snapshot', 'c v1')`)
      .run(JSON.stringify({ headline: "3 need you", attention: ["INC-1"], scope: "District-wide" }));
    h.db.prepare(`INSERT INTO workspaces (owner, name, version, is_current, layout, filters) VALUES ('collector@x.in', 'Old', 1, 1, '{}', ?)`).run(JSON.stringify({ period: "daily", archiveId: 1 }));
    const w = await openWorkspace("collector@x.in", 1);
    expect(readSavedBrief(w!.briefing)).toMatchObject({ kind: "text", md: "# Old briefing", headline: "3 need you" });
  });
  it("a briefing too large for one stored row is refused before it is written (the route answers 413)", () => {
    expect(briefingBytes({ md: "# x", facts: { view } })).toBeLessThan(BRIEFING_MAX_BYTES);
    expect(briefingBytes({ md: "x".repeat(200_000), facts: { view: { big: "அ".repeat(45_000) } } })).toBeGreaterThan(BRIEFING_MAX_BYTES);
  });
});
