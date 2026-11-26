/**
 * 26 Nov 2026: the Daily window on the real store (a dry-run copy, no AI): every reader of "today" gives one number (the tiles, the list they
 * open, the zone table, the snapshot, Jarvis's window, the chatbot's count, the map), at several times of the day, the small hours included;
 * and what a rolling 24 hours would have dropped from the page between two looks an hour apart. Fails on any difference.
 *   npx vitest run --config vitest.live.config.ts src/lib/collector/day.live.ts
 */
process.env.AWS_STORE_DRY_RUN = "1";
process.env.AWS_STORE_RELOAD_MINUTES = "100000";
process.env.AWS_DURABLE_FILE ??= "data/aws-cache/dryrun-v18/durable.sqlite";
process.env.JARVIS_KEEPWARM = "0";
process.env.DISTRICT_IQ_JOBS = "off";
process.env.AI_PROVIDER = "none";
process.env.JARVIS_CLAUDE_OFF = "1";
import { expect, it } from "vitest";
import intelPool from "@/lib/collector/db";
import { asOf, kpiBlock, newsStories, periodWindow, scopeWhere, wholeDayWindow } from "@/lib/collector/intel";
import { countIncidents } from "@/lib/assistant/incidents";
import { periodRange } from "@/lib/map/execute";
import { windowOf } from "@/lib/thunai/v18/when";
import { winIncidents } from "@/lib/thunai/v18/window";
import { dayKey, dayWindow, wholeDay } from "@/lib/period/day";
import { periodConflicts } from "./conflicts";

const q = async (sql: string, p: unknown[] = []) => ((await intelPool.query(sql, p)) as unknown as [Record<string, unknown>[]])[0];
const n = async (w: { sql: string; params: unknown[] }) => Number((await q(`SELECT COUNT(*) AS n FROM incidents i WHERE ${w.sql}`, w.params))[0]?.n ?? 0);
const NONE = { zone: null, zones: null, place: null, dept: null, cats: null, sev: null, taluk: null, status: null };

it("one number for today, at every time of the day", async () => {
  const real = await asOf(), d = real.slice(0, 10);
  const diffs: string[] = [];
  const same = (what: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(`${what}: ${JSON.stringify(a)} against ${JSON.stringify(b)}`); };
  const yesterday = wholeDay(real).from.slice(0, 10);
  for (const now of [real, `${yesterday} 17:30:00`, `${yesterday} 23:59:00`, `${d} 00:30:00`, `${d} 05:59:00`].filter((x) => x <= real)) {
    const s = { period: "daily" as const, zone: null };
    const [k, w, cnt] = [await kpiBlock(s, now), windowOf(null, "daily", now), await countIncidents({ period: "daily" }, now)];
    const r = periodRange({ kind: "day", offset: 0 }, now);
    const mine = await winIncidents({ ...w }, NONE, 1);
    same(`${now} reported: tile / scope`, k.cur.reported, await n(scopeWhere(s, now)));
    same(`${now} reported: tile / chatbot`, k.cur.reported, cnt.n);
    same(`${now} reported: tile / Jarvis`, k.cur.reported, mine.n);
    same(`${now} severe: tile / Jarvis`, k.cur.severe, mine.severe);
    same(`${now} before: tile / chatbot`, k.prev.reported, cnt.prev);
    same(`${now} before: tile / Jarvis`, k.prev.reported, mine.prev);
    same(`${now} window: map / console`, [r.from, r.to], [dayWindow(now).from, dayWindow(now).to]);
    same(`${now} chart adds up`, k.series.reported.reduce((a, b) => a + b, 0), k.cur.reported);
    console.log(`${now} (day ${dayKey(now)}): ${k.cur.reported} reported, ${k.cur.severe} severe, ${k.prev.reported} by this time the day before, ${k.series.reported.length} buckets ${k.series.reported.join(" ")}`);
  }
  same("yesterday: chatbot / calendar day", (await countIncidents({ period: "daily", offset: 1 }, real)).n, await n(wholeDayWindow(real)));
  same("yesterday's own comparison is the day before it", (await countIncidents({ period: "daily", offset: 1 }, real)).prev, await n(wholeDayWindow(real, "i.first_reported_at", 2)));
  // what a rolling 24 hours dropped between two looks an hour apart, and the calendar day does not
  for (const h of ["12", "15", "18", "21"]) {
    const a = `${yesterday} ${h}:00:00`, b = `${yesterday} ${String(Number(h) + 1).padStart(2, "0")}:00:00`;
    const roll = async (t: string) => new Set((await q(`SELECT d.doc_id AS id FROM documents d WHERE d.is_district = 1 AND d.publisher_tier IN ('established', 'regional', 'official') AND d.published_at > (? - INTERVAL 24 HOUR) AND d.published_at <= ?`, [t, t])).map((x) => String(x.id)));
    const [x, y] = [await roll(a), await roll(b)];
    const w2 = periodWindow("daily", b, "d.published_at");
    const day = new Set((await q(`SELECT d.doc_id AS id FROM documents d WHERE d.is_district = 1 AND d.publisher_tier IN ('established', 'regional', 'official') AND ${w2.sql}`, w2.params)).map((z) => String(z.id)));
    const w1 = periodWindow("daily", a, "d.published_at");
    const dayA = (await q(`SELECT d.doc_id AS id FROM documents d WHERE d.is_district = 1 AND d.publisher_tier IN ('established', 'regional', 'official') AND ${w1.sql}`, w1.params)).map((z) => String(z.id));
    console.log(`${a}: a rolling 24 hours had ${x.size} reports, ${[...x].filter((i) => !y.has(i)).length} of them gone an hour later; the day had ${dayA.length}, ${dayA.filter((i) => !day.has(i)).length} gone`);
    expect(dayA.filter((i) => !day.has(i))).toEqual([]);
  }
  global.__conflictRest = Date.now() + 3600_000; // no model is asked: the rules stand in
  const st = await newsStories("daily", real);
  const c1 = await periodConflicts("daily", real, "probe"), c2 = await periodConflicts("daily", real, "probe");
  same("the Differ list, read twice", c1.stories.map((x) => x.id), c2.stories.map((x) => x.id));
  console.log(`${st.length} stories today, ${c1.checked} with two outlets compared, ${c1.stories.length} differ: ${c1.stories.map((x) => `${x.title.slice(0, 60)} [${x.items.map((i) => i.field).join(",")}]`).join(" | ")}`);
  expect(diffs).toEqual([]);
}, 600_000);
