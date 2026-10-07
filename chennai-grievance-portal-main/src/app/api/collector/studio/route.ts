import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { aiStatus } from "@/lib/ai/gateway";
import { collectorSession, failed } from "@/lib/collector/guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { runPlan } from "@/lib/studio/engine";
import { MAX_BYTES } from "@/lib/studio/fetchurl";
import { note, stream } from "@/lib/studio/http";
import { ingest, ingestLink, namesOf, runDueRefreshes } from "@/lib/studio/pipeline";
import { refs } from "@/lib/studio/refs";
import { availableSamples, sampleFile } from "@/lib/studio/samples";
import { getBoard, getMeta, getRows, listDatasets } from "@/lib/studio/store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** The Collector's datasets, the board of pinned panels (computed live), the samples and whether an AI model is set up. */
export async function GET() {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  try {
    runDueRefreshes();
    const names = namesOf(await refs());
    const board = getBoard().flatMap((pin) => {
      const meta = getMeta(pin.datasetId);
      if (!meta) return [];
      try {
        return [{ pin, panel: runPlan(getRows(pin.datasetId), meta.spec, pin.plan, names), dataset: { id: meta.id, name: meta.name } }];
      } catch {
        return [];
      }
    });
    const ai = aiStatus();
    return NextResponse.json({
      datasets: listDatasets(), board, samples: availableSamples(),
      ai: { available: ai.available, providers: ai.providers.map((p) => p.name), problem: ai.problem }
    });
  } catch (err) {
    return failed(err, "the data studio");
  }
}

const AuthBody = z.object({
  mode: z.enum(["none", "apikey", "basic", "login", "manual"]),
  key: z.string().max(2000).optional(), keyName: z.string().max(80).optional(), keyPlace: z.enum(["query", "header"]).optional(),
  username: z.string().max(200).optional(), password: z.string().max(400).optional(), loginUrl: z.string().trim().url().max(1000).optional().or(z.literal(""))
});
const LinkBody = z.object({
  url: z.string().trim().url().max(1000), name: z.string().trim().max(100).optional().nullable(),
  auth: AuthBody.optional().nullable(),
  /** minutes between automatic refreshes: 60, 360, 1440 (null: by hand) */
  every: z.number().int().min(30).max(10080).optional().nullable()
});
const SampleBody = z.object({ sample: z.string().max(20) });

/**
 * Add a dataset: a file (multipart "file"), a link ({ url }) or a sample ({ sample }). The answer is a stream of the
 * seven agents' progress (NDJSON) ending with { t: "done", id } or { t: "error", message }.
 */
export async function POST(req: NextRequest) {
  const s = await collectorSession();
  if (s instanceof NextResponse) return s;
  if (!checkRateLimit(`studio-add:${s.userId}`, 30, 600).allowed) return NextResponse.json({ error: "Too many files in a few minutes. Try again shortly." }, { status: 429 });
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    let form: FormData;
    try { form = await req.formData(); } catch { return NextResponse.json({ error: "The upload could not be read." }, { status: 400 }); }
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "The file is larger than 15 MB." }, { status: 413 });
    if (!/\.(xlsx|xlsm|xls|ods|csv|tsv|txt|json)$/i.test(file.name)) return NextResponse.json({ error: "Use an Excel (.xlsx, .xls), CSV or JSON file." }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    const name = String(form.get("name") ?? "").trim().slice(0, 100) || null;
    return stream(async (emit) => {
      const id = await ingest({ buf, file: file.name.slice(0, 120), kind: "file", url: null, contentType: file.type, name, user: s.email }, emit);
      await note(s.email, "studio:add", id, { file: file.name, bytes: buf.length });
      return id;
    });
  }
  const body = await req.json().catch(() => ({}));
  const sample = SampleBody.safeParse(body);
  if (sample.success) {
    const f = sampleFile(sample.data.sample);
    if (!f) return NextResponse.json({ error: "That sample is not on this server (run node scripts/make-studio-samples.cjs)." }, { status: 404 });
    return stream(async (emit) => {
      const id = await ingest({ buf: f.buf, file: f.info.file, kind: "sample", url: null, name: `${f.info.title} (sample)`, user: s.email }, emit);
      await note(s.email, "studio:add", id, { sample: f.info.key });
      return id;
    });
  }
  const link = LinkBody.safeParse(body);
  if (!link.success) return NextResponse.json({ error: "Paste a link (http or https), choose a file, or pick a sample." }, { status: 400 });
  const d = link.data;
  return stream(async (emit) => {
    const id = await ingestLink({ url: d.url, auth: d.auth ? { ...d.auth, loginUrl: d.auth.loginUrl || undefined } : null, every: d.every ?? null, name: d.name ?? null, user: s.email }, emit);
    // the audit says which way it signed in and as whom, never the secret
    await note(s.email, "studio:add", id, { url: d.url, auth: d.auth?.mode ?? "none", account: d.auth?.username ?? null, every: d.every ?? null });
    return id;
  });
}
