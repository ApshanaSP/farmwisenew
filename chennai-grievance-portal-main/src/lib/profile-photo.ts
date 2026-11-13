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

/** A photo the old route wrote under public/ for this account: public/uploads/profile/user-<id>-<ms>.<ext>, or null. */
const LEGACY_RE = /^\/uploads\/profile\/user-(\d+)-\d+\.(png|jpg)$/;
function legacyFile(stored: string | null | undefined, userId: number): { file: string; ext: "png" | "jpg" } | null {
  const m = LEGACY_RE.exec(String(stored ?? ""));
  if (!m || Number(m[1]) !== Number(userId)) return null;
  return { file: path.join(process.cwd(), "public", String(stored).slice(1)), ext: m[2] as "png" | "jpg" };
}

/** Removes a replaced photo: a private one, or this account's old file under public/ (pass 7 reviewer 3). A missing file is fine. */
export async function removePhoto(stored: string | null | undefined, userId?: number): Promise<void> {
  const name = photoName(stored);
  if (name) await unlink(path.join(photoRoot(), name)).catch(() => undefined);
  const old = userId != null ? legacyFile(stored, userId) : null;
  if (old) await unlink(old.file).catch(() => undefined);
}

/**
 * This account's photo still under public/ (written by the old route), moved into the private store: the new URL to store, or null when
 * there is none to move. Old photos stayed public under their guessable names (pass 7 reviewer 3 on hunt2-sec-07); each moves the next time
 * its account reads its profile. Files of accounts that never come back stay where they are (an owner's clean-up, in the pass 7 note).
 */
export async function moveLegacyPhoto(stored: string | null | undefined, userId: number): Promise<string | null> {
  const old = legacyFile(stored, userId);
  if (!old) return null;
  const buf = await readFile(old.file).catch(() => null);
  if (!buf) return null;
  const url = await savePhoto(buf, old.ext);
  await unlink(old.file).catch(() => undefined);
  return url;
}
