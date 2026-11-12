// QA pass 6, hunter pass4-open: pass 4's open items that are decided by the source on this tree (no data, no server).
//   npx vitest run --config vitest.p6probe.config.ts tests/qa/pass6/probes/pass4-open/static.test.ts
// Each describe names the pass 4 row. A guard copied from a pass 4 unit test (which cannot run here: the default config is off limits) is marked "copy of".
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP = process.cwd();
const SRC = path.join(APP, "src");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8");
const exists = (p: string) => fs.existsSync(path.join(SRC, p));
const all = (d: string, re: RegExp, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") all(p, re, out); } else if (re.test(e.name)) out.push(p);
  }
  return out;
};
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");
const prodFiles = all(SRC, /\.(ts|tsx)$/).filter((f) => !/\.(test|spec)\.tsx?$/.test(f));

// ---------------------------------------------------------------- the citizen date bug on two pages (RC-16 sweep: track-complaints/page.tsx:38, ComplaintTypeSelector.tsx:284)
describe("citizen date bug on two pages (RC-16 handed-on lines)", () => {
  it("the track page prints its dates with the Chennai helper", () => {
    const s = read("app/citizen/track-complaints/page.tsx");
    expect(s).toMatch(/import \{ istDate \} from "@\/lib\/ist-dates"/);
    expect(s).not.toMatch(/toLocaleDateString\(\s*"en-IN"\s*\)/);
  });
  it("the complaint-type source note prints its date with the Chennai helper", () => {
    const s = read("components/ComplaintTypeSelector.tsx");
    expect(s).toMatch(/istDate\(source\.fetchedAt\)/);
  });
  it("istDate prints the Chennai day on a UTC process, for an instant after 18:30 UTC", async () => {
    const old = process.env.TZ;
    process.env.TZ = "UTC";
    try {
      const { istDate } = await import("@/lib/ist-dates");
      expect(new Date("2026-11-06T20:00:00Z").getDate()).toBe(6); // the process really is in UTC
      expect(istDate("2026-11-06T20:00:00Z")).toBe("7 Nov 2026");
    } finally { process.env.TZ = old; }
  });
  // copy of src/lib/ist-dates.pass4.test.ts "no toLocale... call leaves the zone out", over every production file of this tree (main's Manu Desk included)
  it("class: no date print in src leaves the time zone out (copy of the RC-16 guard)", () => {
    const args = (src: string, open: number) => { let d = 0; for (let i = open; i < src.length; i++) { if (src[i] === "(") d++; else if (src[i] === ")" && --d === 0) return src.slice(open + 1, i); } return src.slice(open + 1); };
    const DATE_KEYS = /\b(day|month|year|hour|minute|second|weekday|dateStyle|timeStyle)\s*:/;
    const bad: string[] = [];
    for (const f of prodFiles) {
      const src = fs.readFileSync(f, "utf8");
      const re = /\.(toLocaleDateString|toLocaleTimeString|toLocaleString)\s*\(|Intl\.DateTimeFormat\s*\(/g;
      for (let m: RegExpExecArray | null; (m = re.exec(src)); ) {
        const a = args(src, m.index + m[0].length - 1);
        const kind = m[1] ?? "Intl.DateTimeFormat";
        if (kind === "toLocaleString" && !DATE_KEYS.test(a)) continue;
        if (/\btimeZone\b/.test(a)) continue;
        const spread = [...a.matchAll(/\.\.\.(\w+)/g)].map((x) => x[1]);
        const carries = (n: string) => new RegExp(String.raw`\b${n}\b[^=;]*=[^;]*timeZone`).test(src) || new RegExp(String.raw`import\s*\{[^}]*\b${n}\b[^}]*\}\s*from\s*"@/lib/ist-dates"`).test(src);
        if (spread.some(carries)) continue;
        bad.push(`${rel(f)}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

// ---------------------------------------------------------------- RC-46 (PB-301, PB-313, PB-318, PB-319, PB-328): copy of src/components/layout.pass4.test.ts
describe("RC-46 source rules (copy of layout.pass4.test.ts)", () => {
  const walk = (d: string, out: string[] = []) => { if (!exists(d)) return out; for (const e of fs.readdirSync(path.join(SRC, d), { withFileTypes: true })) { const r = path.posix.join(d, e.name); if (e.isDirectory()) walk(r, out); else if (/\.tsx$/.test(e.name)) out.push(r); } return out; };
  const gridBad = (files: string[]) => {
    const bad: string[] = [];
    for (const f of files) {
      const src = read(f);
      for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const c = m[1] ?? m[2] ?? "";
        if (!/(^|\s)grid(\s|$)/.test(c) || !/(sm|md|lg|xl):grid-cols-/.test(c)) continue;
        const base = c.split(/\s+/).find((t) => /^grid-cols-/.test(t));
        const ok = base && (/^grid-cols-\d+$/.test(base) || base.startsWith("grid-cols-[minmax(0,"));
        if (!ok) bad.push(`${f}:${src.slice(0, m.index).split("\n").length}  ${c.slice(0, 80)}`);
      }
    }
    return bad;
  };
  it("citizen pages: every breakpoint grid has a base column that may shrink", () => {
    expect(gridBad([...walk("app/citizen"), ...walk("app/profile"), ...walk("components/citizen"), "components/ComplaintTypeSelector.tsx", "components/AuthShell.tsx"])).toEqual([]);
  });
  it("the top bar, bottom bar and footer change at one width", () => {
    const h = read("components/Header.tsx"), f = read("components/Footer.tsx");
    const top = h.match(/p-1 (\w+):flex"/)?.[1], bottom = h.match(/backdrop-blur-xl (\w+):hidden"/)?.[1], foot = f.match(/mb-16 (\w+):mb-0/)?.[1];
    expect(top).toBeTruthy(); expect(bottom).toBe(top); expect(foot).toBe(top);
  });
  it("the alert details close on an outside press and on Escape", () => {
    const s = read("components/collector/app/AlertBar.tsx");
    expect(s).toMatch(/addEventListener\("pointerdown"/); expect(s).toMatch(/e\.key === "Escape"/);
  });
  it("the segmented control re-measures its pill", () => {
    const s = read("components/ui/index.tsx");
    expect(s).toMatch(/new MutationObserver/); expect(s).toMatch(/querySelectorAll\("\[data-key\]"\)/);
  });
  it("Ask District IQ's floating button clears the bottom bar (76 px)", () => {
    const dir = path.join(SRC, "components/collector/app");
    const bad: string[] = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".css"))) {
      const css = fs.readFileSync(path.join(dir, f), "utf8");
      for (const m of css.matchAll(/([^{}]*:not\(\.fit\)[^{}]*\.ask-fab[^{}]*)\{([^}]*)\}/g)) { const b = m[2].match(/(?:^|;)\s*bottom:\s*([^;]+)/)?.[1]; if (b && !/76px/.test(b)) bad.push(`${f}: ${m[1].trim()} { bottom: ${b} }`); }
    }
    expect(bad).toEqual([]);
  });
});

// ---------------------------------------------------------------- RC-15 rows whose wording sits in the source
describe("RC-15 wording in the source", () => {
  it("PB-302 class: no screen reason says 'Severe severity' (the Collector's My Tasks 'With you because' list)", () => {
    const hits = prodFiles.flatMap((f) => fs.readFileSync(f, "utf8").split("\n").map((l, i) => (/["'`]Severe severity/.test(l) ? `${rel(f)}:${i + 1}` : null)).filter(Boolean));
    expect(hits).toEqual([]);
  });
  it("PB-299: a status 'Open' has a Tamil status word, not the button word திற", async () => {
    const ta: any = await import("@/lib/i18n/ta");
    const ctx = ta.TA_CTX ?? {};
    expect(ctx.status?.Open ?? ctx.status?.open, JSON.stringify(Object.keys(ctx))).toBeTruthy();
    expect(ctx.status?.Open ?? ctx.status?.open).not.toBe("திற");
  });
});

// ---------------------------------------------------------------- RC-37 (PB-218, PB-251, PB-252, PB-254)
describe("RC-37 tooling and dead code", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  it("PB-251: there is an ESLint config, so npm run lint does not stop at a prompt", () => {
    expect([".eslintrc.json", ".eslintrc.js", ".eslintrc.cjs", "eslint.config.mjs", "eslint.config.js"].some((f) => fs.existsSync(path.join(APP, f)))).toBe(true);
  });
  it("PB-252: the dead AuthHeroPanel file is gone", () => expect(exists("components/AuthHeroPanel.tsx")).toBe(false));
  it("PB-254: animejs is not a dependency; jiti, fast-png, fflate (used by scripts) are", () => {
    expect(deps.animejs).toBeUndefined();
    for (const d of ["jiti", "fast-png", "fflate"]) expect(deps[d], d).toBeTruthy();
  });
  it("PB-218: a status change reaches the dataset files (appendStatusChangeToDataset has a production caller)", () => {
    const callers = prodFiles.filter((f) => !f.endsWith(path.join("dataset", "append.ts")) && /\bappendStatusChangeToDataset\b/.test(fs.readFileSync(f, "utf8"))).map(rel);
    expect(callers.length, "no production file calls appendStatusChangeToDataset").toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- RC-36 (static reading only: the unit suite may not be run under rule 3)
describe("RC-36 test hygiene, read from the files", () => {
  it("PB-332: data-testid=\"state\" is used once", () => {
    const hits = prodFiles.filter((f) => /data-testid="state"/.test(fs.readFileSync(f, "utf8"))).map(rel);
    expect(hits.length, hits.join(", ")).toBeLessThanOrEqual(1);
  });
  it("PB-182: briefturn.test.ts has no wall-clock p95 limit", () => {
    expect(read("lib/thunai/briefturn.test.ts")).not.toMatch(/p95[^\n]*toBeLessThan|toBeLessThan\([^)]*\)[^\n]*p95/);
  });
  it("PB-189..PB-192: stt.test.ts resets the shared ledger between tests", () => {
    expect(read("lib/thunai/stt.test.ts")).toMatch(/beforeEach\([^)]*\)|beforeEach\(/);
  });
  it("PB-194, PB-195: the photo and sources route tests empty their mocks before each test", () => {
    expect(read("app/api/profile/photo/route.test.ts")).toMatch(/beforeEach/);
    expect(read("app/api/collector/sources/[id]/route.test.ts")).toMatch(/beforeEach/);
  });
  it("PB-183..PB-188: connectors.test.ts does not share one connector made in the first test", () => {
    expect(read("lib/studio/connectors.test.ts")).toMatch(/beforeEach|function fresh|const make/);
  });
});

// ---------------------------------------------------------------- PB-314 (RC-38) and an RC-43 sibling, read from the code
describe("PB-314 and RC-43 siblings, read from the code", () => {
  it("PB-314: the officer search looks at the complaint numbers of an incident (events.source_record_id or complaint_code)", () => {
    const s = read("lib/officer/data.ts");
    const clause = s.match(/if \(f\.q\) \{[\s\S]{0,600}?\n  \}/)?.[0] ?? "";
    expect(clause).toMatch(/source_record_id|complaint_code/);
  });
  it("RC-43 class: every route that reads ?period= refuses an unknown one (collector/conflicts reads parsePeriod with no refusal)", () => {
    const files = all(path.join(SRC, "app", "api"), /^route\.ts$/);
    const loose = files.filter((f) => { const s = fs.readFileSync(f, "utf8"); return /get\("(period|zone|taluk|tab)"\)/.test(s) && !/refuseBad(Filter|Tab)\(/.test(s); }).map(rel);
    expect(loose).toEqual([]);
  });
});

// ---------------------------------------------------------------- PB-316 (RC-48)
describe("PB-316: a guarded action asks for the password without a 428 in the console", () => {
  it("the server answers a soft confirm (200 + header) when the console says it reads one", () => {
    const s = read("lib/security/stepup.ts");
    expect(s).toMatch(/SOFT_HEADER\) === "json"/);
    expect(s).toMatch(/status: 200, headers: \{ \[SOFT_ANSWER\]: "required"/);
  });
  it("every console that sends a guarded request mounts the confirm host that sends the header", () => {
    expect(read("components/collector/app/CollectorApp.tsx")).toMatch(/ConfirmHost/);
    expect(read("components/officer/OfficerApp.tsx")).toMatch(/ConfirmHost/);
  });
});
