/**
 * v10, server: the day's entity lexicon (lexicon10.ts) from the store's news of the week and the district's lists.
 * The browser gets the small list (GET /api/collector/thunai/lexicon) for its lanes; the speech-to-text gets the day's keyterms (sarvam.ts).
 * Nothing leaves the machine here: the store is read locally.
 *
 * 27 Nov (the hosted copy's 7-8 s stalls when Jarvis opened, cause 2 of the report): the lexicon is never built on a request's path any more.
 *   - It is kept per data version (the hourly build's id: datakey.ts dataVersion), not per data epoch: a complaints reload, a news-desk sweep
 *     or a live reading moves the epoch every few minutes on the copy that does not save, and the news names do not change with them. Before
 *     this it was kept by the console's "now" (asOf), which moves every 30 s, so nearly every opening of Jarvis built it again.
 *   - lexiconNow answers at once with what is held, even from an older build, or null; a build for the current version starts in the
 *     background, its store reads behind the requests' own (inBackground) and the thread let go between slices (buildLexiconYielding).
 *   - The keep-warm builds it after the server starts and after each new build (keepwarm.ts "lexicon"), so it is ready before Jarvis opens.
 */
import { dataVersion } from "@/lib/collector/datakey";
import { inBackground } from "@/lib/util/background";
import type { World } from "../types";
import { storeStories } from "../v8/newsfind";
import { buildLexiconYielding, keytermsOf, type Entity10 } from "./lexicon10";

/** the outlets the store's reports come from, by their console names (news8.ts OUTLETS' names) */
const OUTLET_NAMES = ["The Hindu", "The Times of India", "The New Indian Express", "The Indian Express", "DT Next", "Deccan Chronicle", "ETV Bharat", "Daily Thanthi", "Thanthi TV",
  "Dinamani", "Dinamalar", "Dinakaran", "Maalaimalar", "Hindu Tamil Thisai", "Polimer News", "Puthiya Thalaimurai", "Makkal Kural", "News18", "NDTV", "BBC", "PTI", "News On AIR"];

/** a lexicon this old is built again in the background even when the data's version has not moved (a store whose build id stays) */
export const LEX_MAX_AGE_MS = 60 * 60_000;
/** the data's version is looked at again at most this often for a lexicon already held */
export const LEX_CHECK_MS = 30_000;

type LexWorld = Pick<World, "zones" | "places" | "taluks" | "depts"> & Partial<Pick<World, "bodies">>;
type Stories = () => Promise<{ id: string; title: string; titleEn?: string | null; t?: string | null }[]>;
interface Held { at: number; version: string; lex: Entity10[] }
interface LexState { held: Held | null; building: Promise<Entity10[]> | null; buildingFor: string | null; checkedAt: number }

declare global {
  // eslint-disable-next-line no-var
  var __jarvisLex10: LexState | undefined;
}
/** on globalThis: the lexicon route, the hear route and the keep-warm load their own copies of this module */
const L = (): LexState => (globalThis.__jarvisLex10 ??= { held: null, building: null, buildingFor: null, checkedAt: 0 });

/** One build for `version` (a build already running is shared), the store's reads queued behind the requests' own, the thread let go. */
function buildFor(version: string, world: LexWorld, stories?: Stories): Promise<Entity10[]> {
  const s = L();
  if (s.building && s.buildingFor === version) return s.building;
  // (27 Nov review) one build at a time: a build for another version waits for the one running. Two at once doubled the work on the
  // one core, and the older one, finishing last, put its lexicon back over the newer build's
  const before = s.building;
  const p = inBackground(async () => {
    if (before) await before.catch(() => undefined);
    const rows = await (stories ?? (() => storeStories(7)))().catch(() => []);
    const lex = await buildLexiconYielding(rows, world, { outlets: OUTLET_NAMES });
    s.held = { at: Date.now(), version, lex };
    return lex;
  });
  s.building = p;
  s.buildingFor = version;
  void p.catch((e) => console.warn(`[jarvis lexicon] not built: ${(e as Error)?.message?.slice(0, 160)}`)).finally(() => { if (s.building === p) { s.building = null; s.buildingFor = null; } });
  return p;
}

