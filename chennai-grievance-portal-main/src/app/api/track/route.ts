import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CODE_RE, complaintForTrack, mayTrack, trackView } from "@/lib/manu/track";
import { checkRateLimit, getClientIp, ipLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({ code: z.string().trim().toUpperCase().regex(CODE_RE), key: z.string().max(40).optional(), last4: z.string().max(8).optional() });
const NOT_FOUND = "We could not find that. Check the number on your slip and the last 4 digits of your mobile number.";

/** Public: a petition's status for whoever holds the slip. Same answer for a wrong number and a wrong mobile, and no personal detail. */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  if (!checkRateLimit(`track:${ip}`, ipLimit(ip, 30), 600).allowed) return NextResponse.json({ error: "Too many tries. Please wait a few minutes." }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  const { code, key, last4 } = parsed.data;
  if (!checkRateLimit(`track-code:${code}`, 12, 600).allowed) return NextResponse.json({ error: "Too many tries. Please wait a few minutes." }, { status: 429 });
  try {
    const c = await complaintForTrack(code);
    if (!c || !mayTrack(code, c.mobile_number, key, last4)) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    return NextResponse.json(await trackView(c), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("track failed", err);
    return NextResponse.json({ error: "Tracking is not available just now. Please try again." }, { status: 500 });
  }
}
