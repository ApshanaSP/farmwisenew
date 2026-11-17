import { NextRequest, NextResponse } from "next/server";
import { newsDoc } from "@/lib/collector/intel";
import { localOnly } from "@/lib/thunai/devguard";
import { NewsBody, ndjson, newsEvents, type StoredDoc } from "@/lib/thunai/web/serve";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The dev console's twin of /api/collector/thunai/news: the same code on the local store, no sign-in. 404 in production. */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_JARVIS_SPEC !== "1") return new NextResponse(null, { status: 404 });
  if (!localOnly(req.headers)) return new NextResponse(null, { status: 404 });
  const parsed = NewsBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send { id } or { question }." }, { status: 400 });
  return ndjson(newsEvents(parsed.data, { loadDoc: (id) => newsDoc(id) as Promise<StoredDoc | null>, signal: req.signal, user: "dev" }));
}
