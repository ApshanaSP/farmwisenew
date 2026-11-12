// QA pass 6, P6-028 (hunt2-ops-06; console-sync found it by reading in wave A): the Collector's "Severe, not yet checked" tile counted every
// open severe incident in the district whatever the console's category and taluk filters, while the list it opens applies them: with the
// flood category the tile said 20 and the list 6; with taluk TLK-TDP, 20 and 0. Real overview() and list() on the pinned snapshot.
//   QA_PIN_PORT=3197 npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/p6-critical-tile.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { asOf, list, overview } from "@/lib/collector/intel";

beforeAll(async () => { await asOf(); }, 300_000);
const tile = async (focus: { cat?: string; taluk?: string }) => ((await overview("weekly", null, null, focus)) as unknown as { snapshot: { critical?: number } }).snapshot.critical;
const listed = async (focus: { cat?: string; taluk?: string }) => {
  const l = await list({ period: "weekly", zone: null, dept: null, sev: null, cat: focus.cat ?? null, taluk: focus.taluk ?? null, status: "critical", q: null, sort: "t", dir: -1, page: 1, scope: "all" } as never) as unknown as { incidents?: number; total?: number };
  return Number(l.incidents ?? l.total ?? 0);
};

describe("QA pass 6, P6-028: the 'Severe, not yet checked' tile counts what the list it opens shows", () => {
  for (const focus of [{}, { cat: "FLOOD_WATERLOGGING" }, { taluk: "TLK-TDP" }, { cat: "SOLID_WASTE" }]) {
    it(`filters ${JSON.stringify(focus)}`, async () => {
      expect(await tile(focus)).toBe(await listed(focus));
    });
  }
});
