/**
 * v6: what the quota ledger says is spent in the last 24 h and the last minute, per org/model, against the ledger's own limits.
 * Counts only. Run before every live run:  node scripts/jarvis6/ledger-left.mjs [THUNAI_DIR]
 */
import path from "path";
import { DatabaseSync } from "node:sqlite";

const dir = process.argv[2] || process.env.THUNAI_DIR || path.join(process.cwd(), "data", "thunai");
const db = new DatabaseSync(path.join(dir, "ledger.sqlite"), { readOnly: true });
const now = Date.now();
const rows = db.prepare("SELECT org, model, COALESCE(SUM(requests),0) r, COALESCE(SUM(tokens),0) t, COALESCE(SUM(audio_s),0) a FROM spend WHERE at>=? GROUP BY org, model ORDER BY org, model").all(now - 86_400_000);
const LIM = { "groq/qwen/qwen3.8-27b": 200_000, "groq/openai/gpt-oss-20b": 200_000, "groq/openai/gpt-oss-120b": 200_000 };
console.log(`ledger ${dir}, last 24 h, at ${new Date(now).toISOString()}`);
for (const x of rows) {
  const key = `${x.org}/${x.model.split("#")[0]}`;
  const tpd = LIM[key];
  console.log(`${key.padEnd(42)} requests ${String(x.r).padStart(5)}  tokens ${String(x.t).padStart(7)}${tpd ? ` (left ${tpd - x.t})` : ""}  audio_s ${Math.round(x.a)}`);
}
const cools = db.prepare("SELECT org, model, until FROM cool WHERE until > ?").all(now);
for (const c of cools) console.log(`cooling ${c.org}/${c.model} for ${Math.round((c.until - now) / 1000)} s`);
