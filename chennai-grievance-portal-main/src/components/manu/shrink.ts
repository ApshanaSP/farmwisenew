import { MANU_LIMITS } from "@/lib/manu/constants";

/** A phone photo resized in the browser (right way up, at most 2000 px, JPEG), so uploads are quick and the reader takes them. PDFs go as they are. */
export async function shrinkForUpload(file: File): Promise<File> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return file;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`"${file.name}" could not be opened. Please use a JPG or PNG photo.`);
  }
  const scale = Math.min(1, MANU_LIMITS.photoMaxPx / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.86));
  if (!blob) throw new Error(`"${file.name}" could not be prepared. Please try another photo.`);
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}
