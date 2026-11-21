/**
 * "Load your own list" (Ask the Map final): an officer's CSV or Excel file (or a PDF, read by Claude Haiku 5.5) becomes a reviewable draft of
 * places; once the officer approves it, it is the map's `my_list` layer, which any plan can take ("garbage near my list", "places on my list
 * more than 2 km from a ration shop"). Nothing shows on the map before approval.
 *
 * Each row is placed from its own latitude and longitude when it has them (inside the district's box), else from a locality, ward or
 * neighbourhood name the map already knows (at that place's centre: marked "approximate"), else it is listed as not placed, with the reason.
 * Limits: 2 MB a file, 2,000 rows, 40 columns, 200 characters a cell; 20 lists kept. A cell that starts with = + - @ is kept as text (never a
 * formula when exported). Lists live in data/map-lists/ (not committed). Pure parsing (parseRows, placeRows) is unit-tested apart from the store.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { pointInPolygon } from "./geom";
import type { PointFeat, WardGeo } from "./types";

export const UPLOAD_LIMITS = { bytes: 2 * 1024 * 1024, rows: 2000, cols: 40, cell: 200, lists: 20 } as const;
/** the district's box with the same 3 km margin as the OpenStreetMap layers (data/layers/meta.json bbox) */
export const CHENNAI_BOX = { s: 12.82502, w: 80.11251, n: 13.26213, e: 80.35889 } as const;

export type How = "exact" | "approximate" | "none";
export interface ListRow { n: number; name: string; lat: number | null; lon: number | null; how: How; why: string | null; ward: number | null; kind: string | null; note: string | null }
export interface PlaceList {
  id: string; name: string; owner: string; created: string; status: "draft" | "approved"; approvedBy: string | null; approvedAt: string | null;
  source: { file: string; kind: "csv" | "xlsx" | "pdf"; columns: string[] }; rows: ListRow[];
}

const clean = (v: unknown): string => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, UPLOAD_LIMITS.cell);
/** keeps a cell as text when exported: a leading = + - @ would be read as a formula by a spreadsheet */
export const safeCell = (s: string) => (/^[=+\-@]/.test(s) ? `'${s}` : s);

/** The table in a CSV or Excel file: its header and rows, capped. Throws a plain-words Error for a file that cannot be read. */
export function parseTable(buf: Buffer, file: string): { columns: string[]; rows: Record<string, string>[]; kind: "csv" | "xlsx"; capped: boolean } {
  if (buf.length > UPLOAD_LIMITS.bytes) throw new Error(`The file is over ${UPLOAD_LIMITS.bytes / 1024 / 1024} MB.`);
  const kind = /\.csv$/i.test(file) ? "csv" : /\.xlsx?$/i.test(file) ? "xlsx" : null;
  if (!kind) throw new Error("Use a CSV or an Excel (.xlsx) file.");
  let wb: XLSX.WorkBook;
  try {
    // dense: no formulas evaluated, dates as text; a CSV is read as UTF-8
    wb = kind === "csv" ? XLSX.read(buf.toString("utf8").replace(/^﻿/, ""), { type: "string", raw: true, cellFormula: false })
      : XLSX.read(buf, { type: "buffer", cellFormula: false, cellHTML: false, cellText: true, sheetRows: UPLOAD_LIMITS.rows + 1 });
  } catch { throw new Error("The file could not be read as a table."); }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("The file has no sheet.");
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false });
  if (!grid.length) throw new Error("The file is empty.");
  const head = (grid[0] as unknown[]).slice(0, UPLOAD_LIMITS.cols).map((h, i) => clean(h) || `column ${i + 1}`);
  const body = grid.slice(1).filter((r) => (r as unknown[]).some((c) => clean(c)));
  const rows = body.slice(0, UPLOAD_LIMITS.rows).map((r) => Object.fromEntries(head.map((h, i) => [h, clean((r as unknown[])[i])])));
  return { columns: head, rows, kind, capped: body.length > UPLOAD_LIMITS.rows };
}

