import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CODE_RE, complaintForTrack, mayTrack, trackView } from "@/lib/manu/track";
import { checkRateLimit, getClientIp, giveBackTry, ipLimit } from "@/lib/rate-limit";
import { readJsonCapped, tooLargeResponse } from "@/lib/body-cap";

export const dynamic = "force-dynamic";

const schema = z.object({ code: z.string().trim().toUpperCase().regex(CODE_RE), key: z.string().max(40).optional(), last4: z.string().max(8).optional() });
const NOT_FOUND = "We could not find that. Check the number on your slip and the last 4 digits of your mobile number.";

/** Public: a petition's status for whoever holds the slip. Same answer for a wrong number and a wrong mobile, and no personal detail. */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  if (!checkRateLimit(`track:${ip}`, ipLimit(ip, 30), 600).allowed) return NextResponse.json({ error: "Too many tries. Please wait a few minutes." }, { status: 429 });
  // public: the body is read with a limit before anything parses it (pass 4's RC-17 rule; QA pass 5, P5-013)
  const { body, tooLarge } = await readJsonCapped(req, 4 * 1024);
  if (tooLarge) return tooLargeResponse();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  const { code, key, last4 } = parsed.data;
  // Per number, only wrong tries count, and the slip's QR key (an HMAC of the number, never guessed) is not limited by them: junk
  // tries on someone's number used to lock its real holder out for 10 minutes, key and all (QA pass 5, manu-sec-09). Guessing the
  // last 4 digits stays as slow as before: 12 wrong tries per number per 10 minutes. Each try is counted BEFORE the store is read
  // and given back if it was right: counting after the read let tries sent together all reach the store (reviewerB-01).
  const bucket = `track-code:${code}`;
  const holdsKey = !!key && mayTrack(code, null, key, null);
  if (!holdsKey && !checkRateLimit(bucket, 12, 600).allowed) return NextResponse.json({ error: "Too many tries. Please wait a few minutes." }, { status: 429 });
  try {
    const c = await complaintForTrack(code);
    if (!c || !mayTrack(code, c.mobile_number, key, last4)) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    if (!holdsKey) giveBackTry(bucket);
    return NextResponse.json(await trackView(c), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("track failed", err);
    return NextResponse.json({ error: "Tracking is not available just now. Please try again." }, { status: 500 });
  }
}
