/**
 * Photos and videos citizens attach to complaints. New uploads are stored outside `public/` (in
 * data/private-uploads/complaints, or COMPLAINT_UPLOAD_DIR) and served only through
 * GET /api/complaints/media/<name>, which checks who is asking: the citizen who uploaded it, an officer of the
 * complaint's department, or the Collector. Older complaints keep their public /uploads/complaints/... paths.
 *
 * The type is decided from the file's first bytes, never from its name or the browser's word for it.
 */
import { randomBytes } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
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

export async function readMedia(name: string): Promise<{ buf: Buffer; type: string } | null> {
  if (!MEDIA_NAME_RE.test(name)) return null;
  try {
    const buf = await readFile(path.join(mediaRoot(), name));
    return { buf, type: MEDIA_TYPES[name.split(".").pop() as MediaExt] };
  } catch {
    return null;
  }
}
