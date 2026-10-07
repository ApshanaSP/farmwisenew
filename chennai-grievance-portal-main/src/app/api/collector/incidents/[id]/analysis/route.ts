import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { analyseIncident } from "@/lib/collector/analysis";

export const dynamic = "force-dynamic";

/** What happened and why it needs the Collector, analysed by AI from the incident's records (null when no model answered). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(params.id)) return NextResponse.json({ error: "Invalid incident id." }, { status: 400 });
  try {
    return NextResponse.json({ analysis: await analyseIncident(params.id, s.email) });
  } catch (err) {
    return failed(err, "the analysis");
  }
}
