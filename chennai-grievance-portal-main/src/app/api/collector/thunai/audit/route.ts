import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession, failed } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { appendAudit, readAudit } from "@/lib/thunai/store";
import { DecisionBody, daySummary, logDecision, readToday } from "@/lib/thunai/decisions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Event = z.object({
  heard: z.string().max(300).nullable(),
  plan: z.array(z.record(z.unknown())).max(12),
  risk: z.enum(["A", "B", "C"]),
  approval: z.object({ how: z.enum(["none", "tap", "spoken"]), count: z.number().int().min(0).max(50).optional() }).nullable(),
  outcome: z.string().max(200)
});
/** v4: a decision record (an answer, or the Collector's tray approval); the approver is the signed-in Collector, never the body */
const Decision = z.object({ decision: DecisionBody });

/**
 * Thunai's audit trail: the last 200 events and whether the hash chain is intact.
 * ?today=1: today's decision records and "what did you do today?" said by code in English and Tamil.
 */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  try {
    if (req.nextUrl.searchParams.get("today") === "1") {
      const { records, intact } = readToday();
      const summary = daySummary(records, intact);
      // the Collector's own records: the approver is shown only as "you"
      return NextResponse.json({ records: records.map((r) => ({ ...r, approver: r.approver ? { by: "you", how: r.approver.how } : null })), intact, summary });
    }
    return NextResponse.json(readAudit(200));
  } catch (err) {
    return failed(err, "Thunai's audit trail");
  }
}

/** One event: text only (never audio). */
export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const body = await req.json().catch(() => null);
  const dec = Decision.safeParse(body);
  if (dec.success) {
    const gate = checkRateLimit(`thunai-decision:${s.userId}`, 120, 60);
    if (!gate.allowed) return NextResponse.json({ error: "Too many records at once." }, { status: 429 });
    try {
      const line = logDecision(s.email, dec.data.decision);
      return NextResponse.json({ id: line.id, hash: line.hash });
    } catch (err) {
      return failed(err, "Thunai's audit trail");
    }
  }
  const parsed = Event.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "That event could not be read." }, { status: 400 });
  try {
    const line = appendAudit({ ...parsed.data, actor: s.email });
    return NextResponse.json({ id: line.id, hash: line.hash });
  } catch (err) {
    return failed(err, "Thunai's audit trail");
  }
}
