/**
 * v10, server: a story's meaning against the request's, across languages (docs/jarvis/JARVIS_V10.md 4.2, "Cross-lingual meaning"): the same local
 * multilingual model the console's incident search uses (multilingual-e5-base through transformers.js, src/lib/assistant/embed.ts, on its own
 * worker thread), so a Tamil request finds an English headline by what it means. A SECOND ranker only: newsfind.ts asks it when the lexical
 * matcher (news8.ts) has nothing above its floor, and takes its pick only under the lexical guards (an absolute floor, a margin over the next
 * story, the district place veto, and some word of the request in the story by sound or by gloss, unless the request is in Tamil letters).
 *
 * Nothing leaves the machine. A headline's vector is kept by its id and words (the week's stories come back request after request). The model
 * still loading (a first start) is no wait: the request goes on without it.
 */
import { embed, ModelNotReady } from "@/lib/assistant/embed";
import type { StoryItem } from "../v8/news8";

const vecs = new Map<string, Float32Array>();
const keyOf = (x: StoryItem) => `${x.id}|${x.title}|${x.titleEn ?? ""}`;
const passage = (x: StoryItem) => `passage: ${[x.title, x.titleEn].filter(Boolean).join(" | ")}`.slice(0, 600);

const dot = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** Each candidate's cosine with the request (0..1), or null when the model cannot answer now (still loading, failed). */
export async function semScores(q: string, items: StoryItem[], o: { max?: number } = {}): Promise<Map<string, number> | null> {
  const list = items.slice(0, o.max ?? 400);
  if (!list.length || !q.trim()) return new Map();
  try {
    const missing = list.filter((x) => !vecs.has(keyOf(x)));
    for (let i = 0; i < missing.length; i += 32) {
      const part = missing.slice(i, i + 32);
      const { vecs: v, dim } = await embed(part.map(passage), { quick: true });
      part.forEach((x, j) => vecs.set(keyOf(x), v.slice(j * dim, (j + 1) * dim)));
    }
    if (vecs.size > 20_000) vecs.clear();
    const { vecs: qv } = await embed([`query: ${q.slice(0, 400)}`], { quick: true });
    const out = new Map<string, number>();
    for (const x of list) { const v = vecs.get(keyOf(x)); if (v) out.set(x.id, dot(qv, v)); }
    return out;
  } catch (e) {
    if (e instanceof ModelNotReady) return null;
    return null;
  }
}
