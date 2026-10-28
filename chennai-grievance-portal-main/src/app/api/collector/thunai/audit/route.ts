import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession, failed } from "@/lib/collector/guard";
import { appendAudit, readAudit } from "@/lib/thunai/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Event = z.object({
  heard: z.string().max(300).nullable(),
  plan: z.array(z.record(z.unknown())).max(12),
  risk: z.enum(["A", "B", "C"]),
  approval: z.object({ how: z.enum(["none", "tap", "spoken"]), count: z.number().int().min(0).max(50).optional() }).nullable(),
  outcome: z.string().max(200)
});

/** Thunai's audit trail: the last 200 events and whether the hash chain is intact. */
export async function GET() {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json(readAudit(200));
  } catch (err) {
    return failed(err, "Thunai's audit trail");
  }
}

/** One event: text only (never audio). */
export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const parsed = Event.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That event could not be read." }, { status: 400 });
  try {
    const line = appendAudit({ ...parsed.data, actor: s.email });
    return NextResponse.json({ id: line.id, hash: line.hash });
  } catch (err) {
    return failed(err, "Thunai's audit trail");
  }
}
