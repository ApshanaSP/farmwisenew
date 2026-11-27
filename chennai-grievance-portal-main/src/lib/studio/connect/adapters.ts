/**
 * Sites whose data sits behind their own open API rather than in the page: a link to the site is read through that API,
 * the way the site's own pages read it (no sign-in, no CAPTCHA).
 *
 *   agmarknet.gov.in      27 Nov: AGMARKNET's API asks for a CAPTCHA since late October (never got around here). A link to it is
 *   agrimark.tn.gov.in    read instead from the TN Department of Agricultural Marketing & Agri Business's own Uzhavar Sandhai price
 *                         feed (lib/collector/tnprices.ts), the same numbers AGMARKNET showed for Tamil Nadu: the newest day the console
 *                         holds for the markets in and around Chennai, or that day read now from agrimark when nothing recent is held.
 */
import { checkHost, LinkError } from "@/lib/studio/fetchurl";
import type { Cell, Table } from "@/lib/studio/parse";
import { TN_MARKETS, TN_SITE, TN_SOURCE, fetchMarketDay, fileDay, type TnCell } from "@/lib/collector/tnprices";

export interface Adapted { table: Table; label: string; url: string; raw: Buffer }

const HEADERS = ["Date", "Market", "District", "Commodity", "Variety", "Group", "Low (Rs/kg)", "High (Rs/kg)", "Price (Rs/kg)", "Arrival (kg)"];
const istDay = (ms = Date.now()) => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
const perKg = (v: number | null) => (v == null ? null : Math.round(v) / 100);

/** The newest day's Uzhavar Sandhai prices around Chennai as a table: the console's own copy when it is at most 3 days old, else read now. */
async function tnPrices(log: (t: string) => void, asked: "agmarknet" | "agrimark"): Promise<Adapted> {
  if (asked === "agmarknet") log("AGMARKNET's API asks for a CAPTCHA, which is never got around: reading the same Tamil Nadu prices from agrimark.tn.gov.in, the TN Agricultural Marketing department's own feed.");
  const district = new Map(TN_MARKETS.map((m) => [m.key, m.district]));
  const today = istDay();
  let held = fileDay(today);
  const stale = !held || Date.parse(`${today}T00:00:00Z`) - Date.parse(`${held.day}T00:00:00Z`) > 3 * 864e5;
  // (27 Nov review: a site that answers none of the first three calls, down or refusing this server, is not asked the other 13 at 20 s each)
  let calls = 0, fails = 0;
  const noAnswer = () => fails >= 3 && fails === calls;
  if (stale) {
    await checkHost(new URL(TN_SITE));
    // today's prices are entered during the morning: yesterday first when today has none yet
    for (const day of [istDay(Date.now() - 864e5), today]) {
      const got: { market: string; cells: TnCell[] }[] = [];
      for (const m of TN_MARKETS) {
        if (noAnswer()) break;
        calls++;
        const cells = await fetchMarketDay(day, m).catch((e) => { fails++; log(`${m.key}: ${(e as Error).message}`); return null; });
        if (cells?.length) got.push({ market: m.key, cells });
        await new Promise((r) => setTimeout(r, 400));
      }
      if (got.length) {
        held = { day, rows: got.flatMap(({ market, cells }) => cells.map((c) => ({ d: day, market, commodity: c[0], variety: c[1], grp: c[6], min: c[2], max: c[3], modal: c[4], arrival: c[5],
          qtyKg: c[5] == null ? null : Math.round(c[5] * 1000) }))) };
        break;
      }
    }
  }
  if (!held?.rows.length && noAnswer()) throw new LinkError("agrimark.tn.gov.in did not answer this server, and no recent prices are kept here. Try again later.", "network");
  if (!held?.rows.length) throw new LinkError("The Uzhavar Sandhai markets around Chennai have entered no prices on agrimark.tn.gov.in in the last few days.", "empty");
  const grid: Cell[][] = held.rows.map((r) => [r.d, r.market, district.get(r.market) ?? null, r.commodity, r.variety || null, r.grp, perKg(r.min), perKg(r.max), perKg(r.modal), r.qtyKg]);
  const markets = new Set(held.rows.map((r) => r.market)).size;
  log(`${TN_SOURCE}: ${held.rows.length} prices at ${markets} Uzhavar Sandhai markets around Chennai, for ${held.day}.`);
  return {
    table: { headers: HEADERS, rows: grid, sheet: null, sheets: [], format: "json", truncated: 0,
      caption: `Uzhavar Sandhai farmer-market retail prices (Rs per kg) in and around Chennai, ${held.day}. Source: ${TN_SOURCE}.` },
    label: `Uzhavar Sandhai prices around Chennai, ${held.day}`, url: TN_SITE, raw: Buffer.from(JSON.stringify(held.rows))
  };
}

/** The adapter for a link, when its site has one. */
export function adapterFor(url: string): ((log: (t: string) => void) => Promise<Adapted>) | null {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  if (/(^|\.)agmarknet\.gov\.in$/.test(host)) return (log) => tnPrices(log, "agmarknet");
  if (/(^|\.)agrimark\.tn\.gov\.in$/.test(host)) return (log) => tnPrices(log, "agrimark");
  return null;
}
