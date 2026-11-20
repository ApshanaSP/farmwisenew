/**
 * v10, server: the day's entity lexicon (lexicon10.ts) from the store's news of the week and the district's lists, kept while the store's build
 * and the data epoch stay the same (a decision or a store write empties it, as every timed cache over the store: RC-35), at most ten minutes.
 * The browser gets the small list (GET /api/collector/thunai/lexicon) for its lanes; the speech-to-text gets the day's keyterms (sarvam.ts).
 * Nothing leaves the machine here: the store is read locally.
 */
import { syncEpoch } from "@/lib/collector/epoch";
import { asOf } from "@/lib/collector/intel";
import type { World } from "../types";
import { storeStories } from "../v8/newsfind";
import { buildLexicon, keytermsOf, type Entity10 } from "./lexicon10";

/** the outlets the store's reports come from, by their console names (news8.ts OUTLETS' names) */
const OUTLET_NAMES = ["The Hindu", "The Times of India", "The New Indian Express", "The Indian Express", "DT Next", "Deccan Chronicle", "ETV Bharat", "Daily Thanthi", "Thanthi TV",
  "Dinamani", "Dinamalar", "Dinakaran", "Maalaimalar", "Hindu Tamil Thisai", "Polimer News", "Puthiya Thalaimurai", "Makkal Kural", "News18", "NDTV", "BBC", "PTI", "News On AIR"];

const lexCache = { v: null as { at: number; asOf: string; lex: Entity10[] } | null, clear() { this.v = null; } };

/** The day's lexicon (cached per store build and data epoch, at most 10 minutes). */
export async function dayLexicon(world: Pick<World, "zones" | "places" | "taluks" | "depts"> & Partial<Pick<World, "bodies">>, o: { stories?: () => Promise<{ id: string; title: string; titleEn?: string | null; t?: string | null }[]> } = {}): Promise<Entity10[]> {
  const now = await asOf().catch(() => "");
  syncEpoch(lexCache);
  const c = lexCache.v;
  if (c && c.asOf === now && Date.now() - c.at < 600_000) return c.lex;
  const stories = await (o.stories ?? (() => storeStories(7)))().catch(() => []);
  const lex = buildLexicon(stories, world, { outlets: OUTLET_NAMES });
  lexCache.v = { at: Date.now(), asOf: now, lex };
  return lex;
}

/** What the browser needs of it: storms and names in the news (places are already the browser's), each with its spellings and keys */
export const lexForBrowser = (lex: Entity10[]): Entity10[] => lex.filter((e) => e.kind === "storm" || e.kind === "name").slice(0, 400);

/** The day's keyterms for the speech-to-text (Sarvam): storms, names in the news, then what is on screen and the zones (lexicon10 keytermsOf) */
export async function dayKeyterms(world: Pick<World, "zones" | "places" | "taluks" | "depts">, o: { max?: number; onScreen?: Set<string>; extra?: string[] } = {}): Promise<string[]> {
  const lex = await dayLexicon(world).catch(() => [] as Entity10[]);
  return keytermsOf(lex, { max: o.max ?? 50, extra: [...(o.extra ?? []), ...world.zones.map((z) => z.name)], onScreen: o.onScreen });
}

/**
 * The day's keyterms without waiting: the lexicon already built for this store build (the lexicon route builds it when Jarvis opens), else null
 * and a build started for the next turn. The hear route must never wait on the store for a turn's words.
 */
export function dayKeytermsNow(world: Pick<World, "zones" | "places" | "taluks" | "depts">, o: { max?: number; extra?: string[] } = {}): string[] | null {
  syncEpoch(lexCache);
  const c = lexCache.v;
  if (!c || Date.now() - c.at > 600_000) { void dayLexicon(world).catch(() => undefined); if (!c) return null; }
  return keytermsOf(c.lex, { max: o.max ?? 50, extra: [...(o.extra ?? []), ...world.zones.map((z) => z.name)] });
}
/** the day's storms' spellings (at most four), for Whisper's prompt: a storm's name is the one word Whisper never spells right unprompted */
export function dayStormsNow(): string[] {
  const c = lexCache.v;
  return c ? c.lex.filter((e) => e.kind === "storm").flatMap((e) => e.spellings.filter((s) => /^[A-Za-z]+$/.test(s)).slice(0, 1)).slice(0, 4) : [];
}
