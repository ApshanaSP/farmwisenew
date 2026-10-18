/**
 * Comparing places side by side ("compare Velachery and Adyar for flooding", "Royapuram vs Tondiarpet", "Zone 5 vs Zone 9
 * this month"): the sides split from the question, each resolved on the district's gazetteer, and each counted with the
 * same filters (topic, period, department). A side that is not a place in Chennai district (Tambaram, Avadi, another
 * district) is said plainly, never quietly dropped. No model: the numbers and the words come from the store.
 */
import { resolvePlace } from "@/lib/collector/nlp";
import { orNull } from "@/lib/fallback";

export interface Side { asked: string; place: string | null; zone: number | null; locality: string | null; outside: boolean }

/** Where a comparison's sides end: the topic or period after them ("for flooding", "this month", "in terms of open cases"). */
const TAIL = /\s+(?:for|on|about|regarding|in terms of|over|during|in the last|last|this|today|yesterday|since|by|with respect to|wrt)\b.*$/i;

/** The sides of "compare A and B", "A vs B", "A versus B, C": up to 3, or null when the message compares no places. */
export function sidesOf(message: string): string[] | null {
  const m = message.replace(/[?.!]+$/, "").trim();
  let body: string | null = null;
  const a = m.match(/\bcompare\s+(.+)$/i) ?? m.match(/\bcomparison (?:of|between)\s+(.+)$/i) ?? m.match(/\bdifference between\s+(.+)$/i);
  if (a) body = a[1];
  else if (/\b(vs\.?|versus)\b/i.test(m)) body = m.replace(/^.*?\b(?:how (?:does|do|is|are)|which is worse|which is better|what about)\b\s*/i, "")
    // "give me numbers for Zone 9 vs Zone 10 vs Zone 13": the request words before the sides are not a side
    .replace(/^\s*(?:(?:please\s+)?(?:give|show|get|tell)(?:\s+me)?|what are)?\s*(?:the\s+)?(?:numbers?|figures?|stats?|statistics|data|counts?|details?|situation|status)\s+(?:for|of|in|on)\s+/i, "");
  // "how many open complaints does Anna Nagar have compared to Teynampet": the place before "compared to" and the one after it
  // (not "compared to last month", which is a period against the one before)
  const cmp = !body ? m.match(/^(.*?)\s+compared\s+(?:to|with)\s+(.+)$/i) : null;
  if (cmp && !/^(the\s+)?(last|previous|prior|this|past)\b/i.test(cmp[2])) {
    const left = cmp[1].replace(/^.*\b(?:does|do|is|are|has|in|for|of|at)\s+/i, "").replace(/\s+(?:have|has|had|got|is|are)$/i, "").trim();
    if (left && left.split(/\s+/).length <= 4) body = `${left} and ${cmp[2]}`;
  }
  if (!body) return null;
  const parts = body.replace(TAIL, "").split(/\s*(?:,|\band\b|\bvs\.?\b|\bversus\b|\bwith\b|\bto\b|&)\s*/i).map((s) => s.replace(/\b(zone|area|the)\b/gi, (w) => (/zone/i.test(w) ? w : "")).trim()).filter((s) => s.length >= 2);
  return parts.length >= 2 ? parts.slice(0, 3) : null;
}

/** Each side on the gazetteer: a zone, a locality inside a zone, or outside the district. */
export async function resolveSides(sides: string[]): Promise<Side[]> {
  return Promise.all(sides.map(async (asked) => {
    const zoneNo = asked.match(/\bzone\s*-?\s*(\d{1,2})\b/i)?.[1];
    if (zoneNo && Number(zoneNo) >= 1 && Number(zoneNo) <= 15) return { asked, place: `Zone ${zoneNo}`, zone: Number(zoneNo), locality: null, outside: false };
    const p = await resolvePlace(asked).catch(orNull("compare:31"));
    if (!p || p.zone == null) return { asked, place: p?.place ?? null, zone: null, locality: null, outside: true };
    // a locality narrower than its zone ("Velachery" in Adyar zone) is matched on the incident's place
    return { asked, place: p.place, zone: Number(p.zone), locality: p.ward ? p.place : null, outside: false };
  }));
}
