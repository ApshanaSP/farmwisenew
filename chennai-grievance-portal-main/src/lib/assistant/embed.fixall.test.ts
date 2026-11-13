/**
 * P6-025: in this worktree the meaning-search model failed to load with only "Protobuf parsing failed" on every start. The file at
 * .cache/models/Xenova/multilingual-e5-base/onnx/model_quantized.onnx is a 134-byte Git LFS pointer (the repository keeps the model in
 * LFS, and this checkout was made without the LFS files), not the 278 MB model. The search fell back to keywords, but the reason was
 * unreadable, and each question started a new worker that failed the same way. Now a pointer or a stub fails clearly, once, before
 * any worker starts, and the keyword search answers.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/collector/db", () => ({ default: { query: async () => [[]] } }));

const POINTER = "version https://git-lfs.github.com/spec/v1\noid sha256:df7a9a29309e3ad491e1783adf8baee710262cc06079c7cbab63c630277fac94\nsize 278647662\n";
let root = "";
let file = "";
// a stand-in for node:worker_threads: the real worker would load ONNX Runtime; this one answers as it did on the pointer file
const fake = { mode: "protobuf" as "protobuf" | "ok", started: 0 };
class FakeWorker extends EventEmitter {
  constructor() {
    super();
    fake.started++;
    setTimeout(() => this.emit("message", fake.mode === "ok" ? { ready: true } : { fail: "Load model from model_quantized.onnx failed:Protobuf parsing failed." }), 0);
  }
  unref() { return this; }
  postMessage({ id, texts }: { id: number; texts: string[] }) {
    setTimeout(() => this.emit("message", { id, data: new Float32Array(texts.length * 4).fill(0.5), n: texts.length, dim: 4 }), 0);
  }
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "embed-p6025-"));
  file = path.join(root, ".cache", "models", "Xenova", "multilingual-e5-base", "onnx", "model_quantized.onnx");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  vi.spyOn(process, "cwd").mockReturnValue(root);
  const real = (process as unknown as { getBuiltinModule(id: string): unknown }).getBuiltinModule.bind(process);
  vi.spyOn(process as unknown as { getBuiltinModule(id: string): unknown }, "getBuiltinModule").mockImplementation((id: string) => (id === "node:worker_threads" ? { Worker: FakeWorker } : real(id)));
});
afterAll(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
beforeEach(() => { fake.started = 0; fake.mode = "protobuf"; });

describe("P6-025: a model file that is a Git LFS pointer fails clearly, once, and the keyword search answers", () => {
  it("embed() says the file is an LFS pointer and how to fix it, and starts no worker, however often it is asked", async () => {
    fs.writeFileSync(file, POINTER);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { embed } = await import("./embed");
    for (let i = 0; i < 3; i++) await expect(embed(["query: flooded road"])).rejects.toThrow(/Git LFS pointer.*git lfs pull/);
    expect(fake.started).toBe(0);
    expect(warn.mock.calls.filter((c) => /Git LFS pointer/.test(String(c[0])))).toHaveLength(1);
    warn.mockRestore();
  });

  it("semanticSearch falls back (null) without a warning per question", async () => {
    expect(fs.readFileSync(file, "utf8")).toBe(POINTER); // the same file as above, untouched: already said once
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { semanticSearch } = await import("./embed");
    const S = (globalThis as { __embed?: { index: unknown } }).__embed!;
    S.index = { dim: 4, ids: ["INC-1"], hash: ["x"], vecs: new Float32Array(4).fill(0.5), pos: new Map([["INC-1", 0]]), meta: new Map([["INC-1", { zone: 1, cat: null, t: 0, sev: null, place: "", words: "" }]]), asOf: null };
    expect(await semanticSearch("flooded road")).toBeNull();
    expect(await semanticSearch("garbage")).toBeNull();
    expect(fake.started).toBe(0);
    expect(warn).not.toHaveBeenCalled(); // said once already, when it was found
    warn.mockRestore();
  });

  it("once the real file is in place the model loads again (the old verdict is not kept)", async () => {
    fs.writeFileSync(file, Buffer.alloc((1 << 20) + 16, 7));
    fake.mode = "ok";
    const { embed } = await import("./embed");
    const r = await embed(["query: flooded road"]);
    expect(r.dim).toBe(4);
    expect(fake.started).toBe(1);
  });

  it("modelFileProblem: absent or whole is fine; a pointer or a stub is named", async () => {
    const { modelFileProblem } = await import("./embed");
    expect(modelFileProblem(path.join(root, "nope.onnx"))).toBeNull();
    expect(modelFileProblem(file)).toBeNull(); // the 1 MB stand-in
    const stub = path.join(root, "stub.onnx");
    fs.writeFileSync(stub, Buffer.alloc(5000, 1));
    expect(modelFileProblem(stub)).toMatch(/only 5000 bytes.*delete it/);
    fs.writeFileSync(stub, POINTER);
    expect(modelFileProblem(stub)).toMatch(/Git LFS pointer/);
  });
});
