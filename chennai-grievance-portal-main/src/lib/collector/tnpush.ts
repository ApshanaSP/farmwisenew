/**
 * The hosted copy cannot reach agrimark.tn.gov.in: the site refuses connections from outside India (tested 27 Nov 2026 from the Modal
 * container in us-east: no connection in 60 s, while other sites answered in 70 ms). The PC, which can, sends the hosted copy the prices it
 * collected:
 *   - the PC (TN_PRICES_PUSH_URL set): after each collection, POST the last PUSH_DAYS days of its tn-prices.json to
 *     <TN_PRICES_PUSH_URL>/api/collector/jobs/tn-prices, with the team's REFRESH_API_KEY in `x-job-key`;
 *   - the hosted copy: checks every entry and merges it into its own file, the newer reading of a day at a market winning (as the image's
 *     seed is merged), then the dashboard's and Jarvis's kept reads start again.
 */
import { addDays, loadTn, saveTn, TN_MARKET_KEYS, type TnCell } from "./tnprices";
import { bumpDataEpoch } from "@/lib/collector/epoch";

export const PUSH_DAYS = 20;
/** the most a push may carry: 20 days of 8 markets at about 60 items each is about 0.4 MB */
export const PUSH_MAX_BYTES = 3_000_000;

type Saved = ReturnType<typeof loadTn>;
type Entry = Saved["days"][string][string];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const num = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e7);
const text = (v: unknown, n: number) => typeof v === "string" && v.length <= n;

/** one price row as the file keeps it: [commodity, variety, min, max, modal, arrival, group] */
function cellOk(c: unknown): c is TnCell {
  return Array.isArray(c) && c.length === 7 && text(c[0], 80) && (c[0] as string).length > 0 && text(c[1], 80) && num(c[2]) && num(c[3])
    && typeof c[4] === "number" && num(c[4]) && num(c[5]) && (c[6] === null || text(c[6], 40));
}

/** The entries of a pushed body that are well formed: known markets, real days, at most 400 rows each. Anything else is dropped. */
export function cleanPush(body: unknown): Record<string, Record<string, Entry>> {
  const out: Record<string, Record<string, Entry>> = {};
  const days = (body as { days?: unknown } | null)?.days;
  if (!days || typeof days !== "object") return out;
  for (const [d, byM] of Object.entries(days as Record<string, unknown>)) {
    if (!DAY.test(d) || !byM || typeof byM !== "object") continue;
    for (const [k, e] of Object.entries(byM as Record<string, unknown>)) {
      const en = e as { at?: unknown; rows?: unknown } | null;
      if (!TN_MARKET_KEYS.includes(k) || !en || typeof en.at !== "string" || !STAMP.test(en.at) || !Array.isArray(en.rows) || en.rows.length > 400) continue;
      if (!en.rows.every(cellOk)) continue;
      (out[d] ??= {})[k] = { at: en.at, rows: en.rows as TnCell[] };
    }
  }
  return out;
}

/** The hosted copy's side: merge a push into the kept file. Returns how many day-and-market entries were new or newer. */
export function acceptPush(body: unknown): number {
  const got = cleanPush(body);
  const s = loadTn();
  let n = 0;
  for (const [d, byM] of Object.entries(got)) for (const [k, e] of Object.entries(byM)) {
    const cur = s.days[d]?.[k];
    if (cur && cur.at >= e.at) continue;
    (s.days[d] ??= {})[k] = e;
    n++;
  }
  if (n) { saveTn(s); bumpDataEpoch(); }
  return n;
}

/** The PC's side: what it sends, the last PUSH_DAYS days of its file. */
export function pushBody(today: string, days = PUSH_DAYS): { days: Saved["days"] } {
  const from = addDays(today, -days);
  const s = loadTn();
  return { days: Object.fromEntries(Object.entries(s.days).filter(([d]) => d >= from)) };
}

/**
 * Send the PC's recent prices to the hosted copy. Does nothing unless TN_PRICES_PUSH_URL and REFRESH_API_KEY are set (only the PC's .env
 * has the URL; deploy/modal/make_secret.cjs leaves it out of the hosted copy's keys). Never throws: the result says what happened.
 */
export async function pushTnPrices(o: { url?: string; key?: string; today?: string; fetcher?: typeof fetch } = {}): Promise<{ sent: number; merged: number | null; error: string | null }> {
  const url = (o.url ?? process.env.TN_PRICES_PUSH_URL ?? "").trim().replace(/\/+$/, "");
  const key = (o.key ?? process.env.REFRESH_API_KEY ?? "").trim();
  if (!url || !key) return { sent: 0, merged: null, error: null };
  const today = o.today ?? new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const body = pushBody(today);
  const sent = Object.values(body.days).reduce((n, byM) => n + Object.keys(byM).length, 0);
  if (!sent) return { sent: 0, merged: null, error: null };
  try {
    const r = await (o.fetcher ?? fetch)(`${url}/api/collector/jobs/tn-prices`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-job-key": key }, body: JSON.stringify(body), signal: AbortSignal.timeout(240_000) // a sleeping hosted copy takes a while to start
    });
    const j = (await r.json().catch(() => null)) as { merged?: number; error?: string } | null;
    return r.ok ? { sent, merged: Number(j?.merged ?? 0), error: null } : { sent, merged: null, error: `the hosted copy answered ${r.status}${j?.error ? `: ${j.error}` : ""}` };
  } catch (e) {
    return { sent, merged: null, error: `could not reach the hosted copy: ${String((e as Error)?.message ?? e).slice(0, 120)}` };
  }
}
