import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// RC-51 (PB-329): a damaged memory file is not an empty memory, and the next write must not erase it.
let d = "";
const HALF = '{"notes":[{"id":"a","text":"the real note","at":"2026-11-01T00:00:00Z"}],"reminders":[{"id":"r"'; // cut short by a crash or a full disk
beforeEach(() => { d = fs.mkdtempSync(path.join(os.tmpdir(), "rc51-")); vi.stubEnv("THUNAI_DIR", d); vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); fs.rmSync(d, { recursive: true, force: true }); });
const f = () => path.join(d, "memory-7.json");
const kept = () => fs.readdirSync(d).filter((n) => n.includes(".damaged-")).map((n) => fs.readFileSync(path.join(d, n), "utf8"));

describe("RC-51 a damaged memory file is told apart from a missing one", () => {
  it("a missing file is an empty memory, and the strict read agrees", async () => {
    const { readMemory, readMemoryStrict } = await import("./store");
    expect(readMemory(7).notes).toEqual([]);
    expect(readMemoryStrict(7).notes).toEqual([]);
  });
  it("PB-329: a half-written file makes the strict read fail instead of showing empty lists", async () => {
    fs.writeFileSync(f(), HALF);
    const { readMemoryStrict, MemoryDamagedError } = await import("./store");
    expect(() => readMemoryStrict(7)).toThrow(MemoryDamagedError);
    expect(fs.readFileSync(f(), "utf8")).toBe(HALF); // a read changes nothing
  });
  it.each(["[]", "null", '"text"', "12", ""])("a file holding %j is damaged, not empty", async (text) => {
    fs.writeFileSync(f(), text);
    const { readMemoryStrict } = await import("./store");
    expect(() => readMemoryStrict(7)).toThrow();
  });
  it("the next write keeps the damaged file aside, and the memory file is valid again", async () => {
    fs.writeFileSync(f(), HALF);
    const { changeMemory, readMemoryStrict } = await import("./store");
    changeMemory(7, { op: "note", text: "new note" });
    expect(kept()).toEqual([HALF]);
    expect(readMemoryStrict(7).notes.map((n) => n.text)).toEqual(["new note"]);
    expect(fs.readdirSync(d).some((n) => n.endsWith(".tmp"))).toBe(false); // written through a temp file and renamed
  });
  it("a good file is never copied aside", async () => {
    const { changeMemory } = await import("./store");
    changeMemory(7, { op: "note", text: "one" });
    changeMemory(7, { op: "note", text: "two" });
    expect(kept()).toEqual([]);
  });
});

describe("RC-51 class guard: the route that shows the person their memory uses the strict read", () => {
  it("memory GET answers an error for a damaged file", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "..", "app", "api", "collector", "thunai", "memory", "route.ts"), "utf8");
    expect(src).toMatch(/readMemoryStrict\(/);
    expect(src).not.toMatch(/\breadMemory\(/);
    expect(src).toMatch(/503/);
  });
  it("no catch in store.ts turns a read error into an empty memory without checking the file is missing", () => {
    const src = fs.readFileSync(path.join(__dirname, "store.ts"), "utf8");
    expect(src).not.toMatch(/catch \{ return \{ \.\.\.EMPTY/);
    expect(src).toMatch(/ENOENT/);
  });
});

describe("RC-51 sweep: the Studio board file is kept aside too", () => {
  it("a half-written board.json is copied aside before saveBoard replaces it", async () => {
    vi.stubEnv("STUDIO_DIR", d);
    vi.resetModules();
    const { saveBoard, getBoard } = await import("@/lib/studio/store");
    const half = '[{"id":"p1","title":"kept pin"';
    fs.writeFileSync(path.join(d, "board.json"), half);
    saveBoard([]);
    expect(fs.readdirSync(d).filter((n) => n.startsWith("board.json.damaged-")).map((n) => fs.readFileSync(path.join(d, n), "utf8"))).toEqual([half]);
    expect(getBoard()).toEqual([]);
  });
});
