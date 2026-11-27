import { NextRequest, NextResponse } from "next/server";
import { jobKeyOk } from "@/lib/jobauth";
import { acceptPush, PUSH_MAX_BYTES } from "@/lib/collector/tnpush";

export const dynamic = "force-dynamic";

/**
 * The PC sends the hosted copy the market prices it collected (the hosted copy cannot reach agrimark.tn.gov.in, see lib/collector/tnpush.ts).
 * A scheduled job, not a page: the caller sends REFRESH_API_KEY in `x-job-key` and the recent days of tn-prices.json as the body.
 */
export async function POST(req: NextRequest) {
  if (!jobKeyOk(req.headers.get("x-job-key"))) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > PUSH_MAX_BYTES) return NextResponse.json({ error: "Too large" }, { status: 413 });
  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > PUSH_MAX_BYTES) return NextResponse.json({ error: raw ? "Too large" : "Empty" }, { status: raw ? 413 : 400 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Not JSON" }, { status: 400 }); }
  try {
    return NextResponse.json({ ok: true, merged: acceptPush(body) });
  } catch (e) {
    console.warn("[tn-prices push] not merged:", (e as Error).message);
    return NextResponse.json({ error: "Not merged; see the server log." }, { status: 500 });
  }
}
