#!/usr/bin/env node
/**
 * Fills data/aws-cache/tn-prices.json with the Uzhavar Sandhai prices of a range of days, from the TN Department of Agricultural
 * Marketing & Agri Business (agrimark.tn.gov.in), with the collector's own code (src/lib/collector/tnprices.ts). The file only: the store
 * is never written here (the running website reads the file, and lays the newest days into the store itself where its store keeps them).
 *
 *   node scripts/tn-prices-backfill.cjs --from 2026-10-07 --to 2026-11-26 [--gap 1000] [--force]
 *
 * One market at a time, --gap ms between calls (default 1000), a 20 s timeout each; a day and market already settled in the file is
 * skipped unless --force. Run from the portal folder. Behind Avast, set NODE_EXTRA_CA_CERTS to its certificate (start-fast.bat does).
 */
const path = require("path");

const root = path.resolve(__dirname, "..");
process.chdir(root);
const args = process.argv.slice(2);
const arg = (name, dflt) => { const k = args.indexOf(`--${name}`); return k >= 0 ? args[k + 1] : dflt; };
const from = arg("from"), to = arg("to");
if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "") || from > to) {
  console.error("usage: node scripts/tn-prices-backfill.cjs --from YYYY-MM-DD --to YYYY-MM-DD [--gap 1000] [--force]");
  process.exit(2);
}
const gapMs = Math.max(500, Number(arg("gap", "1000")) || 1000);

const jiti = require("jiti")(__filename, { alias: { "@": path.join(root, "src") }, interopDefault: true });
const tn = jiti(path.join(root, "src/lib/collector/tnprices.ts"));

(async () => {
  const t0 = Date.now();
  const run = await tn.collectTnPrices({ from, to, gapMs, mirror: false, force: args.includes("--force"), log: (t) => console.log(t) });
  const s = tn.loadTn();
  const perMarket = {};
  for (const [d, byM] of Object.entries(s.days)) {
    if (d < from || d > to) continue;
    for (const [m, e] of Object.entries(byM)) {
      const x = (perMarket[m] ??= { days: 0, rows: 0, empty: 0 });
      if (e.rows.length) { x.days++; x.rows += e.rows.length; } else x.empty++;
    }
  }
  console.log(JSON.stringify({ from, to, seconds: Math.round((Date.now() - t0) / 1000), calls: run.calls, answered: run.answered, rows: run.seen, newRows: run.added,
    newest: run.newest, failed: run.errors.length, errors: run.errors.slice(0, 20), perMarket }, null, 1));
  process.exit(run.errors.length && !run.answered ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
