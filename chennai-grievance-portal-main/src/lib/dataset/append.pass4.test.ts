import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// RC-45 (PB-266): a dry-run or test server must not write complaints into the tracked data/datasets files.
const query = vi.fn(async () => [[]]);
vi.mock("@/lib/db", () => ({ default: { query } }));

let root = "";
const saved = { ...process.env };
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rc45-"));
  vi.spyOn(process, "cwd").mockReturnValue(root);
  query.mockClear();
  delete process.env.DATASET_DIR;
});
afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...saved };
  fs.rmSync(root, { recursive: true, force: true });
});

const files = () => (fs.existsSync(path.join(root, "data")) ? fs.readdirSync(path.join(root, "data"), { recursive: true }) : []);

describe("RC-45 the dataset write follows the same dry-run switch as the store", () => {
  it("PB-266: a dry-run server with no folder of its own writes nothing and does not even query", async () => {
    process.env.AWS_STORE_DRY_RUN = "1";
    process.env.DATA_BACKEND = "aws";
    const { appendComplaintToDataset, appendStatusChangeToDataset } = await import("./append");
    await appendComplaintToDataset("C-1");
    await appendStatusChangeToDataset("C-1");
    expect(query).not.toHaveBeenCalled();
    expect(files()).toEqual([]);
  });
  it("an aws-backed server that is not set to save also writes nothing", async () => {
    process.env.DATA_BACKEND = "aws";
    process.env.AWS_STORE_SAVE = "";
    delete process.env.AWS_STORE_DRY_RUN;
    const { appendComplaintToDataset } = await import("./append");
    await appendComplaintToDataset("C-2");
    expect(query).not.toHaveBeenCalled();
  });
  it("a server given its own DATASET_DIR still writes there (the dry-run store does not stop a private folder)", async () => {
    process.env.AWS_STORE_DRY_RUN = "1";
    process.env.DATASET_DIR = path.join(root, "own");
    const { appendComplaintToDataset } = await import("./append");
    await appendComplaintToDataset("C-3");
    expect(query).toHaveBeenCalled();
  });
  it("a live server (saving on) keeps the old behaviour", async () => {
    process.env.DATA_BACKEND = "aws";
    process.env.AWS_STORE_SAVE = "1";
    delete process.env.AWS_STORE_DRY_RUN;
    const { appendComplaintToDataset } = await import("./append");
    await appendComplaintToDataset("C-4");
    expect(query).toHaveBeenCalled();
  });
});

describe("RC-45 class guard: nothing under src reaches the dataset folder without the gate", () => {
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const src = path.join(__dirname, "..", "..");
  const code = walk(src).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !/\.live\.ts$|golden/.test(f));
  it("every file that asks for the dataset paths also asks the gate", () => {
    const bad = code.filter((f) => /datasetPaths\(/.test(fs.readFileSync(f, "utf8")) && !/datasetWriteAllowed\(/.test(fs.readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
  it("no file writes to a literal data/datasets path", () => {
    const bad = code.filter((f) => /["']data["']\s*,\s*["']datasets["']/.test(fs.readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
  it("the launcher gives every test server a DATASET_DIR of its own", () => {
    const env = fs.readFileSync(path.join(src, "..", "tests", "qa", "pass4", "lib", "env.mjs"), "utf8");
    expect(env).toMatch(/DATASET_DIR:/);
  });
});
