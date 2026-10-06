import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession } from "@/lib/collector/guard";
import { onboard } from "@/lib/collector/onboard";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const Body = z.object({
  url: z.string().trim().min(4).max(500),
  auth: z.object({
    mode: z.enum(["form", "basic", "token"]),
    loginUrl: z.string().trim().url().max(500).nullable().optional(),
    userField: z.string().trim().max(64).nullable().optional(),
    passField: z.string().trim().max(64).nullable().optional(),
    username: z.string().trim().max(255).nullable().optional(),
    secret: z.string().max(2000).nullable().optional()
  }).nullable().optional()
});

/**
 * Runs the source onboarding agent on a link. The answer is a stream of JSON lines: one {type:"step"} per step as it
 * starts and ends, then {type:"draft"} (or {type:"stop"} when a step failed). Nothing is stored.
 */
export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid link." }, { status: 400 });
  let url = parsed.data.url;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctl) {
      const send = (o: unknown) => { try { ctl.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch { /* the client left */ } };
      try {
        const draft = await onboard(url, parsed.data.auth ? { ...parsed.data.auth } : null, s.email, send);
        send(draft ? { type: "draft", draft } : { type: "stop" });
      } catch (e) {
        console.error("source onboarding failed", e);
        send({ type: "error", message: "The agent stopped unexpectedly. Try again." });
      }
      ctl.close();
    }
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
