/**
 * 27 Nov, the topic guard (lib/topicguard) in the Studio's analyst: a question about nothing in the district or in the file is declined in the
 * one fixed sentence, with no model and no rules counting rows for it; the file's own words keep a question in; an unsupported question the
 * code check calls off-topic shows the fixed sentence, never the model's note. The store, the analyst and the reference tables are stand-ins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatasetMeta } from "@/lib/studio/types";

const mem = vi.hoisted(() => ({ metas: [] as unknown[], asked: [] as string[], ask: null as null | ((...a: unknown[]) => Promise<unknown>) }));
vi.mock("@/lib/studio/store", () => ({
  datasetIds: () => (mem.metas as DatasetMeta[]).map((m) => m.id),
  getMeta: (id: string) => (mem.metas as DatasetMeta[]).find((m) => m.id === id) ?? null,
  getRows: () => [],
  listDatasets: () => []
}));
vi.mock("@/lib/studio/pipeline", () => ({
  ask: (...a: unknown[]) => { mem.asked.push(String(a[1])); return mem.ask ? mem.ask(...a) : Promise.reject(new Error("no analyst in this test")); },
  namesOf: () => ({ zone: (z: number) => `Zone ${z}`, taluk: (t: string) => t, zoneOf: () => null })
}));
vi.mock("@/lib/studio/refs", () => ({ refs: async () => ({ wards: new Map(), zones: new Map(), taluks: new Map(), categories: [], depts: [], families: new Map() }) }));

import { offTopicAsk, offTopicNote } from "./ai";
import { resetStudioIndex, studioAsk } from "./forAssistants";

const meta = (id: string, title: string, entity: string, plural: string, cols: { key: string; label: string; role: string }[], top: Record<string, string[]> = {}): DatasetMeta => ({
  id, name: title, source: { kind: "file", file: `${title}.csv` }, createdAt: "2026-11-20T10:00:00Z", updatedAt: "2026-11-20T10:00:00Z", rows: 40, cols: cols.length, window: { from: null, to: null },
  spec: { title, summary: plural, entity, entityPlural: plural, department: null, deptName: null, openValues: ["Pending"], primary: null, linkCategories: [], questions: [], by: "rules", model: null,
    columns: cols.map((c) => ({ ...c, header: c.label, type: "text", unit: null, agg: null, conf: 0.9, why: "" })) },
  profile: cols.map((c) => ({ key: c.key, header: c.label, type: "text", filled: 40, distinct: 4, top: (top[c.key] ?? []).map((v) => ({ v, n: 3 })), min: null, max: null, median: null, dmin: null, dmax: null, avgLen: 6 })),
  brief: null, panels: [], link: null, story: null, rules: [], steps: [], sample: true
}) as unknown as DatasetMeta;

const DESILT = meta("ds_desilt0001", "Storm-water drain desilting register", "desilting work", "desilting works",
  [{ key: "zone", label: "Zone", role: "zone" }, { key: "st", label: "Status", role: "status" }, { key: "len", label: "Length (m)", role: "measure" }], { st: ["Pending", "Completed"] });
const GROUNDS = meta("ds_grounds001", "Corporation playgrounds", "playground", "playgrounds",
  [{ key: "kind", label: "Ground type", role: "category" }, { key: "loc", label: "Location", role: "place" }], { kind: ["Cricket ground", "Football ground"] });
const COLLECTOR = { role: "collector", lockDept: null };

beforeEach(() => { mem.metas = [DESILT, GROUNDS]; mem.asked = []; mem.ask = null; resetStudioIndex(); });

describe("the Studio analyst declines what is outside District IQ", () => {
  it("the code check: off-topic words with nothing of the file in them", () => {
    expect(offTopicAsk("When was Dhoni's retirement?", DESILT.spec, DESILT.profile)).toBe(true);
    expect(offTopicAsk("tell me a joke", DESILT.spec, DESILT.profile)).toBe(true);
    // the file's own words keep it in: a playgrounds register may be asked about its cricket grounds
    expect(offTopicAsk("how many cricket grounds", GROUNDS.spec, GROUNDS.profile)).toBe(false);
    expect(offTopicAsk("how many cricket grounds", DESILT.spec, DESILT.profile)).toBe(true);
    // a column word beside the subject does not: the subject itself must be the file's
    expect(offTopicAsk("Status of Dhoni's retirement", DESILT.spec, DESILT.profile)).toBe(true);
    expect(offTopicAsk("pending works by zone", DESILT.spec, DESILT.profile)).toBe(false);
    // the file's word in the other number keeps it in ("films" against "Film shooting permissions")
    const FILM = meta("ds_film000001", "Film shooting permissions", "permission", "permissions",
      [{ key: "loc", label: "Location", role: "place" }, { key: "st", label: "Status", role: "status" }], { st: ["Approved", "Pending"], loc: ["Marina", "Besant Nagar"] });
    expect(offTopicAsk("films by status", FILM.spec, FILM.profile)).toBe(false);
    expect(offTopicAsk("list the movies shot in Besant Nagar", FILM.spec, FILM.profile)).toBe(false);
    expect(offTopicAsk("When was Dhoni's retirement?", FILM.spec, FILM.profile)).toBe(true);
    // beside the subject, the file's own name or a common value keeps it in, even when the subject is not among its eight common values
    const PLAY = meta("ds_play000001", "Corporation playgrounds", "playground", "playgrounds",
      [{ key: "kind", label: "Ground type", role: "category" }, { key: "loc", label: "Location", role: "place" }], { kind: ["Football ground", "Open ground"] });
    expect(offTopicAsk("how many cricket grounds", PLAY.spec, PLAY.profile)).toBe(false);
    expect(offTopicAsk("when did Dhoni retire", PLAY.spec, PLAY.profile)).toBe(true);
    expect(offTopicNote("தோனி எப்போது ஓய்வு பெற்றார்?")).toMatch(/^மன்னிக்கவும்/);
    expect(offTopicNote("When was Dhoni's retirement?")).toMatch(/^Sorry, that is outside what I cover\./);
  });
  it("for the assistants: the fixed sentence in English and Tamil, with no analyst and no rules asked", async () => {
    const r = await studioAsk("When was Dhoni's retirement?", { who: COLLECTOR, datasetId: DESILT.id, user: "c" });
    expect(mem.asked).toEqual([]);
    expect(r?.reply).toMatchObject({ kind: "unsupported", panel: null, by: "rules" });
    expect(r?.sentence.en).toMatch(/^Sorry, that is outside what I cover\. I answer about Chennai district/);
    expect(r?.sentence.ta).toMatch(/^மன்னிக்கவும்/);
    // the whole sentence, never cut to a file note's length
    expect(r?.reply.note).toBe(r?.sentence.en);
    const ta = await studioAsk("தோனி எப்போது ஓய்வு பெற்றார்?", { who: COLLECTOR, datasetId: DESILT.id, user: "c" });
    expect(ta?.reply.note).toMatch(/^மன்னிக்கவும்/);
  });
  it("an off-topic subject the file holds goes to the analyst; its unsupported note about the subject is never said", async () => {
    mem.ask = async () => ({ kind: "unsupported", note: "These grounds are not in the file, but Dhoni retired in 2020.", by: "ai", model: "m" });
    const r = await studioAsk("how many cricket grounds did Dhoni play on", { who: COLLECTOR, datasetId: GROUNDS.id, user: "c" });
    expect(mem.asked).toEqual(["how many cricket grounds did Dhoni play on"]);
    expect(r?.sentence.en).toBe("Corporation playgrounds cannot answer that with its columns.");
    expect(r?.reply.note).toBe(r?.sentence.en);
    expect(JSON.stringify(r)).not.toMatch(/2020|retired in/);
  });
  it("a question about the file goes to the analyst as before, its note said as it was", async () => {
    mem.ask = async () => ({ kind: "unsupported", note: "These columns hold no cost.", by: "ai", model: "m" });
    const r = await studioAsk("total cost of pending works by zone", { who: COLLECTOR, datasetId: DESILT.id, user: "c" });
    expect(mem.asked).toEqual(["total cost of pending works by zone"]);
    expect(r?.sentence.en).toBe("These columns hold no cost.");
  });
});
