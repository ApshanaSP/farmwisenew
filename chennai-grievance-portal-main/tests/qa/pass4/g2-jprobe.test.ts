import { beforeAll, describe, it, vi } from "vitest";
import fs from "fs";
import { clearCaches } from "@/lib/thunai/round";
import { browserWorld, ClientSim } from "./grader/client-sim";
import { narrationOf } from "@/lib/thunai/stagelocal";
const FROZEN = "2026-11-06T06:30:00.000Z";
let w: Awaited<ReturnType<typeof browserWorld>>;
beforeAll(async () => { vi.useFakeTimers({ toFake: ["Date"], now: new Date(FROZEN) }); w = await browserWorld(); }, 300_000);
describe("jprobe", () => { it.skipIf(!process.env.QS)("p", async () => {
  const out: string[] = [];
  for (const conv of (process.env.QS ?? "").split("##").filter(Boolean)) {
    clearCaches(); vi.setSystemTime(new Date(FROZEN));
    const sim = new ClientSim(w.world, {}, w.list);
    for (const s of conv.split("||")) { const o = await sim.handle(s); out.push(`Q: ${s}\n  kind=${o.kind} said=${o.said}\n  steps=${JSON.stringify(o.steps).slice(0, 200)} zone=${sim.zone} cat=${sim.cat} slots=${JSON.stringify(o.stage?.slots ?? null).slice(0, 160)} recipe=${o.stage?.recipe}`);
      if (process.env.NARR && o.stage) out.push(`  NARR(ta)=${JSON.stringify(narrationOf(o.stage as never, "ta").map((x) => x.text))}`); }
  }
  fs.writeFileSync(process.env.OUT!, out.join("\n"));
}, 300_000); });
