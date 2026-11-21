/**
 * Ask the Map final: "Load your own list" (uploads.ts) and the meeting packs (packs.ts) on the fixture world. The parser's limits and column
 * reading, how each row is placed, the store's draft-then-approve rule, and the packs' facts and number gate.
 */
import fs from "fs";
import os from "os";
import path from "path";
import * as XLSX from "xlsx";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureWorld } from "./fixture";
import { allowedNumbers, buildPack, gateSentence, packHtml, packSvg } from "./packs";
import { approveList, columnsOf, getList, listLists, mayChange, myListPoints, parseTable, placeRows, removeList, safeCell, saveList, UPLOAD_LIMITS } from "./uploads";

const w = fixtureWorld();
const csv = (s: string) => Buffer.from(s, "utf8");
const find = (t: string) => (/testpet/i.test(t) ? { lat: 13.005, lon: 80.215, name: "Testpet" } : null);

describe("reading a table", () => {
  it("reads a CSV's header and rows, and keeps a formula as text", () => {
    const t = parseTable(csv("Name,Latitude,Longitude,Locality\n﻿Shop A,13.005,80.205,\n=HYPERLINK(1),13.015,80.215,\n"), "shops.csv");
    expect(t.columns).toEqual(["Name", "Latitude", "Longitude", "Locality"]);
    expect(t.rows).toHaveLength(2);
    expect(safeCell(t.rows[1].Name)).toBe("'=HYPERLINK(1)");
  });
  it("reads an Excel sheet", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["name", "ward"], ["Centre 1", 2], ["Centre 2", 3]]), "S");
    const t = parseTable(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, "c.xlsx");
    expect(t.rows.map((r) => r.ward)).toEqual(["2", "3"]);
  });
  it("refuses other files and files over the limit, in plain words", () => {
    expect(() => parseTable(csv("a"), "x.txt")).toThrow(/CSV or an Excel/);
    expect(() => parseTable(Buffer.alloc(UPLOAD_LIMITS.bytes + 1), "x.csv")).toThrow(/over 2 MB/);
  });
  it("caps the rows and says so", () => {
    const t = parseTable(csv(["name", ...Array.from({ length: UPLOAD_LIMITS.rows + 5 }, (_, i) => `r${i}`)].join("\n")), "big.csv");
    expect(t.rows).toHaveLength(UPLOAD_LIMITS.rows);
    expect(t.capped).toBe(true);
  });
  it("finds the columns by their headers", () => {
    expect(columnsOf(["S.No", "Shop Name", "Address", "Lat", "Long", "Ward No"])).toMatchObject({ name: "Shop Name", place: "Address", lat: "Lat", lon: "Long", ward: "Ward No" });
  });
});

describe("placing the rows", () => {
  const cols = columnsOf(["name", "lat", "lon", "locality", "ward"]);
  const rows = placeRows([
    { name: "Exact", lat: "13.005", lon: "80.205", locality: "", ward: "" },
    { name: "Swapped", lat: "80.215", lon: "13.015", locality: "", ward: "" },
    { name: "Far", lat: "28.6", lon: "77.2", locality: "", ward: "" },
    { name: "By name", lat: "", lon: "", locality: "Near Testpet bus stop", ward: "" },
    { name: "By ward", lat: "", lon: "", locality: "", ward: "3" },
    { name: "Nothing", lat: "", lon: "", locality: "Nowhere Nagar", ward: "" },
    { name: "Exact", lat: "13.005", lon: "80.205", locality: "", ward: "" }
  ], cols, w.wards, find);
  it("exact from its own coordinates, with the ward they fall in", () => expect(rows[0]).toMatchObject({ how: "exact", ward: 1 }));
  it("coordinates the other way round are swapped back, and said", () => expect(rows[1]).toMatchObject({ how: "exact", lat: 13.015, ward: 3, note: expect.stringMatching(/other way round/) }));
  it("coordinates outside Chennai are not placed", () => expect(rows[2]).toMatchObject({ how: "none", why: expect.stringMatching(/outside Chennai/) }));
  it("a known place name places it, approximately", () => expect(rows[3]).toMatchObject({ how: "approximate", lat: 13.005, note: "placed at Testpet" }));
  it("a ward number places it at the ward's middle, approximately", () => expect(rows[4]).toMatchObject({ how: "approximate", ward: 3 }));
  it("nothing usable: not placed, with the reason", () => expect(rows[5]).toMatchObject({ how: "none", why: expect.stringMatching(/no place the map knows/) }));
  it("the same place twice is kept once", () => expect(rows[6]).toMatchObject({ how: "none", why: expect.stringMatching(/earlier row/) }));
});

