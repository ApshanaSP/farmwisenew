/**
 * Read a JSON request body with a size limit, before anything parses it. A route that takes no sign-in (or any route
 * that hands the body to a schema) must not build a 20 MB object tree: zod makes one error object per bad array element,
 * and the server ran out of memory. The limit applies to the bytes actually read, so a missing or false Content-Length
 * (chunked bodies) cannot get round it.
 */
import { NextResponse } from "next/server";

export const BODY_LIMIT = 64 * 1024;

export type CappedJson = { body: unknown; tooLarge: boolean };

export async function readJsonCapped(req: Request, maxBytes: number = BODY_LIMIT): Promise<CappedJson> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    try { await req.body?.cancel(); } catch { /* the connection is closed anyway */ }
    return { body: null, tooLarge: true };
  }
  const reader = req.body?.getReader();
  if (!reader) return { body: null, tooLarge: false };
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    let r: ReadableStreamReadResult<Uint8Array>;
    try { r = await reader.read(); } catch { return { body: null, tooLarge: false }; }
    if (r.done) break;
    size += r.value.byteLength;
    if (size > maxBytes) {
      try { await reader.cancel(); } catch { /* ignore */ }
      return { body: null, tooLarge: true };
    }
    chunks.push(r.value);
  }
  try { return { body: JSON.parse(Buffer.concat(chunks).toString("utf8")), tooLarge: false }; } catch { return { body: null, tooLarge: false }; }
}

export const tooLargeResponse = () => NextResponse.json({ error: "That request is too large." }, { status: 413 });
