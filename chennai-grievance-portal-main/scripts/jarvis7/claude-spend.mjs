/**
 * v7: what the owner's Claude spend record holds (data/thunai/claude-budget.sqlite, the US$5 ceiling's record): rows, dollars, the last call.
 * Counts and dollars only. Run before and after any Claude test:  node scripts/jarvis7/claude-spend.mjs [file]
 */
import path from "path";
import { DatabaseSync } from "node:sqlite";

const file = process.argv[2] || process.env.JARVIS_CLAUDE_BUDGET_FILE || path.join(process.cwd(), "data", "thunai", "claude-budget.sqlite");
const db = new DatabaseSync(file, { readOnly: true });
const t = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(usd),0) usd, MAX(at) last FROM spend").get();
const by = db.prepare("SELECT model, COUNT(*) n, ROUND(SUM(usd),6) usd FROM spend GROUP BY model").all();
console.log(`${file}\nrows ${t.n}, US$${Number(t.usd).toFixed(6)} in all, last ${t.last ? new Date(t.last).toISOString() : "never"}`);
for (const x of by) console.log(`  ${x.model}: ${x.n} rows, US$${x.usd}`);
