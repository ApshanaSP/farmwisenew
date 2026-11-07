/**
 * Where a running server may write the grievance dataset (RC-45, PB-266).
 *
 * The dataset folder defaults to data/datasets, which is tracked in git. A server that is not saving to the real store (the same switch the
 * store uses) must not write there, or every test complaint dirties the repo. It may write only when DATASET_DIR names a folder of its own.
 * The store's own rule: with the aws backend, saving needs AWS_STORE_SAVE=1, and AWS_STORE_DRY_RUN=1 turns saving off in any case.
 */
export function datasetWriteAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.DATASET_DIR) return true;
  if (env.AWS_STORE_DRY_RUN === "1") return false;
  if (env.DATA_BACKEND === "aws" && env.AWS_STORE_SAVE !== "1") return false;
  return true;
}
