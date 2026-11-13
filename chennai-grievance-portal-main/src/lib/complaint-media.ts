/**
 * Photos and videos citizens attach to complaints. New uploads are stored outside `public/` (in
 * data/private-uploads/complaints, or COMPLAINT_UPLOAD_DIR) and served only through
 * GET /api/complaints/media/<name>, which checks who is asking: the citizen who uploaded it, an officer of the
 * complaint's department, or the Collector. Older complaints keep their public /uploads/complaints/... paths.
 *
 * The type is decided from the file's first bytes, never from its name or the browser's word for it.
 */
import { randomBytes } from "crypto";
import { mkdir, open, readFile, stat, writeFile, type FileHandle } from "fs/promises";
import path from "path";
import { MEDIA_NAME_RE, PRIVATE_MEDIA_PREFIX } from "@/lib/complaint-media-path";

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10 MB
export const MEDIA_TYPES = { jpg: "image/jpeg", png: "image/png", mp4: "video/mp4" } as const;
export type MediaExt = keyof typeof MEDIA_TYPES;

export { MEDIA_NAME_RE, PRIVATE_MEDIA_PREFIX, isComplaintMediaPath, privateMediaName } from "@/lib/complaint-media-path";

/** File type from the first bytes: JPEG, PNG or an MP4 (ISO base media, "ftyp" box), else null. */
export function sniffMedia(buf: Buffer): MediaExt | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 12 && buf.toString("ascii", 4, 8) === "ftyp") return "mp4";
  return null;
}

export function mediaRoot(): string {
  return path.resolve(process.env.COMPLAINT_UPLOAD_DIR || path.join(process.cwd(), "data", "private-uploads", "complaints"));
}

export function newMediaName(ext: MediaExt, d = new Date()): string {
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `c-${ymd}-${randomBytes(8).toString("hex")}.${ext}`;
}

/** Writes the file and a note of who uploaded it (the complaint does not exist yet), and returns its URL. */
export async function saveMedia(buf: Buffer, ext: MediaExt, ownerUserId: number): Promise<string> {
  const name = newMediaName(ext);
  const root = mediaRoot();
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, name), buf, { flag: "wx" });
  await writeFile(path.join(root, `${name}.owner.json`), JSON.stringify({ userId: ownerUserId, at: new Date().toISOString() }), { flag: "wx" });
  return PRIVATE_MEDIA_PREFIX + name;
}

/** The citizen who uploaded a private file, or null. */
export async function mediaOwner(name: string): Promise<number | null> {
  if (!MEDIA_NAME_RE.test(name)) return null;
  try {
    const j = JSON.parse(await readFile(path.join(mediaRoot(), `${name}.owner.json`), "utf8"));
    return Number.isInteger(j?.userId) ? j.userId : null;
  } catch {
    return null;
  }
}

/**
 * A private file's path, size and type, without reading it: the media route sends it whole or one byte range from the file, never the
 * whole file read into memory (p7-desk-and-accounts-10).
 */
export async function mediaFile(name: string): Promise<{ file: string; size: number; type: string } | null> {
  if (!MEDIA_NAME_RE.test(name)) return null;
  try {
    const file = path.join(mediaRoot(), name);
    const s = await stat(file);
    return s.isFile() ? { file, size: s.size, type: MEDIA_TYPES[name.split(".").pop() as MediaExt] } : null;
  } catch {
    return null;
  }
}

/**
 * One byte range of a file of `size` bytes, from a Range header (RFC 9110, 14.1.2): null when there is none to honour (no header, or
 * several ranges, which a server may ignore: the whole file is sent), "unsatisfiable" for a bad range or one past the end (answered 416),
 * else its first and last byte. "bytes=-500" is the last 500 bytes; an end past the file stops at its last byte.
 */
export function byteRange(header: string | null, size: number): { start: number; end: number } | "unsatisfiable" | null {
  if (header == null) return null;
  const m = /^bytes=(.+)$/i.exec(header.trim());
  if (!m) return "unsatisfiable";
  const specs = m[1].split(",").map((x) => /^\s*(\d*)-(\d*)\s*$/.exec(x));
  if (specs.some((x) => !x || (!x[1] && !x[2]))) return "unsatisfiable";
  if (specs.length > 1) return null;
  const first = specs[0]![1] ? Number(specs[0]![1]) : null, last = specs[0]![2] ? Number(specs[0]![2]) : null;
  if ((first != null && !Number.isSafeInteger(first)) || (last != null && !Number.isSafeInteger(last))) return "unsatisfiable";
  if (first == null) return last! > 0 && size > 0 ? { start: Math.max(0, size - last!), end: size - 1 } : "unsatisfiable";
  if (last != null && last < first) return "unsatisfiable";
  return first < size ? { start: first, end: Math.min(last ?? size - 1, size - 1) } : "unsatisfiable";
}

/**
 * Bytes `start` to `end` (inclusive) of a file, read a piece at a time as they are sent: a video is never held whole. The file is opened
 * only when the body is first read, and closed at its end or when the reader stops.
 */
export function mediaStream(file: string, start: number, end: number): ReadableStream<Uint8Array> {
  let fh: FileHandle | null = null, pos = start;
  const done = async () => { const f = fh; fh = null; await f?.close().catch(() => undefined); };
  return new ReadableStream<Uint8Array>({
    async pull(ctl) {
      try {
        fh ??= await open(file, "r");
        const want = Math.min(64 * 1024, end + 1 - pos);
        const buf = Buffer.alloc(Math.max(want, 0));
        const { bytesRead } = want > 0 ? await fh.read(buf, 0, want, pos) : { bytesRead: 0 };
        if (bytesRead > 0) { pos += bytesRead; ctl.enqueue(new Uint8Array(buf.buffer, buf.byteOffset, bytesRead)); }
        // the end of the range, or of the file (shorter than its size said)
        if (bytesRead === 0 || pos > end) { await done(); ctl.close(); }
      } catch (err) {
        await done();
        ctl.error(err);
      }
    },
    cancel: done
  }, { highWaterMark: 0 });
}
