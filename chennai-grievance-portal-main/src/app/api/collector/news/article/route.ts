import { NextRequest, NextResponse } from "next/server";
import { collectorSession, failed } from "@/lib/collector/guard";
import { newsDoc } from "@/lib/collector/intel";
import { fullText } from "@/lib/collector/fulltext";

export const dynamic = "force-dynamic";

/** GET ?id=DOC: the full text of one news report, fetched from the publisher when the monitor kept only its headline. */
export async function GET(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!/^[A-Za-z0-9_:.-]{1,80}$/.test(id)) return NextResponse.json({ error: "Invalid report id." }, { status: 400 });
  try {
    const d = await newsDoc(id);
    if (!d) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    if (d.body && String(d.body).trim().length > 200) return NextResponse.json({ status: "full", url: d.url, text: String(d.body) });
    const r = await fullText(d as Parameters<typeof fullText>[0]);
    return NextResponse.json({ status: r.status, url: r.url, text: r.text });
  } catch (err) {
    return failed(err, "the article");
  }
}