const COL = {
  lat: /^(lat|latitude|y|lat\.?|gps lat)$/i, lon: /^(lon|lng|long|longitude|x|lon\.?|gps lon|gps long)$/i,
  name: /^(name|shop|shop name|place|place name|title|outlet|centre|center|branch|institution|facility)$/i,
  place: /^(address|addr|location|locality|area|street|place|village|neighbourhood|neighborhood)$/i,
  ward: /^(ward|ward no|ward number|ward_no|wardno)$/i, kind: /^(type|kind|category)$/i
};
/** Which column holds what, by its header (the first that fits); `name` falls back to the first column. */
export function columnsOf(columns: string[]): { lat: string | null; lon: string | null; name: string | null; place: string | null; ward: string | null; kind: string | null } {
  const pick = (re: RegExp) => columns.find((c) => re.test(c.trim())) ?? null;
  const name = pick(COL.name) ?? columns.find((c) => !Object.values(COL).some((re) => re.test(c.trim()))) ?? columns[0] ?? null;
  const place = columns.find((c) => COL.place.test(c.trim()) && c !== name) ?? null;
  return { lat: pick(COL.lat), lon: pick(COL.lon), name, place, ward: pick(COL.ward), kind: pick(COL.kind) };
}

/** A number written as a coordinate ("13.0827", "13° 4' 57\"N" is not read). */
const num = (s: string | null | undefined): number | null => { const v = s != null && /^-?\d{1,3}(\.\d+)?$/.test(s.trim()) ? Number(s) : NaN; return Number.isFinite(v) ? v : null; };
export const inBox = (lat: number, lon: number) => lat >= CHENNAI_BOX.s && lat <= CHENNAI_BOX.n && lon >= CHENNAI_BOX.w && lon <= CHENNAI_BOX.e;

/** The ward a point falls in (by the ward rings), else null. */
export function wardAt(lat: number, lon: number, wards: WardGeo[]): number | null {
  for (const w of wards) if (lat >= w.bbox.s && lat <= w.bbox.n && lon >= w.bbox.w && lon <= w.bbox.e && pointInPolygon({ lat, lon }, w.rings)) return w.ward;
  return null;
}

/**
 * Places each row: its own coordinates (exact), else a known place name in its address or locality column (approximate, the place's centre),
 * else its ward number (approximate, the ward's centre), else not placed. `find` is the map's own place resolver: names only, nothing sent out.
 */
export function placeRows(rows: Record<string, string>[], cols: ReturnType<typeof columnsOf>, wards: WardGeo[],
  find: (text: string) => { lat: number; lon: number; name: string } | null): ListRow[] {
  const seen = new Set<string>();
  return rows.map((r, i): ListRow => {
    const name = (cols.name ? r[cols.name] : "") || `Row ${i + 1}`;
    const kind = cols.kind ? r[cols.kind] || null : null;
    const base = { n: i + 1, name, kind, note: null as string | null };
    const lat = num(cols.lat ? r[cols.lat] : null), lon = num(cols.lon ? r[cols.lon] : null);
    let out: ListRow;
    if (lat != null && lon != null) {
      out = inBox(lat, lon) ? { ...base, lat, lon, how: "exact", why: null, ward: wardAt(lat, lon, wards) }
        : inBox(lon, lat) ? { ...base, lat: lon, lon: lat, how: "exact", why: null, ward: wardAt(lon, lat, wards), note: "latitude and longitude were the other way round" }
          : { ...base, lat: null, lon: null, how: "none", why: "its latitude and longitude are outside Chennai", ward: null };
    } else {
      // the address or locality only: a row's own name ("Relief Centre C") is no place
      const text = cols.place ? r[cols.place] : "";
      const hit = text ? find(text) : null;
      const wn = num(cols.ward ? r[cols.ward] : null);
      const wd = wn != null ? wards.find((w) => w.ward === Math.round(wn)) : undefined;
      out = hit ? { ...base, lat: hit.lat, lon: hit.lon, how: "approximate", why: null, ward: wardAt(hit.lat, hit.lon, wards), note: `placed at ${hit.name}` }
        : wd ? { ...base, lat: wd.lat, lon: wd.lon, how: "approximate", why: null, ward: wd.ward, note: `placed at the middle of Ward ${wd.ward}` }
          : { ...base, lat: null, lon: null, how: "none", why: text ? "no place the map knows is named in it" : "no latitude, longitude, locality or ward", ward: null };
    }
    // the same name at the same spot twice: kept once
    const key = `${name.toLowerCase()}|${out.lat?.toFixed(4)}|${out.lon?.toFixed(4)}`;
    if (out.how !== "none" && seen.has(key)) return { ...out, how: "none", lat: null, lon: null, why: "the same place is on an earlier row" };
    seen.add(key);
    return out;
  });
}

