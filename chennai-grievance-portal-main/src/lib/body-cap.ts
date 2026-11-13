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

export type CappedForm = { form: FormData | null; tooLarge: boolean; wrongType?: boolean };

/** The media type alone, lower case: "Multipart/Form-Data; boundary=x" is "multipart/form-data". */
const mediaType = (ct: string | null) => (ct ?? "").split(";")[0].trim().toLowerCase();

/**
 * application/x-www-form-urlencoded as the URL standard reads it, in one pass over the bytes. The platform's reader (Node's
 * URLSearchParams, behind Response.formData()) takes time growing with the square of the entries: 200k entries 2.4 s, a 15 MB body
 * about an hour on the server's one thread (p7-studio-egress-20). Each name and value is decoded once, from its own byte range.
 */
export function parseUrlencoded(buf: Uint8Array): FormData {
  const form = new FormData();
  const utf8 = new TextDecoder("utf-8", { ignoreBOM: true });
  const hex = (b: number) => (b >= 48 && b <= 57 ? b - 48 : b >= 65 && b <= 70 ? b - 55 : b >= 97 && b <= 102 ? b - 87 : -1);
  const out = new Uint8Array(buf.length);
  const decode = (from: number, to: number) => {
    let n = 0;
    for (let i = from; i < to; i++) {
      const b = buf[i];
      if (b === 0x2b) { out[n++] = 0x20; continue; }
      if (b === 0x25 && i + 2 < to) {
        const h = hex(buf[i + 1]), l = hex(buf[i + 2]);
        if (h >= 0 && l >= 0) { out[n++] = h * 16 + l; i += 2; continue; }
      }
      out[n++] = b;
    }
    return utf8.decode(out.subarray(0, n));
  };
  let at = 0;
  while (at <= buf.length) {
    let end = buf.indexOf(0x26, at);
    if (end < 0) end = buf.length;
    if (end > at) {
      let eq = at; // the first "=" within this entry only: a search to the end of the body for each entry is the square again
      while (eq < end && buf[eq] !== 0x3d) eq++;
      form.append(decode(at, eq), decode(Math.min(eq + 1, end), end));
    }
    at = end + 1;
  }
  return form;
}

/**
 * A multipart form (or, where the route asks for it, a urlencoded one), read with the same limit before it is parsed: req.formData()
 * reads the whole body into memory first, whatever its size, and the per-file limits came only after (officer-day-25). The limit is
 * what the largest valid request can be (every file at its limit, plus the text fields). Any other content type is refused before a
 * byte is read (wrongType; the routes answer 400): the platform's reader parsed whatever type it was told, and urlencoded in time
 * growing with the square of the body (p7-studio-egress-20).
 */
export async function readFormCapped(req: Request, maxBytes: number, accept: { urlencoded?: boolean } = {}): Promise<CappedForm> {
  const type = mediaType(req.headers.get("content-type"));
  const urlencoded = type === "application/x-www-form-urlencoded";
  if (type !== "multipart/form-data" && !(urlencoded && accept.urlencoded)) {
    try { await req.body?.cancel(); } catch { /* nothing was read */ }
    return { form: null, tooLarge: false, wrongType: true };
  }
  const buf = await readCapped(req, maxBytes);
  if (buf === "too-large") return { form: null, tooLarge: true };
  if (!buf) return { form: null, tooLarge: false };
  if (urlencoded) return { form: parseUrlencoded(buf), tooLarge: false };
  try {
    const form = await new Response(new Uint8Array(buf), { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
    return { form, tooLarge: false };
  } catch {
    return { form: null, tooLarge: false };
  }
}

export const tooLargeResponse = () => NextResponse.json({ error: "That request is too large." }, { status: 413 });
