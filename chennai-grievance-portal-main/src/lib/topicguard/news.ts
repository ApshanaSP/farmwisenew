/**
 * Server only. Whether a question the guard would decline names a story in the last 7 days of district news: two of its own
 * words (or one long one) in a headline the search finds. "Who won the IPL?" names none and stays declined; "the stampede at
 * the cricket screening" names our story and is answered. (Moved here from assistant/pipeline.ts so the brain can use it too.)
 */
import { hybridSearch } from "@/lib/assistant/lance";
import { orNull } from "@/lib/fallback";

const NEWS_STOP = new Set(["what", "whats", "happening", "happened", "that", "this", "about", "tell", "there", "which", "where", "when", "with", "from",
  "have", "news", "today", "chennai", "please", "know", "going", "explain", "something", "anything", "event"]);

export async function inOurNews(message: string, now: string): Promise<boolean> {
  const words = message.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 4 && !NEWS_STOP.has(w));
  if (!words.length) return false;
  const since = Date.parse(now.replace(" ", "T") + "+05:30") / 1000 - 168 * 3600;
  const found = await hybridSearch("news", message, { since }, 5).catch(orNull("pipeline:inOurNews"));
  return !!found?.some((f) => {
    const title = String(f.rec.title ?? "").toLowerCase();
    const hits = words.filter((w) => title.includes(w));
    return hits.length >= 2 || hits.some((w) => w.length >= 8);
  });
}

/** inOurNews with a time limit: a slow search never holds a spoken answer (false when it runs out). */
export async function inOurNewsSoon(message: string, now: string, ms = 600): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      inOurNews(message, now).catch(() => false),
      new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), ms); })
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
