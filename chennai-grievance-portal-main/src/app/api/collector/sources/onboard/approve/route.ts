import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectorSession, failed } from "@/lib/collector/guard";
import { OnboardError, approve } from "@/lib/collector/onboard";
import { Mapping } from "../schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  url: z.string().trim().url().max(500),
  kind: z.enum(["rss", "json", "html"]),
  detected: z.enum(["rss", "api", "page", "login"]),
  name: z.string().trim().min(2).max(128),
  about: z.string().trim().max(500).default(""),
  recordPath: z.string().max(500).nullable(),
  mapping: Mapping,
  refreshMinutes: z.number().int().min(60).max(1440),
  auth: z.object({
    mode: z.enum(["form", "basic", "token"]),
    loginUrl: z.string().trim().url().max(500).nullable().optional(),
    userField: z.string().trim().max(64).nullable().optional(),
    passField: z.string().trim().max(64).nullable().optional(),
    username: z.string().trim().max(255).nullable().optional(),
    secret: z.string().max(2000).nullable().optional()
  }).nullable(),
  authorized: z.literal(true, { errorMap: () => ({ message: "Confirm that the office is authorized to use this source." }) })
});

/** The Collector approves the agent's draft: the source is stored with its mapping and runs once now, then on schedule. */
export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid source." }, { status: 400 });
  try {
    return NextResponse.json(await approve(parsed.data, s.email));
  } catch (err: any) {
    if (err instanceof OnboardError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err?.code === "ER_DUP_ENTRY" || /UNIQUE constraint/i.test(String(err?.message))) return NextResponse.json({ error: "This link is already connected." }, { status: 409 });
    return failed(err, "the new source");
  }
}
