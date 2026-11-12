import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, describe, expect, it, vi } from "vitest";

// reviewerA-06 (pass4-open-01 fix review): the first dataset append after a server start parsed grievances.csv (about 13 MB) and
// the history file synchronously, holding every request for about a second. The keys are now read a few seconds after start.

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fixall-warm-"));
vi.stubEnv("DATASET_DIR", dir);
fs.writeFileSync(path.join(dir, "grievances.csv"), "Complaint No,Title\n2026-111AAA,Garbage\n2026-222BBB,Drain\n");
fs.writeFileSync(path.join(dir, "grievance_status_history.csv"), "Complaint No,Status,Changed By Role,x,Changed On\n2026-111AAA,Complaint Filed,Citizen,,2026-10-10 09:00:00\n");
vi.mock("@/lib/db", () => ({ default: { query: async () => [[]] } }));

afterAll(() => { vi.unstubAllEnvs(); fs.rmSync(dir, { recursive: true, force: true }); });

describe("reviewerA-06: the dataset's keys are loaded at start, not by the first request", () => {
  it("warmDatasetKeys reads both files once, so the first append finds their keys already loaded", async () => {
    const { warmDatasetKeys } = await import("@/lib/dataset/append");
    const files = await import("../../../scripts/lib/dataset-files");
    const paths = files.datasetPaths(process.cwd());
    expect(path.resolve(paths.grievances)).toBe(path.resolve(dir, "grievances.csv"));
    const g = global as unknown as { __datasetKeys?: Map<string, { keys: Set<string> }> };
    g.__datasetKeys?.clear();
    await warmDatasetKeys();
    expect([...(g.__datasetKeys?.get(paths.grievances)?.keys ?? [])].sort()).toEqual(["2026-111AAA", "2026-222BBB"]);
    expect(g.__datasetKeys?.get(paths.history)?.keys.size).toBe(1);
  });

  it("the server's start-up hook schedules it", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/instrumentation-node.ts"), "utf8");
    expect(src).toMatch(/import\("@\/lib\/dataset\/append"\)\.then\(\(m\) => m\.warmDatasetKeys\(\)\)/);
  });
});
