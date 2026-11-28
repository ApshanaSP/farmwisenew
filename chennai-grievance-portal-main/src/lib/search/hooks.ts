/**
 * The search box's build step (AWS store only; see onBuild in lib/aws/store.ts), registered from instrumentation-node.ts and the search
 * routes. It changes only the in-memory build:
 *
 *   indexes   the search reads news by publication time, readings by metric and time, and incidents by the day first reported: each gets an
 *             index when the build has none on that column yet, so a dated search reads its days, not the whole table
 *   reservoirs the days of Chennai Metro Water's figures lakes.ts holds now are copied into the kept history (lakehistory.ts), so a day
 *             never leaves the search when lakes.ts drops it after three weeks
 */
import type { DatabaseSync as DB } from "node:sqlite";
import { onBuild } from "@/lib/aws/store";
import { keepLakeHistory } from "@/lib/search/lakehistory";

type Row = Record<string, unknown>;

/** [table, columns]: an index is made when the table has the columns and no index of the build starts with them (the build's own are on one column each) */
const WANT: [string, string[]][] = [
  ["documents", ["published_at"]],
  ["observations", ["metric", "observed_at"]],
  ["incidents", ["first_reported_at"]]
];

/** Makes the indexes the search needs that the build lacks; returns the names made (none when each is there already). */
export function searchIndexes(db: DB): string[] {
  const made: string[] = [];
  for (const [t, cols] of WANT) {
    const have = new Set((db.prepare("SELECT name FROM pragma_table_info(?)").all(t) as Row[]).map((r) => String(r.name)));
    if (!cols.every((c) => have.has(c))) continue;
    const indexes = (db.prepare("SELECT name FROM pragma_index_list(?)").all(t) as Row[])
      .map((ix) => (db.prepare("SELECT name FROM pragma_index_info(?) ORDER BY seqno").all(String(ix.name)) as Row[]).map((c) => String(c.name)));
    if (indexes.some((ix) => cols.every((c, k) => ix[k] === c))) continue;
    const name = `ix_search_${t}_${cols.join("_")}`;
    db.exec(`CREATE INDEX IF NOT EXISTS "${name}" ON "${t}" (${cols.map((c) => `"${c}"`).join(", ")})`);
    made.push(name);
  }
  return made;
}

onBuild("search-history@1", (db) => {
  searchIndexes(db);
  try { keepLakeHistory(); } catch (e) { console.warn(`[search] the reservoir history was not kept: ${(e as Error).message}`); }
});