// ------------------------------------------------------------------ store --

const DIR = () => process.env.MAP_LISTS_DIR || path.join(process.cwd(), "data", "map-lists");
const idOk = (id: string) => /^[a-f0-9]{12}$/.test(id);
const fileOf = (id: string) => path.join(DIR(), `${id}.json`);

export function saveList(l: Omit<PlaceList, "id" | "created" | "status" | "approvedBy" | "approvedAt">): PlaceList {
  fs.mkdirSync(DIR(), { recursive: true });
  const all = listLists();
  // the oldest draft goes first when the store is full; approved lists are never dropped without the officer
  if (all.length >= UPLOAD_LIMITS.lists) {
    const old = all.filter((x) => x.status === "draft").sort((a, b) => a.created.localeCompare(b.created))[0];
    if (!old) throw new Error(`There are already ${UPLOAD_LIMITS.lists} approved lists. Remove one first.`);
    fs.rmSync(fileOf(old.id), { force: true });
  }
  const list: PlaceList = { ...l, id: crypto.randomBytes(6).toString("hex"), created: new Date().toISOString(), status: "draft", approvedBy: null, approvedAt: null };
  fs.writeFileSync(fileOf(list.id), JSON.stringify(list));
  bump();
  return list;
}
export function getList(id: string): PlaceList | null {
  if (!idOk(id)) return null;
  try { return JSON.parse(fs.readFileSync(fileOf(id), "utf8")) as PlaceList; } catch { return null; }
}
export function listLists(): PlaceList[] {
  try {
    return fs.readdirSync(DIR()).filter((f) => /^[a-f0-9]{12}\.json$/.test(f)).map((f) => getList(f.slice(0, 12))).filter((x): x is PlaceList => !!x)
      .sort((a, b) => b.created.localeCompare(a.created));
  } catch { return []; }
}
/** Only the officer who uploaded a list, or a Collector, may approve or remove it. */
export const mayChange = (l: PlaceList, user: { email: string; role: string }) => l.owner === user.email || user.role === "collector";
export function approveList(id: string, by: string): PlaceList | null {
  const l = getList(id);
  if (!l) return null;
  const done: PlaceList = { ...l, status: "approved", approvedBy: by, approvedAt: new Date().toISOString() };
  fs.writeFileSync(fileOf(id), JSON.stringify(done));
  bump();
  return done;
}
export function removeList(id: string): boolean {
  if (!getList(id)) return false;
  fs.rmSync(fileOf(id), { force: true });
  bump();
  return true;
}

declare global {
  // eslint-disable-next-line no-var
  var __mapLists: { v: number; at: number; pts: PointFeat[] } | undefined;
}
let version = 0;
const bump = () => { version++; };
/** The approved lists' placed rows as the map's my_list layer (read again when a list changes, or every 30 s from another process). */
export function myListPoints(): PointFeat[] {
  const g = global.__mapLists;
  if (g && g.v === version && Date.now() - g.at < 30_000) return g.pts;
  const pts: PointFeat[] = listLists().filter((l) => l.status === "approved").flatMap((l) => l.rows.filter((r) => r.how !== "none" && r.lat != null && r.lon != null)
    .map((r) => ({ id: `list:${l.id}:${r.n}`, layer: "my_list" as const, name: r.name, name_ta: null, lat: r.lat!, lon: r.lon!, kind: l.id, in_district: r.ward != null, ward: r.ward })));
  global.__mapLists = { v: version, at: Date.now(), pts };
  return pts;
}
