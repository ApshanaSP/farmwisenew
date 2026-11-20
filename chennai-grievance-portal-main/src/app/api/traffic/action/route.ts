import { NextRequest, NextResponse } from "next/server";
import { requireConfirm } from "@/lib/security/stepup";
import { collectorSession } from "@/lib/collector/guard";
import { draftTrafficAction, sendTrafficAction } from "@/lib/collector/actionmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KEY = /^(spot|cluster):[A-Za-z0-9_.:-]{2,120}$/;

/**
 * The Traffic view's "Send to <body>" (the Collector only): "draft" re-reads the live spot or trouble spot on the server
 * and drafts one email to the body that answers for it; "send" sends the approved draft (sandbox by default), with a
 * follow-up per related open case and an audit row. Nothing is sent without the Collector pressing Approve.
 */
export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const body = await req.json().catch(() => null);
  const key = String(body?.key ?? "");
  if (!KEY.test(key)) return NextResponse.json({ error: "Which spot? Pick one in the Traffic view." }, { status: 400 });
  try {
    if (body?.action === "send") {
      const c = await requireConfirm(req, s, "send_email", `Send 1 email about live traffic: "${String(body.subject ?? "").slice(0, 90)}"`,
        { key, subject: body.subject ?? null, body: body.body ?? null });
      if (!c.ok) return c.res;
      const r = await sendTrafficAction(body, s.email, c.grant?.fac ?? null);
      return NextResponse.json(r.body, { status: r.status });
    }
    const d = await draftTrafficAction(key);
    if ("error" in d) return NextResponse.json({ error: d.error }, { status: d.status });
    return NextResponse.json(d);
  } catch (e) {
    console.error("[traffic] action failed", e);
    return NextResponse.json({ error: "The email could not be made just now." }, { status: 500 });
  }
}
