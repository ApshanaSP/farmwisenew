/**
 * The "after" photo of a generated resolution (lib/cases/synthetic.ts): a photo from the generated library (data/case-photos, made once by
 * scripts/build-case-photos.cjs; no AI call at run time) copied into an ordinary completion-report folder under the officers' upload folder,
 * so it is stored and served the way an officer's upload is (lib/officer/photos.ts, the access-checked photo route). A generated.json next
 * to it says it is generated and where it came from (never served: the photo route serves numbered photos only).
 */
import { randomBytes } from "crypto";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { DIR_RE, GENERATED_DIR_MARK, libraryIndex, libraryRoot, uploadRoot } from "@/lib/officer/photos";
import { hash32 } from "./synthetic-plan";

export interface PlacedPhoto { dir: string; names: string[]; libraryFile: string; source: string }

/** The library photos of one set (a kind of work), with their place in the index. */
export async function librarySet(group: string): Promise<{ k: number; file: string; source: string }[]> {
  return (await libraryIndex()).flatMap((e, k) => (e && e.group === group ? [{ k, file: e.file, source: e.source, group: e.group }] : []));
}

/**
 * Copies one library photo of `group` (picked by `seed`; any photo of the library when the set is empty) into a new report folder named
 * for `day` (yyyy-mm-dd) and the library photo, and returns the folder and file names to store on the report. Null when the library is empty.
 */
export async function placePhoto(group: string, seed: string, day: string, meta: Record<string, unknown>): Promise<PlacedPhoto | null> {
  const all = (await libraryIndex()).flatMap((e, k) => (e ? [{ k, file: e.file, source: e.source }] : []));
  if (!all.length) return null;
  const set = await librarySet(group);
  const pick = set.length ? set[hash32(`photo|${seed}`) % set.length] : all[hash32(`photo|${seed}`) % all.length];
  const dir = `${day.replace(/-/g, "")}-${GENERATED_DIR_MARK}${pick.k.toString(16).padStart(4, "0")}${randomBytes(3).toString("hex")}`;
  if (!DIR_RE.test(dir)) throw new Error(`generated photo folder name ${dir} is not a report folder name`);
  const full = path.join(uploadRoot(), dir);
  await mkdir(full, { recursive: true });
  await writeFile(path.join(full, "1.jpg"), await readFile(path.join(libraryRoot(), pick.file)), { flag: "wx" });
  await writeFile(path.join(full, "generated.json"), JSON.stringify({ generated: true, source: "synthetic-resolutions", photo: pick.file, made_by: pick.source, ...meta }, null, 1));
  return { dir, names: ["1.jpg"], libraryFile: pick.file, source: pick.source };
}

export async function removePlaced(dir: string): Promise<void> {
  if (DIR_RE.test(dir) && dir.includes(GENERATED_DIR_MARK)) await rm(path.join(uploadRoot(), dir), { recursive: true, force: true });
}
