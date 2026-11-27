/**
 * 27 Nov, the topic guard (lib/topicguard) in the Studio's own ask (pipeline.ts, the Studio page's analyst): an off-topic question is declined
 * before the analyst's model is asked; an unsupported answer about an off-topic subject is never said in the model's words. The store, the
 * reference tables and the analyst's model call are stand-ins (the store's folder is a temporary one).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatasetMeta } from "@/lib/studio/types";

const h = vi.hoisted(() => {
  process.env.STUDIO_DIR = `${process.env.TEMP || process.env.TMPDIR || "/tmp"}/studio-offtopic-${process.pid}`;
  return { meta: null as unknown, asked: [] as string[], out: null as unknown };
});
vi.mock("@/lib/studio/store", async (orig) => ({ ...(await orig<object>()), getMeta: () => h.meta, getRows: () => [] }));
vi.mock("@/lib/studio/refs", () => ({ refs: async () => ({ wards: new Map(), zones: new Map(), taluks: new Map(), categories: [], depts: [], families: new Map() }) }));
vi.mock("@/lib/studio/ai", async (orig) => ({
  ...(await orig<object>()),
  askAI: vi.fn(async (p: { question: string }) => { h.asked.push(p.question); return { out: h.out, info: { provider: "test", model: "m" } }; })
}));

import { ask } from "./pipeline";

const OUT = { kind: "unsupported", title: "", agg: "count", col: null, by: "none", by_col: null, unit: null, filters: [], chart: "kpi", sort: "desc", limit: 10, watch_op: null, watch_threshold: null };
const meta = (title: string, cols: { key: string; label: string; role: string }[], top: Record<string, string[]> = {}) => ({
  id: "ds_test000001", name: title, rows: 10, window: { from: null, to: null },
  spec: { title, summary: title, entity: "row", entityPlural: "rows", department: null, deptName: null, openValues: [], primary: null, linkCategories: [], questions: [], by: "rules", model: null,
    columns: cols.map((c) => ({ ...c, header: c.label, type: "text", unit: null, agg: null, conf: 0.9, why: "" })) },
  profile: cols.map((c) => ({ key: c.key, header: c.label, type: "text", filled: 10, distinct: 2, top: (top[c.key] ?? []).map((v) => ({ v, n: 2 })), min: null, max: null, median: null, dmin: null, dmax: null, avgLen: 5 }))
}) as unknown as DatasetMeta;

beforeEach(() => {
  h.asked.length = 0;
  h.meta = meta("Storm-water drain desilting register", [{ key: "st", label: "Status", role: "status" }, { key: "zone", label: "Zone", role: "zone" }]);
  h.out = { ...OUT, note: "Dhoni retired in 2020; these columns cannot say." };
});

describe("the Studio's own ask", () => {
  it("declines an off-topic question before its model is asked, in the language asked", async () => {
    const r = await ask("ds_test000001", "When was Dhoni's retirement?", "c") as { kind: string; note: string; model: string | null; offtopic?: boolean };
    expect(h.asked).toEqual([]);
    expect(r).toMatchObject({ kind: "unsupported", model: null, offtopic: true });
    expect(r.note).toMatch(/^Sorry, that is outside what I cover\./);
    const ta = await ask("ds_test000001", "தோனி எப்போது ஓய்வு பெற்றார்?", "c") as { note: string };
    expect(ta.note).toMatch(/^மன்னிக்கவும்/);
    expect(h.asked).toEqual([]);
  });
  it("an off-topic subject the file holds is asked; the model's note about it is never said", async () => {
    h.meta = meta("Corporation playgrounds", [{ key: "kind", label: "Ground type", role: "category" }], { kind: ["Cricket ground"] });
    const r = await ask("ds_test000001", "when did Dhoni play on the cricket grounds", "c") as { kind: string; note: string };
    expect(h.asked).toEqual(["when did Dhoni play on the cricket grounds"]);
    expect(r).toMatchObject({ kind: "unsupported", note: "These columns cannot answer that." });
  });
  it("a question about the file keeps the model's note", async () => {
    h.out = { ...OUT, note: "These columns hold no cost." };
    const r = await ask("ds_test000001", "total cost of pending works by zone", "c") as { note: string };
    expect(h.asked).toEqual(["total cost of pending works by zone"]);
    expect(r.note).toBe("These columns hold no cost.");
  });
});