const stale = (h: Held | null, version: string, now = Date.now()): boolean => !h || h.version !== version || now - h.at > LEX_MAX_AGE_MS;

/**
 * The day's lexicon, waited for: the one held when it is for the data's version now, else a build (shared with one already running).
 * For the keep-warm, the live measures and dayKeyterms; a request answers with lexiconNow instead. `stories`: tests only.
 */
export async function dayLexicon(world: LexWorld, o: { stories?: Stories } = {}): Promise<Entity10[]> {
  const version = await dataVersion().catch(() => "");
  const h = L().held;
  if (!o.stories && !stale(h, version)) return h!.lex;
  return buildFor(version, world, o.stories);
}

/**
 * The lexicon held now, at once (even one from an older build), or null when none was built yet. A build for the data's version now is
 * started in the background when the held one is not for it (looked at most every LEX_CHECK_MS). Never waits for the store or the build.
 */
export function lexiconNow(world: LexWorld): Entity10[] | null {
  const s = L();
  const h = s.held;
  const now = Date.now();
  if (!s.building && (!h || now - s.checkedAt >= LEX_CHECK_MS)) {
    s.checkedAt = now;
    void dataVersion().catch(() => "").then((v) => { if (!L().building && stale(L().held, v)) return buildFor(v, world); }).catch(() => undefined);
  }
  return h?.lex ?? null;
}

/** The keep-warm's step: the lexicon for the data's version now, built when it is not held (false: it was held already). */
export async function warmLexicon(world: LexWorld): Promise<boolean> {
  const version = await dataVersion().catch(() => "");
  if (!stale(L().held, version)) return false;
  await buildFor(version, world);
  return true;
}

/** What the browser needs of it: storms and names in the news (places are already the browser's), each with its spellings and keys */
export const lexForBrowser = (lex: Entity10[]): Entity10[] => lex.filter((e) => e.kind === "storm" || e.kind === "name").slice(0, 400);

/** The day's keyterms for the speech-to-text (Sarvam): storms, names in the news, then what is on screen and the zones (lexicon10 keytermsOf) */
export async function dayKeyterms(world: Pick<World, "zones" | "places" | "taluks" | "depts">, o: { max?: number; onScreen?: Set<string>; extra?: string[] } = {}): Promise<string[]> {
  const lex = await dayLexicon(world).catch(() => [] as Entity10[]);
  return keytermsOf(lex, { max: o.max ?? 50, extra: [...(o.extra ?? []), ...world.zones.map((z) => z.name)], onScreen: o.onScreen });
}

/**
 * The day's keyterms without waiting: the lexicon held (lexiconNow), else null and a build started for the next turn. The hear route must
 * never wait on the store for a turn's words.
 */
export function dayKeytermsNow(world: Pick<World, "zones" | "places" | "taluks" | "depts">, o: { max?: number; extra?: string[] } = {}): string[] | null {
  const lex = lexiconNow(world);
  if (!lex) return null;
  return keytermsOf(lex, { max: o.max ?? 50, extra: [...(o.extra ?? []), ...world.zones.map((z) => z.name)] });
}
/** the day's storms' spellings (at most four), for Whisper's prompt: a storm's name is the one word Whisper never spells right unprompted */
export function dayStormsNow(): string[] {
  const lex = L().held?.lex;
  return lex ? lex.filter((e) => e.kind === "storm").flatMap((e) => e.spellings.filter((s) => /^[A-Za-z]+$/.test(s)).slice(0, 1)).slice(0, 4) : [];
}

/** tests only: forget the held lexicon */
export function resetLexicon(): void {
  globalThis.__jarvisLex10 = undefined;
}
