import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readJsonCapped, tooLargeResponse } from "@/lib/body-cap";
import { collectorSession, failed } from "@/lib/collector/guard";
import { requireConfirm } from "@/lib/security/stepup";
import { RehearsalUnavailable } from "@/lib/rehearsal/engine";
import { assignFixes, fixById, stepFix } from "@/lib/rehearsal/tasks";
import { prepareAssign, trackerState, type Skip } from "@/lib/rehearsal/trackview";
import { FIX_DEPTS, PLACE_RE } from "@/lib/rehearsal/tracker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** how far ahead a fix may be due */
const MAX_DUE_DAYS = 120;
const istDay = (addDays = 0) => new Date(Date.now() + 330 * 60_000 + addDays * 86_400_000).toISOString().slice(0, 10);

const Item = z.object({ place: z.string().regex(PLACE_RE), dept: z.enum(FIX_DEPTS), note: z.string().trim().min(10).max(300) });
const Assign = z.object({
  action: z.literal("assign"), lens: z.enum(["flood", "traffic", "power", "metro"]), rain: z.string().regex(/^rain-\d{4}-\d{2}-\d{2}$/),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), items: z.array(Item).min(1).max(300)
});
const Verify = z.object({ action: z.literal("verify"), id: z.number().int().positive(), note: z.string().trim().max(300).optional() });
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Reopen = z.object({ action: z.literal("reopen"), id: z.number().int().positive(), note: z.string().trim().min(5).max(300), due: Day.optional() });
const Withdraw = z.object({ action: z.literal("withdraw"), id: z.number().int().positive(), note: z.string().trim().min(5).max(300) });
const Reassign = z.object({ action: z.literal("reassign"), id: z.number().int().positive(), dept: z.enum(FIX_DEPTS).optional(), due: Day.optional(), note: z.string().trim().max(300).optional() })
  .refine((v) => !!(v.dept || v.due), "Choose another department or a new due date.");

const WORD: Record<string, [string, string]> = { flood: ["street", "streets"], traffic: ["road", "roads"], power: ["ward", "wards"], metro: ["line", "lines"] };
const SKIP_WORD: Record<Skip["why"], string> = {
  "not-hit": "not hit in this rain", unfinished: "already has an action in progress", "same-rain": "already acted on for this rain", repeat: "listed twice"
};

/**
 * Rain's action tracker for the Collector (Rain view, every tab): GET lists every fix after a rain with its stage, steps and
 * outcome at the rains since; POST assigns fixes for one rain (one place or many at once), verifies a fix the department marked
 * done, or sends it back with a note. Each POST is confirmed with the Collector's password (lib/security/stepup.ts "decide").
 */
export async function GET() {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json(await trackerState(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof RehearsalUnavailable) return NextResponse.json({ error: e.message }, { status: e.status });
    return failed(e, "the rain action tracker");
  }
}

export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  // up to 300 places with a 300-character note each: more than the 64 KB default, far less than a photo
  const { body: raw, tooLarge } = await readJsonCapped(req, 256 * 1024);
  if (tooLarge) return tooLargeResponse();
  const action = (raw as { action?: unknown } | null)?.action;
  try {
    if (action === "assign") {
      const b = Assign.safeParse(raw);
      if (!b.success) {
        const many = Array.isArray((raw as { items?: unknown[] })?.items) && ((raw as { items: unknown[] }).items.length > 300);
        return NextResponse.json({ error: many ? "Too many places at once: assign at most 300 in one go." : "Choose a department, write a note (10 characters or more) and a due date for each place." }, { status: 400 });
      }
      const { lens, rain, due, items } = b.data;
      if (due < istDay() || due > istDay(MAX_DUE_DAYS)) return NextResponse.json({ error: `The due date must be between today and ${MAX_DUE_DAYS} days from now.` }, { status: 400 });
      const p = await prepareAssign(lens, rain, items);
      if (!p.rain) return NextResponse.json({ error: "No such rain in the record." }, { status: 404 });
      const skipped = p.skipped.map((x) => ({ ...x, words: SKIP_WORD[x.why] }));
      if (!p.ok.length) return NextResponse.json({ error: `Nothing to assign: ${skipped.length === 1 ? `this ${WORD[lens][0]} is ${skipped[0].words}` : `every ${WORD[lens][0]} is not hit in this rain or already has an action`}.`, skipped }, { status: 409 });
      const depts = new Set(p.ok.map((x) => x.dept));
      const n = p.ok.length;
      const c = await requireConfirm(req, s, "decide", `Assign ${n} ${WORD[lens][n === 1 ? 0 : 1]} to ${depts.size === 1 ? "1 department" : `${depts.size} departments`}, due ${due}`,
        { action: "assign", lens, rain, due, items: p.ok.map((x) => ({ place: x.place, dept: x.dept, note: x.note })).sort((a, z2) => a.place.localeCompare(z2.place)) });
      if (!c.ok) return c.res;
      const made = await assignFixes(rain, lens, due, s.email, p.ok, c.grant?.fac ?? null);
      return NextResponse.json({ created: made.length, ids: made.map((x) => x.id), skipped, depts: depts.size }, { status: 201 });
    }
    if (action === "verify" || action === "reopen" || action === "withdraw" || action === "reassign") {
      const b = (action === "verify" ? Verify : action === "reopen" ? Reopen : action === "withdraw" ? Withdraw : Reassign).safeParse(raw);
      if (!b.success) {
        const msg = action === "reopen" ? "Say what is still needed (5 characters or more)." : action === "withdraw" ? "Say why the fix is withdrawn (5 characters or more)."
          : action === "reassign" ? "Choose another department or a new due date." : "No such fix.";
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      const d = b.data as { id: number; note?: string; dept?: string; due?: string };
      if (d.due && (d.due < istDay() || d.due > istDay(MAX_DUE_DAYS))) return NextResponse.json({ error: `The due date must be between today and ${MAX_DUE_DAYS} days from now.` }, { status: 400 });
      const f = await fixById(d.id);
      if (!f) return NextResponse.json({ error: "No such fix." }, { status: 404 });
      const note = d.note?.trim() || null;
      const what = action === "verify" ? "Verify the fix at" : action === "reopen" ? "Send back the fix at" : action === "withdraw" ? "Withdraw the fix at" : "Move the fix at";
      const c = await requireConfirm(req, s, "decide", `${what} ${f.head.p ?? f.place}${action === "reassign" ? `${d.dept ? ` to ${d.dept}` : ""}${d.due ? `, due ${d.due}` : ""}` : ""}`,
        { action, id: d.id, note, dept: d.dept ?? null, due: d.due ?? null });
      if (!c.ok) return c.res;
      const r = await stepFix(d.id, action, { role: "collector", user: s.email }, { remarks: note, dept: d.dept ?? null, due: d.due ?? null, confirmedWith: c.grant?.fac ?? null });
      return NextResponse.json(r.body, { status: r.status });
    }
    return NextResponse.json({ error: "Ask to assign, verify, send back, withdraw or move a fix." }, { status: 400 });
  } catch (e) {
    if (e instanceof RehearsalUnavailable) return NextResponse.json({ error: e.message }, { status: e.status });
    return failed(e, "the rain action tracker");
  }
}
