// QA pass 4, skeptic 2 (screens and safety): breaks found in the fixes after 7f7d537. Each bug still open is an it.fails whose name starts with its id.
//   Unit parts run alone. Live parts need the skeptic's own server (port 3216) and are skipped when it is not up:
//   node tests/qa/pass4/server.mjs start --port 3216 --frozen --ticking --instance skeptic2 --dist .next-sk2
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/skeptic-g2.test.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { login } from "./lib/access-lib.mjs";

const PORT = Number(process.env.SK2_PORT ?? 3216); // the skeptic's own port by default; a fixer runs it on the port of its own server
const base = `http://127.0.0.1:${PORT}`;
const up = await fetch(`${base}/login`).then((r) => r.status < 500).catch(() => false);

// ---------------------------------------------------------------- dataset write (RC-45, lane e, SK-E-7)
describe("SK2 dataset-write guard", () => {
  // The tracked folder is data/datasets. On Windows (and macOS) the same folder is also reached as DATA/Datasets, and the guard compares
  // the resolved path with a plain string, so the alias counts as "a folder of its own" and a dry-run server would write into the repo.
  it.skipIf(process.platform !== "win32")("SK2-1: DATASET_DIR spelled with other letter case still names the tracked data/datasets, so a dry-run server may not write there", async () => {
    const { datasetWriteAllowed } = await import("@/lib/dataset/target");
    const alias = path.join("DATA", "Datasets");
    expect(fs.realpathSync.native(path.resolve(alias))).toBe(fs.realpathSync.native(path.resolve("data/datasets"))); // the same folder on disk
    expect(datasetWriteAllowed({ DATASET_DIR: alias, AWS_STORE_DRY_RUN: "1", DATA_BACKEND: "aws" } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });
});

// ---------------------------------------------------------------- memory file (RC-51, lane e)
describe("SK2 memory file", () => {
  let d = "";
  beforeEach(() => { d = fs.mkdtempSync(path.join(os.tmpdir(), "sk2-")); vi.stubEnv("THUNAI_DIR", d); vi.spyOn(console, "error").mockImplementation(() => undefined); });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); fs.rmSync(d, { recursive: true, force: true }); });
  const f = () => path.join(d, "memory-7.json");

  // The strict read calls a file damaged when it is not an object. A file that is an object but holds the wrong kind of value in a field
  // ("notes": null, "notes": "text") is read as fine: the GET route hands the wrong type to the screen, and every write after it throws
  // (spread of null) or splits the text into letters (spread of a string), and the file is never kept aside.
  it("SK2-2: a notes file that is an object with a field of the wrong type is damaged, not fine", async () => {
    fs.writeFileSync(f(), JSON.stringify({ notes: null, reminders: "x" }));
    const { readMemoryStrict } = await import("@/lib/thunai/store");
    expect(() => readMemoryStrict(7)).toThrow();
  });
  it("SK2-3: a note added to a file whose notes field is text does not turn the text into one note per letter", async () => {
    fs.writeFileSync(f(), JSON.stringify({ notes: "abc" }));
    const { changeMemory } = await import("@/lib/thunai/store");
    let notes: unknown[] = [];
    try { notes = changeMemory(7, { op: "note", text: "new" }).notes; } catch { /* a refusal is fine too */ return; }
    expect(notes.length).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- step-up lockout (hunt-redsec2-1 re-run)
describe.skipIf(!up)("SK2 step-up lockout", () => {
  // The counter is per account and lasts 15 minutes, so a burst is shown only on an account with no wrong tries yet: the test tries the staff accounts
  // in turn and judges the first one whose burst got any 401. After all four are used, restart the server (a fresh counter) to see it again.
  it("SK2-4 (hunt-redsec2-1 re-run): 20 parallel wrong confirm passwords are not all checked against the password", async () => {
    let n401 = 0, tried = 0;
    for (const who of ["officerB", "officerC", "officerA", "collector"]) {
      const { cookie } = await login(base, who); tried++;
      const body = (code: string) => JSON.stringify({ step: "check", action: "export", scope: "a".repeat(32), method: "password", code });
      const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => fetch(`${base}/api/auth/confirm`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: body(`guess-${i}`) })));
      n401 = rs.filter((r) => r.status === 401).length;
      if (n401 > 0) break;
    }
    expect(n401, `accounts tried: ${tried}`).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------- dates (RC-16, lane f): a zone-less text is Chennai time on every machine
describe("SK2 parseWhen", () => {
  const zones = ["Asia/Kolkata", "UTC", "America/Los_Angeles", "Pacific/Auckland"];
  const inEveryZone = async (text: string) => {
    const { parseWhen } = await import("@/lib/collector/sourcemap");
    const saved = process.env.TZ; const seen: Record<string, string> = {};
    try { for (const z of zones) { process.env.TZ = z; const d = parseWhen(text); seen[z] = d ? d.toISOString() : "null"; } } finally { if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved; }
    return seen;
  };
  // "-2026" at the end of a day-month-year text looks like a zone offset (-20:26) to the check for a named zone, so the text is read in the server's own zone.
  it("SK2-6: '02-Oct-2026' is Chennai midnight on a server in any zone", async () => {
    const seen = await inEveryZone("02-Oct-2026");
    for (const z of zones) expect(seen[z], z).toBe("2026-10-01T18:30:00.000Z");
  });
  it("SK2-7: 'Oct-02-2026' is Chennai midnight on a server in any zone", async () => {
    const seen = await inEveryZone("Oct-02-2026");
    for (const z of zones) expect(seen[z], z).toBe("2026-10-01T18:30:00.000Z");
  });
  // IST is on the list of zones a text may name, but Date cannot read the word, so the date is lost (null) instead of read as Chennai time.
  it("SK2-8: a source date that ends in 'IST' is read, not dropped", async () => {
    const { parseWhen } = await import("@/lib/collector/sourcemap");
    expect(parseWhen("Oct 2, 2026 10:00 AM IST")?.toISOString()).toBe("2026-10-02T04:30:00.000Z");
    expect(parseWhen("2026-10-02 23:30 IST")?.toISOString()).toBe("2026-10-02T18:00:00.000Z");
  });
});

// ---------------------------------------------------------------- queue note (RC-47) and the "Confirm it's you" box: keys, Tamil, phone
describe.skipIf(!up)("SK2 screens on the real build (port 3216)", () => {
  const src = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  it("SK2-9: queue-note.ts writes a Tamil text for the citizen and the officer, and the screens never print it", () => {
    expect(src("src/components/officer/Cards.tsx")).toMatch(/awaitingNote\.ta/);
    expect(src("src/app/citizen/file-complaint/page.tsx")).toMatch(/queueNote\.ta/);
  });

  const withPage = async (who: "collector" | "officerA", lang: "en" | "ta", vp: { width: number; height: number }, run: (page: import("playwright").Page) => Promise<unknown>) => {
    const { launch, open } = await import("./visual-lib.mjs");
    const L = await launch(PORT);
    try { const { ctx, page } = await open(L, who, lang, "dark", vp); try { return await run(page); } finally { await ctx.close(); } } finally { await L.br.close(); }
  };
  const openBox = async (page: import("playwright").Page) => {
    await page.goto(base + "/collector", { waitUntil: "networkidle", timeout: 45000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    await page.keyboard.press("Tab");
    void page.evaluate(async () => (await fetch("/api/collector/export?period=daily")).status).catch(() => undefined);
    await page.locator('.cfm input[type="password"]').first().waitFor({ timeout: 10000 });
  };
  // The box says aria-modal, but Tab leaves it for the console behind it (the 12 Tab presses reach "Overview", "Briefing" ...).
  it("SK2-10: Tab stays inside the open \"Confirm it's you\" box", async () => {
    const outside = await withPage("collector", "en", { width: 1280, height: 800 }, async (page) => {
      await openBox(page);
      const out: string[] = [];
      for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); out.push(await page.evaluate(() => (document.activeElement?.closest(".cfm") ? "in" : "OUT:" + (document.activeElement?.textContent || "").trim().slice(0, 20)))); }
      return out.filter((x) => x !== "in");
    });
    expect(outside).toEqual([]);
  }, 60000);
  it("SK2-11: the box is in Tamil on a Tamil page (title, label and buttons)", async () => {
    const text = (await withPage("collector", "ta", { width: 360, height: 700 }, async (page) => { await openBox(page); return (await page.locator(".cfm").innerText()).replace(/\s+/g, " "); })) as string;
    expect(/[஀-௿]/.test(text.slice(0, 40)), text.slice(0, 40)).toBe(true);
    expect(text).not.toMatch(/\bConfirm\b/);
  }, 60000);
  it("SK2-12: the officer's queue note is in Tamil on a Tamil page", async () => {
    const t = (await withPage("officerA", "ta", { width: 360, height: 740 }, async (page) => {
      await page.route("**/api/officer/grievances**", async (route) => { const r = await route.fetch(); const j = await r.json(); j.awaiting = 3; j.awaitingNote = { en: "3 new complaints are filed with your department and will join this list at the next update.", ta: "உங்கள் துறைக்கு 3 புதிய புகார்கள் பதிவாகியுள்ளது; அடுத்த புதுப்பிப்பில் இந்தப் பட்டியலில் சேரும்." }; await route.fulfill({ response: r, json: j }); });
      await page.goto(base + "/officer", { waitUntil: "networkidle", timeout: 45000 }).catch(() => undefined);
      await page.locator("[data-key=work]").first().click({ timeout: 5000 });
      return page.locator('[data-testid="queue-awaiting"]').first().innerText({ timeout: 8000 });
    })) as string;
    expect(/[஀-௿]/.test(t), t).toBe(true);
  }, 60000);
});

// ---------------------------------------------------------------- accessibility (RC-49, the a11y commit b03acd7)
describe("SK2 accessibility", () => {
  // The commit rewrote src/components/a11y.pass4.test.ts and took out four class guards (PB-320 tablist buttons are tabs, PB-321 no foreign stylesheet or font,
  // PB-322 text colours reach 4.5:1 on every canvas colour, PB-323 a language switch names itself with the words it shows) without saying so in the commit.
  // All four still pass on HEAD (git show b03acd7^:<file> run as a file), so this is lost cover, not a bug in the app.
  it("SK2-13: the a11y class guards PB-320, PB-321, PB-322 and PB-323 are still in src/components/a11y.pass4.test.ts", () => {
    // the four guards were put back in their own file next to the rewritten one (a11y.guards.pass4.test.ts), so the rewritten file keeps its own tests
    const s = ["a11y.pass4.test.ts", "a11y.guards.pass4.test.ts"].map((n) => fs.readFileSync(path.join(process.cwd(), "src/components", n), "utf8")).join("\n");
    for (const id of ["PB-320", "PB-321", "PB-322", "PB-323"]) expect(s, id).toContain(`it("${id}`);
  });
  // The fixer's axe walk is the first view of each console. The other views of the officer console (Work, Daily, Weekly ...; the rows must be drawn first) have text under 3:1 (orange on a pale orange, 2.84:1)
  // and white on green at 4.13:1, in both themes, for all three departments.
  it.skipIf(!up)("SK2-14: axe finds no serious color-contrast violation on the officer console's Work view", async () => {
    const { default: AxeBuilder } = await import("@axe-core/playwright");
    const { launch, open } = await import("./visual-lib.mjs");
    const L = await launch(PORT);
    try {
      const { ctx, page } = await open(L, "officerA", "en", "light", { width: 1280, height: 800 });
      await page.goto(base + "/officer", { waitUntil: "networkidle", timeout: 45000 }).catch(() => undefined);
      await page.waitForTimeout(1500);
      await page.locator("[data-key=work]").first().click({ timeout: 5000 });
      await page.locator("table tbody tr").first().waitFor({ timeout: 15000 }); await page.waitForTimeout(2500);
      const r = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      await ctx.close();
      expect(r.violations.flatMap((v) => v.nodes.map((n) => n.target.join(" ").slice(0, 60)))).toEqual([]);
    } finally { await L.br.close(); }
  }, 60000);

  // The page for an address that does not exist (not in the fixer's list of pages) has no main landmark: axe landmark-one-main and region, moderate.
  it.skipIf(!up)("SK2-15: the 404 page puts its text in a main landmark", async () => {
    const r = await fetch(base + "/this-page-does-not-exist-xyz");
    const html = await r.text();
    expect(r.status).toBe(404);
    expect(html).toMatch(/<main[ >]/);
  });
  // The officer's case drawer at phone width: its scrolling body cannot be reached by keyboard (axe scrollable-region-focusable, serious, in all 3 departments, both languages and themes).
  it.skipIf(!up)("SK2-16: at 360 px the officer's case drawer body can be scrolled by keyboard", async () => {
    const { default: AxeBuilder } = await import("@axe-core/playwright");
    const { launch, open } = await import("./visual-lib.mjs");
    const L = await launch(PORT);
    try {
      const { ctx, page } = await open(L, "officerA", "en", "light", { width: 360, height: 740 });
      await page.goto(base + "/officer", { waitUntil: "networkidle", timeout: 45000 }).catch(() => undefined);
      await page.waitForTimeout(1500);
      await page.locator("[data-key=work]").first().click({ timeout: 5000 });
      await page.locator("table tbody tr, [data-row], .row, li[role=button]").first().waitFor({ timeout: 15000 });
      await page.locator("table tbody tr, [data-row], .row, li[role=button]").first().click({ timeout: 5000 });
      await page.waitForTimeout(2000);
      const r = await new AxeBuilder({ page }).withRules(["scrollable-region-focusable"]).analyze();
      await ctx.close();
      expect(r.violations.flatMap((v) => v.nodes.map((n) => n.target.join(" ")))).toEqual([]);
    } finally { await L.br.close(); }
  }, 60000);
});
