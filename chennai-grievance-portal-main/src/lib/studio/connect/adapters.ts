/**
 * Sites whose data sits behind their own open API rather than in the page: a link to the site is read through that API,
 * the way the site's own pages read it (robots.txt allows it; no sign-in, no CAPTCHA).
 *
 *   agmarknet.gov.in   market prices and arrivals: the open dashboard API the console's market collector already uses,
 *                      for the markets around Chennai (Chengalpattu, Kancheepuram, Thiruvallur), else all of Tamil Nadu
 */
import { checkHost, LinkError, UA } from "@/lib/studio/fetchurl";
import type { Cell, Table } from "@/lib/studio/parse";

export interface Adapted { table: Table; label: string; url: string; raw: Buffer }

const AGM = "https://api.agmarknet.gov.in/v1/dashboard-data/";
const AGM_SCOPES = [
  { label: "markets around Chennai", district: [528, 536, 560] },
  { label: "Tamil Nadu", district: [100007] }
];
type Row = Record<string, unknown>;

async function agm(date: string, district: number[]): Promise<{ rows: Row[]; titles: Record<string, string> }> {
  const r = await fetch(AGM, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ dashboard: "marketwise_price_arrival", date, group: [100000], commodity: [100001], variety: 100021, state: 31, district,
      grades: [4, 100011], limit: 200, format: "json" }),
    signal: AbortSignal.timeout(30_000)
  });
  if (r.status >= 400) throw new LinkError(`AGMARKNET answered HTTP ${r.status}.`, "http", r.status);
  const j = await r.json() as { data?: { records?: Row[]; columns?: { key: string; title?: string; columns?: { key: string; title: string }[] }[] } };
  const titles: Record<string, string> = {};
  for (const g of j.data?.columns ?? []) for (const c of g.columns ?? []) titles[c.key] = `${g.title && g.key !== "commodity_info" ? `${g.title.replace(/\s*\(.*\)$/, "")}, ` : ""}${c.title}`;
  return { rows: j.data?.records ?? [], titles };
}

async function agmarknet(log: (t: string) => void): Promise<Adapted> {
  await checkHost(new URL(AGM));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  for (const sc of AGM_SCOPES) {
    // the newest day with prices (AGMARKNET's latest days fill in late)
    for (let back = 0; back < 8; back++) {
      const day = iso(new Date(Date.now() - back * 864e5));
      const { rows, titles } = await agm(day, sc.district);
      if (!rows.length) continue;
      if (rows.length < 10 && sc !== AGM_SCOPES[AGM_SCOPES.length - 1]) { log(`Only ${rows.length} commodities reported for the ${sc.label}: reading Tamil Nadu instead.`); break; }
      const keys = ["cmdt_grp_name", "cmdt_name", "as_on_price", "one_day_ago_price", "two_day_ago_price", "as_on_arrival", "msp_price"];
      const name: Record<string, string> = { cmdt_grp_name: "Commodity group", cmdt_name: "Commodity", as_on_price: `Price ${titles.as_on_price ?? "latest"} (Rs/quintal)`,
        one_day_ago_price: `Price ${titles.one_day_ago_price ?? "1 day before"} (Rs/quintal)`, two_day_ago_price: `Price ${titles.two_day_ago_price ?? "2 days before"} (Rs/quintal)`,
        as_on_arrival: "Arrival (tonnes)", msp_price: "MSP (Rs/quintal)" };
      const headers = keys.map((k) => name[k].replace(/Price Price, /, "Price ").replace(/, /g, " "));
      const grid: Cell[][] = rows.map((r) => keys.map((k) => { const v = r[k]; return v == null || v === "" ? null : typeof v === "number" ? v : Number.isFinite(Number(v)) && k !== "cmdt_name" && k !== "cmdt_grp_name" ? Number(v) : String(v); }));
      log(`AGMARKNET open API: ${rows.length} commodities for the ${sc.label}, reported on ${day}.`);
      return {
        table: { headers, rows: grid, sheet: null, sheets: [], caption: `AGMARKNET market prices and arrivals, ${sc.label}, latest prices for ${(titles.as_on_price ?? day).replace(/^Price,\s*/, "")}`, format: "json", truncated: 0 },
        label: `AGMARKNET prices, ${sc.label}`, url: AGM, raw: Buffer.from(JSON.stringify(rows))
      };
    }
  }
  throw new LinkError("AGMARKNET reported no prices for Tamil Nadu in the last 8 days.", "empty");
}

/** The adapter for a link, when its site has one. */
export function adapterFor(url: string): ((log: (t: string) => void) => Promise<Adapted>) | null {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  if (/(^|\.)agmarknet\.gov\.in$/.test(host)) return agmarknet;
  return null;
}
