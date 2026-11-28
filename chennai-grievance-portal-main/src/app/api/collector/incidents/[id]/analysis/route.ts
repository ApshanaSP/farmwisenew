import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { NO_AI_WORDS, incidentAnalysis } from "@/lib/collector/analysis";

export const dynamic = "force-dynamic";

/**
 * What happened and why it needs the Collector, analysed by AI from the incident's records (null when no model answered). `noAi`: the one line
 * the panel shows under the rules' text when there is no AI answer (every provider failed, or every answer failed the figure check), else null.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(params.id)) return NextResponse.json({ error: "Invalid incident id." }, { status: 400 });
  try {
    const r = await incidentAnalysis(params.id, s.email);
    return NextResponse.json({ analysis: r.analysis, noAi: r.noAi ? NO_AI_WORDS[r.noAi] : null });
  } catch (err) {
    return failed(err, "the analysis");
  }
}