describe("the store: a draft is never on the map until approved", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "map-lists-"));
  const before = process.env.MAP_LISTS_DIR;
  beforeAll(() => { process.env.MAP_LISTS_DIR = dir; });
  afterAll(() => { process.env.MAP_LISTS_DIR = before; fs.rmSync(dir, { recursive: true, force: true }); });
  it("saves a draft, approves it, shows only then, removes it", () => {
    const rows = placeRows([{ name: "A", lat: "13.005", lon: "80.205" }, { name: "B", lat: "", lon: "" }], columnsOf(["name", "lat", "lon"]), w.wards, find);
    const l = saveList({ name: "Test list", owner: "o@x", source: { file: "a.csv", kind: "csv", columns: ["name", "lat", "lon"] }, rows });
    expect(l.status).toBe("draft");
    expect(myListPoints().some((p) => p.kind === l.id)).toBe(false);
    expect(mayChange(l, { email: "other@x", role: "department_officer" })).toBe(false);
    expect(mayChange(l, { email: "c@x", role: "collector" })).toBe(true);
    approveList(l.id, "o@x");
    const pts = myListPoints().filter((p) => p.kind === l.id);
    expect(pts.map((p) => p.name)).toEqual(["A"]);
    expect(getList(l.id)?.status).toBe("approved");
    expect(getList("../../etc")).toBeNull();
    removeList(l.id);
    expect(listLists().some((x) => x.id === l.id)).toBe(false);
    expect(myListPoints().some((p) => p.kind === l.id)).toBe(false);
  });
});

describe("meeting packs", () => {
  const ctx = { place: () => null, lang: "en" as const };
  for (const kind of ["weekly", "bank", "monsoon"] as const) it(`${kind}: every list and number comes from the server's plans`, () => {
    const p = buildPack(kind, w, ctx, null);
    expect(p.sections.length).toBeGreaterThan(0);
    for (const x of p.numbers) expect(Number.isFinite(x.value)).toBe(true);
    const html = packHtml({ ...p, sentences: ["A test sentence."], wordsBy: "template", svg: packSvg(w, p.sections[0].rows) });
    expect(html).toContain("<svg");
    expect(html).not.toMatch(/<script/);
  });
  it("weekly: the open count equals a plain count of open cases of the last 7 days", () => {
    const p = buildPack("weekly", w, ctx, null);
    const day = (s: string) => (Date.parse(w.now.replace(" ", "T") + "Z") - Date.parse(s.replace(" ", "T") + "Z")) / 86_400_000;
    const want = w.incidents.filter((i) => i.open && !i.routed && day(i.first) < 7 && day(i.first) >= 0).length;
    expect(p.numbers[0].value).toBe(want);
  });
  it("the number gate keeps a sentence only when every number is a fact", () => {
    const p = buildPack("weekly", w, ctx, null);
    const allowed = allowedNumbers(p);
    const v = p.numbers[0].value;
    expect(gateSentence(`There are ${v} open cases.`, allowed)).toBe(true);
    expect(gateSentence(`There are ${v + 9137} open cases.`, allowed)).toBe(false);
  });
});
