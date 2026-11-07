/**
 * QA pass 4, RC-21 class guard: a saved sign-in is not kept for ever. Every file kind the Studio store documents has a way out: the
 * dataset's delete removes it, or the sweep of what never became a dataset does. And what a picker saved under its token goes with
 * the dataset made from it.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-rc21-"));
vi.stubEnv("STUDIO_DIR", dir);

describe("RC-21: nothing the Studio saves about a sign-in outlives its use", () => {
  it("every file kind in the store's header is removed by deleteDataset or the sweep", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/studio/store.ts"), "utf8");
    const header = src.slice(0, src.indexOf("*/"));
    const exts = [...header.matchAll(/<id>(\.[a-z.]+)/g)].map((m) => m[1]);
    const del = src.slice(src.indexOf("export function deleteDataset"), src.indexOf("The sha256 of a dataset"));
    expect(exts.length).toBeGreaterThan(5);
    // the sweep removes any file of an id with no dataset; the board and a dataset's own files are the delete's
    for (const e of exts) if (e !== ".json") expect(del.includes(`"${e}"`), `${e} is not removed by deleteDataset`).toBe(true);
  });
  it("dropVault has a caller", () => {
    const hits = fs.readdirSync(path.join(process.cwd(), "src/lib/studio"), { recursive: true }).map(String).filter((f) => /\.ts$/.test(f) && !/test/.test(f))
      .filter((f) => /\bdropVault\(/.test(fs.readFileSync(path.join(process.cwd(), "src/lib/studio", f), "utf8")) && !/vault\.ts$/.test(f));
    expect(hits.length).toBeGreaterThan(0);
  });
  it("the sweep removes a token's list and sign-in that nobody used, and keeps a real dataset's files", async () => {
    vi.resetModules();
    const store = await import("@/lib/studio/store");
    const old = path.join(dir, "ds_old000001.auth"), live = path.join(dir, "ds_live00001.auth");
    fs.writeFileSync(old, "x"); fs.writeFileSync(live, "x"); fs.writeFileSync(path.join(dir, "ds_live00001.json"), "{}");
    const past = new Date(Date.now() - 3 * 24 * 3600_000);
    fs.utimesSync(old, past, past); fs.utimesSync(live, past, past);
    expect(store.sweepUnkept(24 * 3600_000, Date.now())).toBe(1);
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(live)).toBe(true);
  });
  it("deleting a dataset made from a picker removes the picker's list and sign-in", async () => {
    vi.resetModules();
    const store = await import("@/lib/studio/store");
    for (const e of [".pick.json.gz", ".auth"]) fs.writeFileSync(path.join(dir, `ds_tok000001${e}`), "x");
    fs.writeFileSync(path.join(dir, "ds_made00001.json"), "{}");
    store.notePickOf("ds_made00001", "ds_tok000001");
    store.deleteDataset("ds_made00001");
    expect(fs.readdirSync(dir).filter((f) => f.startsWith("ds_tok000001"))).toEqual([]);
  });
});
