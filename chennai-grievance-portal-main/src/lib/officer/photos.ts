/**
 * Photos attached to completion reports. They are stored outside `public/` and
 * served only through /api/officer/photos, which checks that the viewer is the
 * Collector or an officer of the department that sent the report (site photos can
 * show residents and their homes). The folder is configurable for hosted deployments.
 */
import { randomBytes } from "crypto";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";

export const PHOTO_TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
export type PhotoExt = keyof typeof PHOTO_TYPES;

export const DIR_RE = /^\d{8}-[a-f0-9]{16}$/;
export const NAME_RE = /^\d{1,2}\.(jpg|png|webp)$/;

export function uploadRoot(): string {
  return path.resolve(process.env.OFFICER_UPLOAD_DIR || path.join(process.cwd(), "uploads", "officer-reports"));
}

/** File type from the first bytes, so a renamed file cannot pass as an image. */
export function sniff(buf: Buffer): PhotoExt | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

export function newPhotoDir(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${ymd}-${randomBytes(8).toString("hex")}`;
}

/** Writes the photos as 1.jpg, 2.png, ... and returns their names. */
export async function savePhotos(dir: string, files: { buf: Buffer; ext: PhotoExt }[]): Promise<string[]> {
  if (!DIR_RE.test(dir)) throw new Error("Invalid photo folder");
  const full = path.join(uploadRoot(), dir);
  await mkdir(full, { recursive: true });
  const names: string[] = [];
  for (const [k, f] of files.entries()) {
    const name = `${k + 1}.${f.ext}`;
    await writeFile(path.join(full, name), f.buf, { flag: "wx" });
    names.push(name);
  }
  return names;
}

export async function removePhotoDir(dir: string): Promise<void> {
  if (DIR_RE.test(dir)) await rm(path.join(uploadRoot(), dir), { recursive: true, force: true });
}

export async function readPhoto(dir: string, name: string): Promise<{ buf: Buffer; type: string } | null> {
  if (!DIR_RE.test(dir) || !NAME_RE.test(name)) return null;
  try {
    const buf = await readFile(path.join(uploadRoot(), dir, name));
    return { buf, type: PHOTO_TYPES[name.split(".")[1] as PhotoExt] };
  } catch {
    // a generated resolution's photo (lib/cases/synthetic.ts) on a copy of the site that did not write it (the hosted copy, a fresh
    // checkout): the folder name says which library photo it is a copy of, and the library is in the repository
    return libraryPhoto(dir, name);
  }
}

// ------------------------------------------------------------- generated photos --

/**
 * The generated "after" photos of the daily generated resolutions (lib/cases/synthetic.ts): made once (scripts/build-case-photos.cjs),
 * kept in the repository (data/case-photos, index.json lists them in a fixed order) and copied into an ordinary report folder for each
 * resolution. Such a folder is named `<yyyymmdd>-c45e00<4 hex: the library index><6 hex>`, so any copy of the site can serve the photo
 * from the library when the folder itself is not on its disk.
 */
export const GENERATED_DIR_MARK = "c45e00";
const GENERATED_DIR_RE = /^\d{8}-c45e00([0-9a-f]{4})[0-9a-f]{6}$/;

export function libraryRoot(): string {
  return path.resolve(process.env.CASE_PHOTO_LIBRARY || path.join(process.cwd(), "data", "case-photos"));
}

export interface LibraryEntry { file: string; group: string; source: string; made: string; prompt?: string }

let libCache: { at: number; files: (LibraryEntry | null)[] } | null = null;
/**
 * The library's index (data/case-photos/index.json), read at most once a minute; empty when there is none. A report folder names its
 * photo by its PLACE in the index, so positions are kept: a malformed entry becomes null in its slot instead of shifting the later ones.
 */
export async function libraryIndex(): Promise<(LibraryEntry | null)[]> {
  if (libCache && Date.now() - libCache.at < 60_000) return libCache.files;
  let files: (LibraryEntry | null)[] = [];
  try {
    const j = JSON.parse(await readFile(path.join(libraryRoot(), "index.json"), "utf8")) as { files?: LibraryEntry[] };
    files = Array.isArray(j.files) ? j.files.map((f) => (f && typeof f.file === "string" && /^[a-z0-9-]+\.(jpg|png|webp)$/.test(f.file) ? f : null)) : [];
  } catch { files = []; }
  libCache = { at: Date.now(), files };
  return files;
}

/** The library photo a generated report folder is a copy of, or null (any other folder, or a photo not in the library). */
export async function libraryPhoto(dir: string, name: string): Promise<{ buf: Buffer; type: string } | null> {
  const m = GENERATED_DIR_RE.exec(dir);
  if (!m || name !== "1.jpg") return null;
  const entry = (await libraryIndex())[parseInt(m[1], 16)];
  if (!entry) return null;
  try {
    const buf = await readFile(path.join(libraryRoot(), entry.file));
    return { buf, type: PHOTO_TYPES[entry.file.split(".")[1] as PhotoExt] };
  } catch {
    return null;
  }
}

export const photoUrl = (dir: string, name: string) => `/api/officer/photos/${dir}/${name}`;
