/**
 * Builds the example bank (src/lib/thunai/bank/{en,ta,tanglish}.json) from the drafter's lines (v5 build, 6.5), filtered in code:
 * the recipe is in the enum; every slot it names survives checkScreen unchanged; no digit in the text; no duplicate (normalised); and
 * no line close to a tuning sentence (normalised text equal, or a 3-5-gram cosine of 0.8 or more). Commands only; no figures.
 *   BANK_DRAFT=<draft.jsonl> npx vitest run --config vitest.live.config.ts src/lib/thunai/grid/bankbuild.live.ts
 * Prints counts only.
 */
import fs from "fs";
import path from "path";
import { expect, it } from "vitest";
import { checkScreen } from "../agent";
import { WORLD } from "../fixture";
import { ZONE_TA_NAME } from "../lexicon";
import { normalise } from "../normalise";
import { Shortlister, type BankLine } from "../shortlist";
import { RECIPES, type Recipe } from "../stage";
import { referenceWorld } from "../world";

const world = { ...WORLD, ...referenceWorld(), zones: WORLD.zones.map((z) => ({ ...z, ta: ZONE_TA_NAME[z.n] ?? null })), depts: WORLD.depts };
const same = (a: unknown, b: unknown): boolean => (Array.isArray(a) || Array.isArray(b) ? JSON.stringify([...(a as unknown[] ?? [])].map(String).sort()) === JSON.stringify([...(b as unknown[] ?? [])].map(String).sort()) : String(a) === String(b));

/** a drafted line kept as it is, or the reason it is dropped */
export function bankCheck(x: { recipe?: unknown; lang?: unknown; text?: unknown; slots?: unknown }): string | null {
  if (typeof x.text !== "string" || !x.text.trim()) return "shape";
  if (!["en", "ta", "tanglish"].includes(String(x.lang))) return "lang";
  if (!(RECIPES as readonly string[]).includes(String(x.recipe))) return "recipe";
  if (/\p{Nd}/u.test(x.text)) return "digit";
  const slots = (x.slots && typeof x.slots === "object" ? x.slots : {}) as Record<string, unknown>;
  const checked = checkScreen({ recipe: x.recipe, ...slots }, world, null);
  if (!checked || checked.recipe !== x.recipe) return "checkScreen";
  for (const [k, v] of Object.entries(slots)) {
    if (v == null || (Array.isArray(v) && !v.length)) continue;
    if (!same((checked.slots as Record<string, unknown>)[k], v)) return "slots";
  }
  return null;
}

it.runIf(!!process.env.BANK_DRAFT)("the bank, filtered in code", () => {
  const draft = fs.readFileSync(process.env.BANK_DRAFT as string, "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return {}; } }) as Record<string, unknown>[];
  const tuning = fs.readFileSync(path.join(process.cwd(), "eval", "holdout", "tuning24.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { text: string; lang: string });
  const near = new Shortlister(tuning.map((t) => ({ recipe: "cases" as Recipe, lang: t.lang as BankLine["lang"], text: t.text, slots: {} })));
  const tuneNorm = new Set(tuning.map((t) => normalise(t.text).text));
  const dropped: Record<string, number> = {};
  const seen = new Set<string>();
  const kept: BankLine[] = [];
  for (const x of draft) {
    let why = bankCheck(x);
    const n = typeof x.text === "string" ? normalise(x.text).text : "";
    if (!why && seen.has(n)) why = "duplicate";
    if (!why && (tuneNorm.has(n) || Math.max(0, ...near.scores(x.text as string).map((s) => s.sim)) >= 0.8)) why = "near-tuning";
    if (why) { dropped[why] = (dropped[why] ?? 0) + 1; continue; }
    seen.add(n);
    const slots = Object.fromEntries(Object.entries((x.slots ?? {}) as Record<string, unknown>).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length)));
    kept.push({ recipe: x.recipe as Recipe, lang: x.lang as BankLine["lang"], text: (x.text as string).trim(), slots });
  }
  const dir = path.join(process.cwd(), "src", "lib", "thunai", "bank");
  fs.mkdirSync(dir, { recursive: true });
  for (const lang of ["en", "ta", "tanglish"] as const) {
    const rows = kept.filter((k) => k.lang === lang).sort((a, b) => RECIPES.indexOf(a.recipe) - RECIPES.indexOf(b.recipe)).map(({ recipe, text, slots }) => ({ recipe, text, slots }));
    fs.writeFileSync(path.join(dir, `${lang}.json`), JSON.stringify(rows, null, 1) + "\n");
  }
  const per = Object.fromEntries(RECIPES.map((r) => [r, ["en", "ta", "tanglish"].map((l) => kept.filter((k) => k.recipe === r && k.lang === l).length).join("/")]));
  console.log(JSON.stringify({ drafted: draft.length, kept: kept.length, dropped, perRecipe: per }));
  expect(kept.length).toBeGreaterThan(0);
});
