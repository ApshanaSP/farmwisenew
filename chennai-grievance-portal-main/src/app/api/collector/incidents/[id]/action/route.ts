import { NextRequest, NextResponse } from "next/server";
import { requireConfirm } from "@/lib/security/stepup";
import { collectorSession, failed } from "@/lib/collector/guard";
import { draftAction, sendAction } from "@/lib/collector/actionmail";

export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Take action on a severe incident, step 1-3: the agent reads it, finds the officer and drafts the email (nothing is sent). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  if (!ID.test(params.id)) return NextResponse.json({ error: "Invalid incident id." }, { status: 400 });
  try {
    const d = await draftAction(params.id, s.email);
    return "error" in d ? NextResponse.json({ error: d.error }, { status: d.status }) : NextResponse.json(d);
  } catch (err) {
    return failed(err, "the action draft");
  }
}

/** Step 4: the Collector approved the email ({ subject, body }); it is sent under the EMAIL_MODE rules and recorded. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  if (!ID.test(params.id)) return NextResponse.json({ error: "Invalid incident id." }, { status: 400 });
  const input = await req.json().catch(() => null);
  const c = await requireConfirm(req, s, "send_email", `Send the instruction on incident ${params.id}: "${String(input?.subject ?? "").slice(0, 90)}"`,
    { id: params.id, subject: input?.subject ?? null, body: input?.body ?? null });
  if (!c.ok) return c.res;
  try {
    const r = await sendAction(params.id, input, s.email, c.grant?.fac ?? null);
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    console.error("take action failed", err);
    return NextResponse.json({ error: "Could not send the instruction." }, { status: 500 });
  }
}
