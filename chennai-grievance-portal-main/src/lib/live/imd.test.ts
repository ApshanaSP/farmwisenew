import { describe, expect, it, vi } from "vitest";

// the store module is only needed for its hooks; the parsing and applying are tested on their own
vi.mock("@/lib/aws/store", () => ({ onBuild: () => undefined, withCurrentBuild: async () => null }));
const { parseGis, parseNowcast, parseRmcDay, applyImd, htmlText, labelDate, toIst, warnNote } = await import("./imd");

// trimmed from IMD's real answers of 18 Nov 2026
const PAGE = `<script>var category = {
  "1": "No Warning",
  "2": "Heavy Rain",
  "4": "Thunderstorms & Lightning, Squall etc"
};</script>
<label class="form-check-label" for="rb1">Nov 18, 2026</label>
<label class="form-check-label" for="rb2">Nov 19, 2026</label>`;
const LEGEND = JSON.stringify({ Legend: [{ rules: [
  { title: "gold polygon - 0", symbolizers: [{ Polygon: { fill: "#FFFFFF" } }] },
  { title: "gold polygon - 1", symbolizers: [{ Polygon: { fill: "#F20505" } }] },
  { title: "gold polygon - 2", symbolizers: [{ Polygon: { fill: "#F28705" } }] },
  { title: "gold polygon - 3", symbolizers: [{ Polygon: { fill: "#F2E205" } }] },
  { title: "gold polygon - 4", symbolizers: [{ Polygon: { fill: "#078C03" } }] }
] }] });
const WFS = JSON.stringify({ features: [{ properties: {
  District: "CHENNAI", Obj_id: 78, Date: "2026-11-18", updated_at: "2026-11-18T12:23:52Z",
  Day_1: "1", Day_2: "2,4", Day_3: "1", Day_4: "1", Day_5: "1",
  Day1_Color: 4, Day2_Color: 2, Day3_Color: 4, Day4_Color: 3, Day5_Color: 4,
  Day1_text: "", Day2_text: "", Day3_text: "", Day4_text: "", Day5_text: ""
} }] });
const NOWCAST = `legend: {
  divId: "legenddiv",
  "data": [{ "title": "No warning", "color": "#008000" }, { "title": "Watch", "color": "#FFFF00" },
           { "title": "Alert", "color": "#FFA500" }, { "title": "Warning", "color": "#FF0000" }]
}
"areas": [
  { "title": "NICOBAR", "id": "573", "color": "#FFFF00", "info": "<p>Light rain<\\/br>Time of issue: 2026-11-18<\\/br>2100 Hrs<\\/br> Valid upto: 2359 Hrs <\\/p>" },
  { "title": "CHENNAI", "id": "78", "color": "#FFA500",
    "info": "<p>Moderate Thunderstorm with lightning </br></br>Time of issue: 2026-11-18</br>2200 Hrs</br> Valid upto: 0100 Hrs </p>" }
]`;

describe("IMD live lane: parsing", () => {
  it("reads IMD's dates, times and HTML the collector's way", () => {
    expect(labelDate("Nov 18, 2026")).toBe("2026-11-18");
    expect(labelDate("November 3, 2026")).toBe("2026-11-03");
    expect(toIst("2026-11-18T12:23:52Z")).toBe("2026-11-18 17:53:52");
    expect(htmlText("<p>No Warning </br></br>Time of issue: 2026-11-18</br>2200 Hrs</br> Valid upto: 0100 Hrs </p>"))
      .toBe("No Warning; Time of issue: 2026-11-18; 2200 Hrs; Valid upto: 0100 Hrs");
  });

  it("turns the GIS layer into five day warnings with IMD's colours", () => {
    const w = parseGis(PAGE, LEGEND, WFS);
    expect(w).toHaveLength(5);
    expect(w[0]).toEqual({ kind: "day", at: "2026-11-18 00:00:00", level: 0, text: "No Warning", issued: "2026-11-18 17:53:52" });
    expect(w[1]).toMatchObject({ at: "2026-11-19 00:00:00", level: 2, text: "Heavy Rain, Thunderstorms & Lightning, Squall etc" });
    // days without a page label count on from the layer's date
    expect(w[3]).toMatchObject({ at: "2026-11-21 00:00:00", level: 1 });
  });

  it("refuses a GIS answer with a part missing instead of saying 'no warning'", () => {
    expect(() => parseGis(PAGE, LEGEND, JSON.stringify({ features: [] }))).toThrow(/missing parts/);
  });

  it("reads Chennai's nowcast, not another district's", () => {
    expect(parseNowcast(NOWCAST)).toEqual({ kind: "nowcast", at: "2026-11-18 22:00:00", level: 2, text: "Moderate Thunderstorm with lightning", issued: "2026-11-18 22:00:00" });
  });

  it("reads an RMC day page when the GIS service is down", () => {
    const html = `<input type="radio" value="Day_2"> November 19, 2026 ${NOWCAST.replace(
      /"info": "<p>Moderate[^"]*"/, `"balloonText": "CHENNAI<p>Heavy rain at isolated places</p><p>Updated on : 2026-11-18</p>"`)}`;
    expect(parseRmcDay(html, 2)).toEqual({ kind: "day", at: "2026-11-19 00:00:00", level: 2, text: "Heavy rain at isolated places", issued: "2026-11-18 00:00:00" });
  });

  it("words the console's toast plainly", () => {
    expect(warnNote({ kind: "nowcast", at: "2026-11-18 16:00:00", level: 2, text: "Heavy Rain", issued: null }))
      .toBe("IMD nowcast for Chennai: Orange (Heavy Rain), issued 4:00 PM");
    expect(warnNote({ kind: "day", at: "2026-11-19 00:00:00", level: 0, text: "No Warning", issued: null }))
      .toMatch(/^IMD warning for Chennai on Thu, 19 Nov: no warning$/);
  });
});

