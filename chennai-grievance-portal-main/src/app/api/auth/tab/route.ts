import { NextRequest, NextResponse } from "next/server";
import { copySlot } from "@/lib/auth";
import { UNSLOTTED, isSlot } from "@/lib/session-cookies";

/**
 * A new or duplicated tab takes its own slot: { from, to } copies the sign-ins of slot `from` (or of the unslotted
 * cookies, "-") into the tab's new slot `to` (lib/tab-session.ts). Only this browser's own cookies are copied.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const from = body?.from === UNSLOTTED ? null : body?.from;
  const to = body?.to;
  if (!isSlot(to) || (from !== null && !isSlot(from)) || from === to) {
    return NextResponse.json({ error: "Bad tab" }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true });
  await copySlot(res, from, to);
  return res;
}
