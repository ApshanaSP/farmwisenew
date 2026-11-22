/**
 * v15 live look at the focus screen on the dry-run copy of the store (read only): the blocks, their sizes and the code's own line.
 *   npx vitest run --config vitest.live.config.ts src/lib/thunai/v15/focus15.live.ts
 */
process.env.AWS_STORE_DRY_RUN = "1";
process.env.AWS_STORE_RELOAD_MINUTES = "100000";
process.env.AWS_DURABLE_FILE ??= "data/aws-cache/dryrun-v11/durable.sqlite";
process.env.JARVIS_KEEPWARM = "0";
import { it } from "vitest";
import { serverHands } from "../data";
import { buildScreen, emptySlots } from "../screens";
import { checkStage } from "../stage";
import { serverWorld } from "../world";

const SAID = (process.env.PROBE_SAID ?? "எந்த area-ல நிறைய cases வந்துகிட்டே இருக்கு, repeated-ஆ?|Which areas are improving this week?").split("|");

it("focus screen", async () => {
  const w = await serverWorld();
  const h = serverHands({ email: "probe@local", role: "collector", lockDept: null });
  for (const said of SAID) {
    const t0 = Date.now();
    const { doc } = await buildScreen("focus", { ...emptySlots(), fresh: true }, { period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null }, w, h, said);
    const ok = checkStage(doc);
    console.log(JSON.stringify({ said, ms: Date.now() - t0, valid: ok.ok ? true : ok.why, title: doc.title, say: doc.say, notes: doc.notes,
      blocks: doc.blocks.map((b) => ({ kind: b.kind, id: b.id, title: "title" in b ? b.title : "", n: "items" in b ? b.items.length : "values" in b ? b.values.length : 0,
        first: "items" in b ? b.items.slice(0, 3) : "values" in b ? { labels: b.labels.slice(0, 5), values: b.values.slice(0, 5) } : null })) }, null, 1));
  }
}, 300_000);
