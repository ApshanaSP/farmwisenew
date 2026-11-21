/**
 * The server side of "Load your own list" (uploads.ts holds the parsing and the store): a file becomes a draft, read from a CSV or Excel
 * table, or from a PDF by Claude Haiku 5.5 (the rows it lists: name, address or locality, ward, coordinates if printed). The PDF's text is
 * sent to Claude only when the officer uploads it, only for this, under the owner's spend ceiling (claudebudget.ts); a list of shops or
 * centres, never complainants. Every number placed comes from the file or the map's own place names, never from the model.
 */
import { z } from "zod";
import { claudeConfigured, claudeJson } from "@/lib/ai/claude";
import { makeResolver } from "./resolve";
import { columnsOf, parseTable, placeRows, saveList, UPLOAD_LIMITS, type PlaceList } from "./uploads";
import { world } from "./world";

const PdfRows = z.object({
  rows: z.array(z.object({
    name: z.string().max(200), address: z.string().max(200).nullable(), ward: z.number().int().nullable(), lat: z.number().nullable(), lon: z.number().nullable(), kind: z.string().max(80).nullable()
  })).max(400)
});

/** The table a PDF lists, read by Claude Haiku 5.5: the rows as printed, nothing added. */
async function pdfTable(buf: Buffer): Promise<{ columns: string[]; rows: Record<string, string>[] }> {
  if (!claudeConfigured()) throw new Error("Reading a PDF needs the Claude API, which is not available just now. Upload the list as CSV or Excel instead.");
  const r = await claudeJson({
    name: "map-list-pdf", role: "fast", model: process.env.AI_MAP_CLAUDE_MODEL?.trim() || "claude-haiku-5-5", effort: "low", think: false, sentinels: true, schema: PdfRows,
    system: "You copy a list of places (shops, offices, centres) out of a government document into rows. Copy each place's name, address or locality, ward number and coordinates exactly as printed; leave a field empty when the document does not print it. Never guess, look up or add a place, a number or a coordinate. Leave out people's names, phone numbers and other personal details.",
    prompt: "Copy every listed place in this document into rows.", pdf: buf.toString("base64"), maxOutputTokens: 8000, timeoutMs: 60_000
  });
  const rows = r.object.rows.map((x) => ({ name: x.name, address: x.address ?? "", ward: x.ward != null ? String(x.ward) : "", lat: x.lat != null ? String(x.lat) : "", lon: x.lon != null ? String(x.lon) : "", type: x.kind ?? "" }));
  return { columns: ["name", "address", "ward", "lat", "lon", "type"], rows };
}

/** A file in, a draft list out (not on the map until approved). Throws a plain-words Error the panel can show. */
export async function draftFromFile(buf: Buffer, file: string, name: string, owner: string): Promise<PlaceList & { capped: boolean }> {
  if (buf.length > UPLOAD_LIMITS.bytes) throw new Error(`The file is over ${UPLOAD_LIMITS.bytes / 1024 / 1024} MB.`);
  const isPdf = /\.pdf$/i.test(file) && buf.subarray(0, 5).toString("latin1") === "%PDF-";
  const t = isPdf ? { ...(await pdfTable(buf)), kind: "pdf" as const, capped: false } : parseTable(buf, file);
  if (!t.rows.length) throw new Error("The file has a header but no rows.");
  const { world: w, resolver } = await world();
  const resolve = makeResolver(resolver);
  // a place the map knows, named whole in the address ("Velachery", "T. Nagar"): the resolver alone is lenient ("Nowhere Nagar" read as
  // T. Nagar, "Relief Centre" as Chennai Central), so its hit must also appear in the text as a phrase
  const flat = (s: string) => ` ${s.toLowerCase().replace(/[.,'’()\-_/]/g, " ").replace(/\s+/g, " ").trim()} `;
  // the localities and neighbourhoods the map knows, longest name first ("Velachery Main Road" is in Velachery)
  const named = resolver.entries.filter((e) => e.lat != null && (e.kind === "locality" || e.kind === "osm_place") && e.name_en.length >= 4)
    .map((e) => ({ e, k: flat(e.name_en) })).sort((a, b) => b.k.length - a.k.length);
  const find = (text: string) => {
    const t = flat(text);
    const hit = resolve(text, "in").find((f) => f.pick.entry.lat != null && ["locality", "osm_place", "facility"].includes(f.pick.entry.kind) && t.includes(flat(f.pick.entry.name_en)))?.pick.entry
      ?? named.find((x) => t.includes(x.k))?.e;
    return hit ? { lat: hit.lat!, lon: hit.lon!, name: hit.name_en } : null;
  };
  const cols = columnsOf(t.columns);
  const rows = placeRows(t.rows, cols, w.wards, find);
  const list = saveList({ name: name.trim().slice(0, 80) || file.replace(/\.[^.]+$/, "").slice(0, 80), owner, source: { file: file.slice(0, 120), kind: t.kind, columns: t.columns }, rows });
  return { ...list, capped: t.capped };
}
