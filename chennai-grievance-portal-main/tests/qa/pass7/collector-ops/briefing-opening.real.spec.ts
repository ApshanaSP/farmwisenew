// QA pass 7, hunt2-ops-12 (P0) on the pinned snapshot: the briefing's opening, shown under "Written by AI from today's figures; every
// number is checked", must be the summary of the console's own window and agree with the live figures beside it. The pinned build's
// weekly summary (window to 6 Nov 18:08) says "more incidents than the previous period"; the console's live week says fewer.
//   QA_PIN_PORT=3192 npx vitest run --config tests/qa/pass7/collector-ops/vitest.real.config.ts tests/qa/pass7/collector-ops/briefing-opening.real.spec.ts
import { beforeAll, describe, expect, it } from "vitest";
import { asOf } from "@/lib/collector/intel";
import { insights } from "@/lib/collector/insights";

beforeAll(async () => { await asOf(); }, 300_000);

describe("hunt2-ops-12: the AI opening is today's or it is not shown", () => {
  for (const period of ["daily", "weekly", "monthly", "quarterly"] as const) {
    it(period, async () => {
      const r = await insights(period, null, null, {}, "briefing");
      const b = r.briefing as unknown as { opening: { en: string } | null; stats: { reported: number; change: number | null }; headline: string[] };
      const book = r.book as unknown as { glance: { opening: { en: string } | null } } | null;
      const said = b.opening?.en ?? "";
      const more = /\b(more|higher|increase|rise|rose)\b/i.test(said.split(".")[0]), fewer = /\b(fewer|less|lower|decrease|fell|drop)/i.test(said.split(".")[0]);
      const ch = b.stats.change;
      // never an opening that says the opposite of the live figures shown beside it
      if (ch != null && ch < -5) expect(more, `${period}: "${said}" beside ${b.stats.reported} reported, ${ch}%`).toBe(false);
      if (ch != null && ch > 5) expect(fewer, `${period}: "${said}" beside ${b.stats.reported} reported, ${ch}%`).toBe(false);
      // the pinned build's summaries are of the windows ending 6 Nov 18:08; the console's window ends now (later): none is today's
      expect(b.opening, `${period}: ${said}`).toBeNull();
      expect(book?.glance.opening ?? null).toBeNull();
    });
  }
});
