/**
 * Petition photos. They show names, phone numbers and sometimes Aadhaar numbers, so they live outside `public/` and are served only
 * through /api/manu/photos, which checks who is asking. The type comes from the file's first bytes, never its name.
 */
import { randomBytes } from "crypto";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { pdfImages } from "@/lib/studio/ocr";
import { MANU_LIMITS } from "./constants";

export const PHOTO_NAME = /^[a-f0-9]{32}\.(jpg|png)$/;
const dir = () => process.env.PETITION_UPLOAD_DIR || path.join(process.cwd(), "data", "private-uploads", "petitions");

export function kindOf(b: Buffer): "jpg" | "png" | "pdf" | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length > 5 && b.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  return null;
}

export const mediaTypeOf = (name: string): "image/jpeg" | "image/png" => (name.endsWith(".png") ? "image/png" : "image/jpeg");

export class UploadError extends Error {}

/** The pages of one petition as image files on disk: photos as they are, a scanned PDF as its page images. */
export async function savePages(files: Buffer[]): Promise<string[]> {
  const images: { b: Buffer; ext: "jpg" | "png" }[] = [];
  for (const b of files) {
    const k = kindOf(b);
    if (k === "pdf") {
      if (b.length > MANU_LIMITS.maxPdfBytes) throw new UploadError("That PDF is too large. Please keep it under 20 MB.");
      const found = pdfImages(b).images.flatMap((x) => { const e = kindOf(x); return e === "jpg" || e === "png" ? [{ b: x, ext: e }] : []; });
      if (!found.length) throw new UploadError("No scanned pages could be taken from that PDF. Please upload photos of the petition instead.");
      images.push(...found);
    } else if (k) images.push({ b, ext: k });
    else throw new UploadError("Please upload JPG or PNG photos, or a scanned PDF.");
  }
  if (!images.length) throw new UploadError("Choose at least one photo of the petition.");
  if (images.length > MANU_LIMITS.maxPages) throw new UploadError(`A petition can have at most ${MANU_LIMITS.maxPages} pages.`);
  if (images.some((i) => i.b.length > MANU_LIMITS.maxImageBytes)) throw new UploadError("One of the pages is too large to read. Please take the photo again at a lower size.");
  await mkdir(dir(), { recursive: true });
  const names: string[] = [];
  for (const i of images) {
    const name = `${randomBytes(16).toString("hex")}.${i.ext}`;
    await writeFile(path.join(dir(), name), i.b);
    names.push(name);
  }
  return names;
}

export async function readPhoto(name: string): Promise<Buffer | null> {
  if (!PHOTO_NAME.test(name)) return null;
  try { return await readFile(path.join(dir(), name)); } catch { return null; }
}

export async function removePhoto(name: string): Promise<void> {
  if (PHOTO_NAME.test(name)) await rm(path.join(dir(), name), { force: true });
}
