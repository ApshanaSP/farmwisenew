/**
 * The route-then-fill router (v5 build, item A3 and grid cell G): character 3-5-gram TF-IDF cosine, in TypeScript, over the example
 * bank (bank/*.json), after normalise(). No package, no model. Pure once built.
 *
 * shortlist(text) gives the k recipes whose bank lines come closest (a recipe scores by its closest line) and the n closest bank
 * lines, least similar first and most similar last (the order a few-shot prompt should read them in). The bank holds commands only,
 * no figures; a recipe outside the shortlist is still in the schema's enum, and checkScreen still decides.
 */
import fs from "fs";
import path from "path";
import { normalise } from "./normalise";
import { RECIPES, type Recipe } from "./stage";

export type BankLang = "en" | "ta" | "tanglish";
export interface BankLine { recipe: Recipe; lang: BankLang; text: string; slots: Record<string, unknown> }
export interface Scored extends BankLine { sim: number }
export interface Shortlist { recipes: Recipe[]; examples: Scored[]; best: number }

const MIN_N = 3, MAX_N = 5;

/** the normalised text's character n-grams (3 to 5), with a space either side so word edges count */
export function grams(text: string): Map<string, number> {
  const t = ` ${normalise(text).text} `;
  const out = new Map<string, number>();
  for (let n = MIN_N; n <= MAX_N; n++) for (let i = 0; i + n <= t.length; i++) { const g = t.slice(i, i + n); out.set(g, (out.get(g) ?? 0) + 1); }
  return out;
}

export class Shortlister {
  private readonly idf = new Map<string, number>();
  private readonly vecs: { line: BankLine; v: Map<string, number>; norm: number }[] = [];

  constructor(lines: BankLine[]) {
    const docs = lines.map((l) => grams(l.text));
    const df = new Map<string, number>();
    for (const d of docs) for (const g of d.keys()) df.set(g, (df.get(g) ?? 0) + 1);
    const N = Math.max(1, docs.length);
    for (const [g, n] of df) this.idf.set(g, Math.log((N + 1) / (n + 1)) + 1);
    lines.forEach((line, i) => { const v = this.weigh(docs[i]); this.vecs.push({ line, v, norm: Math.hypot(...v.values()) || 1 }); });
  }

  private weigh(tf: Map<string, number>): Map<string, number> {
    const v = new Map<string, number>();
    // an n-gram the bank never saw carries no weight: it cannot make two sentences alike
    for (const [g, n] of tf) { const w = this.idf.get(g); if (w) v.set(g, (1 + Math.log(n)) * w); }
    return v;
  }

  /** cosine of the sentence against every bank line */
  scores(text: string): Scored[] {
    const q = this.weigh(grams(text));
    const qn = Math.hypot(...q.values()) || 1;
    return this.vecs.map(({ line, v, norm }) => {
      let dot = 0;
      for (const [g, w] of q) { const x = v.get(g); if (x) dot += w * x; }
      return { ...line, sim: dot / (qn * norm) };
    });
  }

  shortlist(text: string, k = 5, n = 8): Shortlist {
    const all = this.scores(text);
    const byRecipe = new Map<Recipe, number>();
    for (const s of all) byRecipe.set(s.recipe, Math.max(byRecipe.get(s.recipe) ?? 0, s.sim));
    const recipes = [...byRecipe.entries()].sort((a, b) => b[1] - a[1] || RECIPES.indexOf(a[0]) - RECIPES.indexOf(b[0])).slice(0, k).map(([r]) => r);
    const top = [...all].sort((a, b) => b.sim - a.sim).slice(0, n);
    return { recipes, examples: top.reverse(), best: top.length ? top[top.length - 1].sim : 0 };
  }
}

/** The bank's lines, from bank/en.json, ta.json and tanglish.json (server only; read at call time). */
export function bankLines(dir = path.join(process.cwd(), "src", "lib", "thunai", "bank")): BankLine[] {
  const out: BankLine[] = [];
  for (const lang of ["en", "ta", "tanglish"] as const) {
    const f = path.join(dir, `${lang}.json`);
    if (!fs.existsSync(f)) continue;
    for (const x of JSON.parse(fs.readFileSync(f, "utf8")) as { recipe: Recipe; text: string; slots: Record<string, unknown> }[]) out.push({ ...x, lang });
  }
  return out;
}
