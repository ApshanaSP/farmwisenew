import { NextRequest, NextResponse } from "next/server";
import { requireConfirm } from "@/lib/security/stepup";
import { collectorSession } from "@/lib/collector/guard";
import { draftNewsAction, newsSent, sendNewsAction } from "@/lib/collector/newsaction";
import { newsKey } from "@/lib/collector/followupdept";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ID = /^[A-Za-z0-9_-]{4,80}$/;

/**
 * News that needs action (lib/collector/newsaction.ts), the Collector only.
 * GET ?id=<story>: the draft to the department officer, and what was sent before. GET ?status=<id,id,...>&inc=<id,id,...>: for the news
 * lists, which stories were sent and whether the department answered. POST { action: "send", id, subject, body }: sends the approved draft.
 */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const p = req.nextUrl.searchParams;
  try {
    const status = p.get("status");
    if (status != null) {
      const ids = status.split(",").filter((x) => ID.test(x)).slice(0, 300);
      const inc = (p.get("inc") ?? "").split(",").slice(0, 300);
      // a story is looked up under its case when it has one (index-aligned with ids; "" = none), else its NEWS- key
      const keys = ids.map((id, k) => (inc[k] && ID.test(inc[k]) ? inc[k] : newsKey(id)));
      const m = await newsSent([...new Set(keys)]);
      const out: Record<string, { at: string; done: boolean; reply: string | null; due: string | null }> = {};
      ids.forEach((id, k) => { const x = m.get(keys[k])?.[0]; if (x) out[id] = { at: x.at, done: x.done, reply: x.reply, due: x.due }; });
      return NextResponse.json({ sent: out });
    }
    const id = p.get("id") ?? "";
    if (!ID.test(id)) return NextResponse.json({ error: "Which story?" }, { status: 400 });
    const d = await draftNewsAction(id);
    if ("error" in d) return NextResponse.json({ error: d.error }, { status: d.status });
    return NextResponse.json(d);
  } catch (e) {
    console.error("[news] action draft failed", e);
    return NextResponse.json({ error: "The email could not be made just now." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!ID.test(id)) return NextResponse.json({ error: "Which story?" }, { status: 400 });
  try {
    const c = await requireConfirm(req, s, "send_email", `Send the news story to its department: "${String(body?.subject ?? "").slice(0, 90)}"`,
      { id, subject: body?.subject ?? null, body: body?.body ?? null });
    if (!c.ok) return c.res;
    const r = await sendNewsAction(body, s.email, c.grant?.fac ?? null);
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error("[news] action send failed", e);
    return NextResponse.json({ error: "Could not send." }, { status: 500 });
  }
}
