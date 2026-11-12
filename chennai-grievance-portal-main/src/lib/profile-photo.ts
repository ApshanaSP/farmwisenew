/**
 * A citizen's profile photo, kept the way complaint media is (complaint-media.ts): outside public/, in data/private-uploads/profile (or
 * PROFILE_UPLOAD_DIR), under a random name, and served only to its owner by GET /api/profile/photo/<name>. It was written to
 * public/uploads/profile/user-<id>-<ms>.png: a 404 on the running server (next start does not serve files added to public/ after it
 * starts), and after a restart open to anyone with no sign-in, under a name made of the sequential user id and a timestamp (QA pass 6,
 * hunt2-sec-07).
 */
import { randomBytes } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

export const PHOTO_PREFIX = "/api/profile/photo/";
/** a stored file's name: p-<20 hex>.jpg|png */
export const PHOTO_NAME_RE = /^p-[a-f0-9]{20}\.(jpg|png)$/;
const TYPES = { jpg: "image/jpeg", png: "image/png" } as const;

export function photoRoot(): string {
  return path.resolve(process.env.PROFILE_UPLOAD_DIR || path.join(process.cwd(), "data", "private-uploads", "profile"));
}

/** The stored name behind a profile_photo value, or null for anything else (an old public path, nothing). */
export function photoName(stored: string | null | undefined): string | null {
  const s = String(stored ?? "");
  return s.startsWith(PHOTO_PREFIX) && PHOTO_NAME_RE.test(s.slice(PHOTO_PREFIX.length)) ? s.slice(PHOTO_PREFIX.length) : null;
}

/** Writes the photo under a new random name and returns the URL to store. */
export async function savePhoto(buf: Buffer, ext: "jpg" | "png"): Promise<string> {
  const name = `p-${randomBytes(10).toString("hex")}.${ext}`;
  await mkdir(photoRoot(), { recursive: true });
  await writeFile(path.join(photoRoot(), name), buf, { flag: "wx" });
  return PHOTO_PREFIX + name;
}

export async function readPhoto(name: string): Promise<{ buf: Buffer; type: string } | null> {
  if (!PHOTO_NAME_RE.test(name)) return null;
  try {
    return { buf: await readFile(path.join(photoRoot(), name)), type: TYPES[name.split(".").pop() as keyof typeof TYPES] };
  } catch {
    return null;
  }
}

/** Removes a replaced photo; an old public path or a missing file is left alone. */
export async function removePhoto(stored: string | null | undefined): Promise<void> {
  const name = photoName(stored);
  if (name) await unlink(path.join(photoRoot(), name)).catch(() => undefined);
}
