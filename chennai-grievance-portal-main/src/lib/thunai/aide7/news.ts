/**
 * v7: "tell me about this news" / "read the article", answered by the aide. The /news route (web/serve.ts) reads the stored article (or the
 * outlet's page) as v6 does; this writes the spoken answer from the article's own sentences, as facts of that outlet's (code never takes them as
 * true: "The Hindu reports that ..."), checked sentence by sentence like every aide answer, and streams the sentences as they pass. Server only.
 */
import type { StageDocT } from "../stage";
import type { Lang, World } from "../types";
import { buildSheet } from "./facts";
import type { AideExtras } from "./extras";
import { gazOf } from "./index";
import { writeAnswer, type WriteOptions } from "./writer";

export interface ArticleAsk {
  question: string;
  lang: Lang;
  outlet: string | null;
  outletTa: string | null;
  title: string;
  publishedAt: string | null;
  text: string;
  /** the code brief v6 would have said (the fallback) */
  fallback: string;
}
export type NewsAide = (a: ArticleAsk) => AsyncGenerator<string[]>;

/** A minimal screen for the article: its facts come from the extras (facts.ts), the screen note says the links are on screen. */
const articleDoc = (a: ArticleAsk): StageDocT => ({
  v: 1, id: `aide-news-${Date.now().toString(36)}`, recipe: "news", title: a.outlet ? `${a.outlet}'s report` : "The news report", takeaway: null, say: { en: a.fallback, ta: a.fallback },
  blocks: [{ kind: "Note", id: "src", text: "The report's link and the other outlets' links are on the screen." }],
  scope: { period: "daily", zone: null, dept: null, cat: null, taluk: null, sev: null }, slots: {}, sources: [], asOf: null, notes: [], lang: a.lang
});

/**
 * The aide for the news route: each yield is every sentence said so far (the route sends them as the article brief, and the browser speaks
 * only the new ones). The last yield is the whole answer; with nothing checked it is the code brief (v6's), as the fallback.
 */
export function newsAide(world: World, o: { user: string; signal?: AbortSignal; write?: Pick<WriteOptions, "open" | "rungs">; now?: () => number }): NewsAide {
  return async function* (a: ArticleAsk) {
    const now = o.now ?? Date.now;
    const t0 = now();
    const x: AideExtras = { article: { outlet: a.outlet, outletTa: a.outletTa, title: a.title, publishedAt: a.publishedAt, text: a.text } };
    const sheet = buildSheet(articleDoc(a), a.lang, gazOf(world), t0, x);
    const q: string[] = [];
    let wake: (() => void) | null = null, done = false;
    const p = writeAnswer({ question: a.question, lang: a.lang, sheet, note: "The screen shows the report's link and the other outlets' links.", fallback: a.fallback },
      { user: o.user, until: t0 + 9000, firstBy: t0 + 4000, signal: o.signal, onSentence: (s) => { q.push(s); wake?.(); }, ...(o.write ?? {}), now })
      .finally(() => { done = true; wake?.(); });
    const said: string[] = [];
    for (;;) {
      while (q.length) { said.push(q.shift() as string); yield [...said]; }
      if (done) break;
      await new Promise<void>((r) => { wake = r; });
      wake = null;
    }
    await p.catch(() => undefined);
  };
}

/** The other outlets that covered it, said in one line (their links are on the screen): code's, from the related items' outlet names */
export function coverageLine(outlets: { outlet: string; outletTa?: string | null }[], lang: Lang): string | null {
  const seen = new Set<string>();
  const list = outlets.filter((x) => x.outlet && !seen.has(x.outlet) && seen.add(x.outlet)).slice(0, 3);
  if (!list.length) return null;
  const names = list.map((x) => (lang === "ta" ? x.outletTa || x.outlet : x.outlet));
  const joined = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return lang === "ta" ? `${names.join(", ")} ஆகியவையும் இதை வெளியிட்டிருக்கின்றன; இணைப்புகள் திரையில் உள்ளன.` : `${joined} covered it too; their links are on the screen.`;
}
