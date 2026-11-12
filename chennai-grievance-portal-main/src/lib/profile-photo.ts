/**
 * Profile photos. They are written outside `public/` (a production build serves only the files that were in public/ when
 * it was built, so a photo uploaded later answered 404: QA4 gate, redteam-final-11) and are read back through
 * /api/profile/photo/<name>. Pages still use the address /uploads/profile/<name>; next.config.js rewrites it to the route.
 * Older photos are still in public/uploads/profile and are read from there when they are not in the new folder.
 */
import { readFile } from "fs/promises";
import path from "path";

export const PROFILE_NAME_RE = /^user-(\d+)-\d+\.(jpg|png)$/;
export const PROFILE_TYPES = { jpg: "image/jpeg", png: "image/png" } as const;

export function profileDir(): string {
  return path.resolve(process.env.PROFILE_UPLOAD_DIR || path.join(process.cwd(), "uploads", "profile"));
}

/** The photo's bytes and type: the new folder first, then the old one under public/. Null when the name is not one of ours or the file is not there. */
export async function readProfilePhoto(name: string): Promise<{ buf: Buffer; type: string } | null> {
  const m = PROFILE_NAME_RE.exec(name);
  if (!m) return null;
  for (const dir of [profileDir(), path.join(process.cwd(), "public", "uploads", "profile")]) {
    try {
      return { buf: await readFile(path.join(dir, name)), type: PROFILE_TYPES[m[2] as "jpg" | "png"] };
    } catch { /* try the next folder */ }
  }
  return null;
}
