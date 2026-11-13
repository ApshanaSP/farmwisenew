/**
 * Read a JSON request body with a size limit, before anything parses it. A route that takes no sign-in (or any route
 * that hands the body to a schema) must not build a 20 MB object tree: zod makes one error object per bad array element,
 * and the server ran out of memory. The limit applies to the bytes actually read, so a missing or false Content-Length
 * (chunked bodies) cannot get round it.
 */
import { NextResponse } from "next/server";

export const BODY_LIMIT = 64 * 1024;

export type CappedJson = { body: unknown; tooLarge: boolean };

/** The body's bytes, read up to maxBytes: "too-large" as soon as the declared length or the bytes read pass it; null if unreadable. */
async function readCapped(req: Request, maxBytes: number): Promise<Buffer | "too-large" | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    try { await req.body?.cancel(); } catch { /* the connection is closed anyway */ }
    return "too-large";
  }
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    let r: ReadableStreamReadResult<Uint8Array>;
    try { r = await reader.read(); } catch { return null; }
    if (r.done) break;
    size += r.value.byteLength;
    if (size > maxBytes) {
      try { await reader.cancel(); } catch { /* ignore */ }
      return "too-large";
    }
    chunks.push(r.value);
  }
  return Buffer.concat(chunks);
}

export async function readJsonCapped(req: Request, maxBytes: number = BODY_LIMIT): Promise<CappedJson> {
  const buf = await readCapped(req, maxBytes);
  if (buf === "too-large") return { body: null, tooLarge: true };
  if (!buf) return { body: null, tooLarge: false };
  try { return { body: JSON.parse(buf.toString("utf8")), tooLarge: false }; } catch { return { body: null, tooLarge: false }; }
}

export type CappedForm = { form: FormData | null; tooLarge: boolean };

/**
 * A multipart (or urlencoded) form, read with the same limit before it is parsed: req.formData() reads the whole body into memory
 * first, whatever its size, and the per-file limits came only after (officer-day-25). The limit is what the largest valid request
 * can be (every file at its limit, plus the text fields).
 */
export async function readFormCapped(req: Request, maxBytes: number): Promise<CappedForm> {
  const buf = await readCapped(req, maxBytes);
  if (buf === "too-large") return { form: null, tooLarge: true };
  if (!buf) return { form: null, tooLarge: false };
  try {
    const form = await new Response(new Uint8Array(buf), { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
    return { form, tooLarge: false };
  } catch {
    return { form: null, tooLarge: false };
  }
}

export const tooLargeResponse = () => NextResponse.json({ error: "That request is too large." }, { status: 413 });
