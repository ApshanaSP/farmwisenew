import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { beforeAll, describe, expect, it } from "vitest";

// R-06 (27 Oct 2026): Data Studio listed 31 datasets: the same 16,113-row grievance export 8 times under other names and
// departments, samples 2–3 times, and "Country Population Over Years", which has nothing of Chennai in it.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-list-"));
process.env.STUDIO_DIR = dir;
let store: typeof import("./store");

const meta = (id: string, name: string, dept: string | null, updatedAt: string, extra: Record<string, unknown> = {}) => ({
  id, name, updatedAt, createdAt: updatedAt, rows: 3, cols: 2, sample: false, link: null,
  source: { kind: "file", file: `${name}.csv`, url: null },
  detective: { after: 90 }, spec: { title: name, summary: "", deptName: dept }, ...extra
});
const put = (m: ReturnType<typeof meta>, src: string, rows: object[] = [{ _z: 13 }]) => {
  fs.writeFileSync(path.join(dir, `${m.id}.json`), JSON.stringify(m));
  fs.writeFileSync(path.join(dir, `${m.id}.src`), src);
  fs.writeFileSync(path.join(dir, `${m.id}.rows.json.gz`), zlib.gzipSync(JSON.stringify(rows)));
};

beforeAll(async () => {
  put(meta("ds_aaaaaa1", "Citizen Grievances", "Storm Water Drain", "2026-10-20T10:00:00Z"), "id,complaint\n1,drain");
  put(meta("ds_aaaaaa2", "Public Grievances and Complaints", "General Administration", "2026-10-22T10:00:00Z"), "id,complaint\n1,drain");
  put(meta("ds_aaaaaa3", "Chennai Corporation Citizen Grievances", "Solid Waste Management", "2026-10-21T10:00:00Z"), "id,complaint\n1,drain");
  put(meta("ds_bbbbbb1", "Fever survey", "Public Health (GCC)", "2026-10-19T10:00:00Z"), "ward,cases\n120,4");
  // added before the Relevance gate: no verdict saved, no row on Chennai's map, Chennai named nowhere
  put(meta("ds_cccccc1", "Country Population Over Years", null, "2026-10-18T10:00:00Z"), "country,year,pop\nIndia,2020,1", [{ c0: "India" }]);
  // the gate said unrelated, and the Collector kept it anyway: listed
  put(meta("ds_dddddd1", "World ports", null, "2026-10-17T10:00:00Z",
    { relevance: { verdict: "unrelated", why: "", by: "ai", filtered: null, forced: true, signals: [] } }), "port\nRotterdam", [{}]);
  store = await import("./store");
});

describe("Data Studio's list (R-06)", () => {
  it("lists the same original file once, newest first, with its copies and every department", () => {
    const cards = store.listDatasets();
    const g = cards.filter((c) => c.name.includes("Grievances"));
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ id: "ds_aaaaaa2", copies: 3 });
    expect(new Set(g[0].departments)).toEqual(new Set(["General Administration", "Solid Waste Management", "Storm Water Drain"]));
    expect(cards.find((c) => c.id === "ds_bbbbbb1")?.copies).toBeUndefined();
  });

  it("leaves out data with nothing of Chennai in it, and says which", () => {
    expect(store.listDatasets().map((c) => c.id)).not.toContain("ds_cccccc1");
    expect(store.hiddenDatasets()).toEqual([{ id: "ds_cccccc1", name: "Country Population Over Years" }]);
    expect(store.listDatasets().map((c) => c.id)).toContain("ds_dddddd1");
  });

  it("deletes nothing: every copy is still on disk and opens", () => {
    for (const id of ["ds_aaaaaa1", "ds_aaaaaa2", "ds_aaaaaa3", "ds_cccccc1"]) {
      expect(fs.existsSync(path.join(dir, `${id}.json`))).toBe(true);
      expect(store.getMeta(id)?.id).toBe(id);
    }
  });
});

describe("the Briefing's dataset findings (R-19)", () => {
  it("a saved brief's zone count of things is a note, not an action", () => {
    const m = meta("ds_eeeeee1", "Chennai Metro Stations List", null, "2026-10-26T10:00:00Z", {
      brief: { verdict: "Metro stations by zone", items: [
        { label: "Hotspot", priority: "act", score: 70, title: "Valasaravakkam carries the heaviest load", headline: "Valasaravakkam hosts 8 metro stations",
          metric: { value: "8", caption: "metro stations in Valasaravakkam" } }] }
    });
    put(m, "station,zone\nA,11");
    const w = store.watchList().find((x) => x.id === "ds_eeeeee1");
    expect(w?.act).toBe(0);
  });
});
