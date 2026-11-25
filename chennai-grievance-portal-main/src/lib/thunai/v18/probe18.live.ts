/**
 * v18 live look at the summary and the window screens on a dry-run copy of the store (read only): the blocks, their sizes, the window and
 * code's own line, with the time each took.
 *   npx vitest run --config vitest.live.config.ts src/lib/thunai/v18/probe18.live.ts
 */
process.env.AWS_STORE_DRY_RUN = "1";
process.env.AWS_STORE_RELOAD_MINUTES = "100000";
process.env.AWS_DURABLE_FILE ??= "data/aws-cache/dryrun-v18/durable.sqlite";
process.env.JARVIS_KEEPWARM = "0";
import { it } from "vitest";
import { serverHands } from "../data";
import { buildScreen, emptySlots, type Slots } from "../screens";
import { checkStage, figuresOf, figuresOk } from "../stage";
import { serverWorld } from "../world";
import { turnWhen, istWall } from "./when";

const BASE = { period: "weekly" as const, zone: null, dept: null, cat: null, taluk: null, sev: null };
const CASES: [string, string, Partial<Slots>][] = [
  ["summary of Anna Nagar", "summary", { zones: [8] }],
  ["summary of Anna Nagar for the last 2 days", "summary", { zones: [8] }],
  ["summary of crimes happening", "summary", { family: "CRIME" }],
  ["summary of the police department in the last 48 hours", "summary", { dept: "POL-GCP" }],
  ["what happened in the district on 20 November", "summary", {}],
  ["what happened in Velachery two days ago", "summary", { zones: [13], place: "Velachery" }],
  ["news about flooding in the last 4 days", "news", { family: "FLOOD" }],
  ["air quality on 20 November", "readings", { metric: "aqi" }],
  ["compare Adyar and Anna Nagar for the last 4 days", "compare", { zones: [13, 8] }],
  ["which zone had the most cases between 15 Nov and 20 Nov", "ranking", { measure: "zone_incidents" }],
  ["severe cases in Anna Nagar last 2 days", "summary", { zones: [8], sev: "Severe", view: "cases" }]
];

it("v18 screens on real data", async () => {
  const w = await serverWorld();
  const h = serverHands({ email: "probe@local", role: "collector", lockDept: null });
  for (const [said, recipe, slots] of CASES) {
    const t0 = Date.now();
    const span = turnWhen(said, null, istWall(Date.now()));
    const { doc } = await buildScreen(recipe as never, { ...emptySlots(), ...slots, ...(span ? { span } : {}), fresh: true }, BASE, w, h, said, undefined, "en");
    const ok = checkStage(doc);
    console.log(JSON.stringify({ said, ms: Date.now() - t0, valid: ok.ok ? true : ok.why, recipe: doc.recipe, title: doc.title, when: doc.when, say: doc.say.en, sayOk: figuresOk(doc.say.en, figuresOf(doc)), notes: doc.notes,
      blocks: doc.blocks.map((b) => ({ kind: b.kind, id: b.id, title: "title" in b ? b.title : "", n: "items" in b ? b.items.length : "points" in b ? b.points.length : "rows" in b ? b.rows.length : "values" in b ? b.values.length : 0,
        first: b.kind === "Brief" ? b.points.slice(0, 12).map((p) => p.text) : b.kind === "Kpis" ? b.items.map((k) => `${k.label}=${k.value}`) : "items" in b ? (b.items as unknown[]).slice(0, 2) : "values" in b ? { labels: b.labels.slice(0, 6), values: b.values.slice(0, 6) } : null })) }, null, 1));
  }
}, 600_000);