describe("IMD live lane: laying it over the build", () => {
  const { DatabaseSync } = (process as any).getBuiltinModule("node:sqlite");
  const build = () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE observations (metric TEXT, value REAL, unit TEXT, place_type TEXT, place_id TEXT, place_name TEXT, lat REAL, lon REAL,
      ward_no INTEGER, zone_no INTEGER, taluk_code TEXT, observed_at TEXT, period TEXT, source TEXT, quality TEXT, is_synthetic INTEGER, detail TEXT);
      CREATE TABLE observation_signals (metric TEXT, place_id TEXT, observed_at TEXT, value REAL, detail TEXT);
      INSERT INTO observation_signals VALUES ('imd_warning_level', 'CHENNAI', '2026-11-18 19:00:00', 0, 'No Warning');`);
    const ins = db.prepare(`INSERT INTO observations VALUES ('imd_warning_level', ?, '0=green..3=red', 'district', 'CHENNAI', 'Chennai district',
      13.0827, 80.2707, 58, 5, NULL, ?, 'day', 'imd', 'ok', 0, ?)`);
    ins.run(0, "2026-11-18 00:00:00", "No Warning");
    ins.run(0, "2026-11-18 19:00:00", "No Warning");
    ins.run(0, "2026-11-19 00:00:00", "No Warning");
    return db;
  };
  const rows = (db: any) => db.prepare(`SELECT observed_at, value, detail, ward_no FROM observations ORDER BY observed_at`).all();

  it("adds a new nowcast, replaces a changed day and follows the newest in the signals row", () => {
    const db = build();
    const r = applyImd(db, [
      { kind: "day", at: "2026-11-18 00:00:00", level: 0, text: "No Warning", issued: null },
      { kind: "day", at: "2026-11-19 00:00:00", level: 2, text: "Heavy Rain", issued: null },
      { kind: "nowcast", at: "2026-11-18 22:00:00", level: 1, text: "Light rain", issued: null }
    ], "2026-11-18 22:05:00");
    expect(r.changed).toBe(2);
    expect(r.raised.map((w) => w.at)).toEqual(["2026-11-19 00:00:00", "2026-11-18 22:00:00"]); // the highest level first
    expect(rows(db)).toHaveLength(4);
    expect(rows(db).find((x: any) => x.observed_at === "2026-11-19 00:00:00")).toMatchObject({ value: 2, detail: "Heavy Rain", ward_no: 58 });
    expect(db.prepare(`SELECT observed_at, value, detail FROM observation_signals`).get())
      .toEqual({ observed_at: "2026-11-18 22:00:00", value: 1, detail: "Light rain" });
  });

  it("changes nothing when IMD says what the build already says, and a new 'no warning' nowcast is not news", () => {
    const db = build();
    expect(applyImd(db, [{ kind: "day", at: "2026-11-18 00:00:00", level: 0, text: "No Warning", issued: null }]).changed).toBe(0);
    const r = applyImd(db, [{ kind: "nowcast", at: "2026-11-18 22:00:00", level: 0, text: "No Warning", issued: null }], "2026-11-18 22:05:00");
    expect(r).toEqual({ changed: 1, raised: [] });
  });
});
