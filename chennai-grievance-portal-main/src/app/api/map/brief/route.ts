import { NextRequest, NextResponse } from "next/server";
import { assistantSession } from "@/lib/assistant/access";
import { checkRateLimit } from "@/lib/rate-limit";
import { askMap } from "@/lib/map/ask";
import { briefHtml } from "@/lib/map/v2";
import { world } from "@/lib/map/world";
import { LAYER_WORD } from "@/lib/map/words";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Ask the Map v2: a printable one-page brief of an answer. ?q=<the question> (as a shared link carries it) or ?plan=<the plan as JSON>.
 * The question is asked again on the server, as the officer who opens the page (a department officer sees only their department), so the
 * page shows today's numbers and never more than that officer may see. No personal details.
 */
export async function GET(req: NextRequest) {
  const s = await assistantSession();
  if (s instanceof NextResponse) return s;
  const gate = checkRateLimit(`mapbrief:${s.userId}`, 20, 300);
  if (!gate.allowed) return new NextResponse(`Too many briefs in a few minutes. Try again in ${gate.retryAfterSeconds} s.`, { status: 429 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 400) || null;
  let plan: unknown = null;
  try { const raw = req.nextUrl.searchParams.get("plan"); plan = raw ? JSON.parse(raw.slice(0, 20_000)) : null; } catch { plan = null; }
  if (!q && !plan) return new NextResponse("Ask a question first.", { status: 400 });
  try {
    const user = { email: s.email, role: s.role, lockDept: s.lockDept };
    const r = await askMap({ text: plan ? null : q, plan: (plan as never) ?? null, prev: null, user, reword: false, signal: req.signal,
      context: { zone: null, taluk: null, incidentId: null, drawn: null, ward: null } });
    if (r.kind !== "answer" || !r.answer) return new NextResponse(`The map could not answer that: ${r.say?.en ?? "try another question"}`, { status: 422, headers: { "content-type": "text/plain; charset=utf-8" } });
    const { world: w } = await world();
    const g = r.glance;
    const html = briefHtml(w, {
      question: q, headline: r.answer.headline.replace(/ · map layer ready\.?$/, ""), meaning: r.answer.meaning,
      facts: r.trace.map((t) => t.note_en).filter(Boolean).slice(0, 8),
      tiles: g ? [{ label: "still open", n: g.open.n }, { label: "past deadline", n: g.overdue.n }, { label: "severe", n: g.severe.n }].filter((t) => t.n > 0) : [],
      rows: r.rows.map((x) => ({ title: x.title, cat: x.catLabel, status: x.status, sev: x.sev, place: x.place ?? (x.ward ? `Ward ${x.ward}` : ""), first: x.first, dept: x.deptName })),
      total: r.total,
      pts: r.features.filter((f) => f.pinnable).map((f) => ({ lat: f.lat, lon: f.lon })).concat(r.rows.length ? [] : r.context.points.map((p) => ({ lat: p.lat, lon: p.lon }))),
      asOf: r.asOf.data,
      sources: r.asOf.layers.filter((l) => l.id !== "incidents").map((l) => `${LAYER_WORD[l.id as keyof typeof LAYER_WORD]?.en ?? l.en}: ${l.source}`)
    });
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  } catch (e) {
    console.error("[map] brief failed", e);
    return new NextResponse("The brief could not be made just now.", { status: 500 });
  }
}
