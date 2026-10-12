/**
 * Which paths a complaint may store as its photo or video (complaints.media_path). No Node imports, so the form
 * validators can use it in the browser too; storage and serving live in complaint-media.ts.
 */

/** URL of a private upload, served by GET /api/complaints/media/<name>. */
export const PRIVATE_MEDIA_PREFIX = "/api/complaints/media/";
/** A stored file's name: c-YYYYMMDD-<16 hex>.<ext>. */
export const MEDIA_NAME_RE = /^c-\d{8}-[a-f0-9]{16}\.(jpg|png|mp4)$/;
const PRIVATE_PATH_RE = /^\/api\/complaints\/media\/c-\d{8}-[a-f0-9]{16}\.(jpg|png|mp4)$/;
/** Paths written by the old public upload route: /uploads/complaints/complaint-<ms>-<base36>.<ext>. */
const PUBLIC_PATH_RE = /^\/uploads\/complaints\/complaint-\d{10,16}-[a-z0-9]{1,8}\.(jpg|png|mp4)$/;

/** A media path a complaint may store: a private upload's URL or an existing public upload, nothing else. */
export function isComplaintMediaPath(p: string): boolean {
  return PRIVATE_PATH_RE.test(p) || PUBLIC_PATH_RE.test(p);
}

/** The stored file name behind a private media URL, or null for anything else. */
export function privateMediaName(p: string | null | undefined): string | null {
  return p && PRIVATE_PATH_RE.test(p) ? p.slice(PRIVATE_MEDIA_PREFIX.length) : null;
}

/** Is this a photo (shown inline) rather than a video? Works for both private and public paths. */
export function isPhotoPath(p: string): boolean {
  return /\.(png|jpe?g|webp|gif)$/i.test(p);
}
