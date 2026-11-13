/**
 * Where a running server may write the grievance dataset (RC-45, PB-266).
 *
 * The dataset folder defaults to data/datasets, which is tracked in git. A server that is not saving to the real store (the same switch the
 * store uses) must not write there, or every test complaint dirties the repo. It may write only when DATASET_DIR names a folder of its own.
 * The store's own rule: with the aws backend, saving needs AWS_STORE_SAVE=1, and AWS_STORE_DRY_RUN=1 turns saving off in any case.
 */
import fs from "node:fs";
import path from "node:path";

/** The folder as the disk names it: links followed, and letter case folded where the disk ignores case (Windows, macOS). A folder that is not there yet is its nearest existing parent plus the rest. */
function onDisk(p: string): string {
  let rest = "", cur = path.resolve(p);
  for (;;) {
    try { cur = fs.realpathSync.native(cur); break; } catch { const up = path.dirname(cur); if (up === cur) break; rest = path.join(path.basename(cur), rest); cur = up; }
  }
  const full = path.join(cur, rest);
  return process.platform === "win32" || process.platform === "darwin" ? full.toLowerCase() : full;
}

/** DATASET_DIR names the tracked default folder itself: that is not a folder of its own (SK-E-7). */
function ownFolder(dir: string | undefined): boolean {
  return !!dir && onDisk(dir) !== onDisk(path.resolve(process.cwd(), "data/datasets"));
}

export function datasetWriteAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (ownFolder(env.DATASET_DIR)) return true;
  if (env.AWS_STORE_DRY_RUN === "1") return false;
  if (env.DATA_BACKEND === "aws" && env.AWS_STORE_SAVE !== "1") return false;
  return true;
}
