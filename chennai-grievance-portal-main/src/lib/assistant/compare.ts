/**
 * Comparing places side by side ("compare Velachery and Adyar for flooding", "Royapuram vs Tondiarpet", "Zone 5 vs Zone 9
 * this month"): the sides split from the question, each resolved on the district's gazetteer, and each counted with the
 * same filters (topic, period, department). A side that is not a place in Chennai district (Tambaram, Avadi, another
 * district) is said plainly, never quietly dropped. No model: the numbers and the words come from the store.
 */
import { resolvePlace } from "@/lib/collector/nlp";

export interface Side { asked: string; place: string | null; zone: number | null; locality: string | null; outside: boolean }

/** Where a comparison's sides end: the topic or period after them ("for flooding", "this month", "in terms of open cases"). */
const TAIL = /\s+(?:for|on|about|regarding|in terms of|over|during|in the last|last|this|today|yesterday|since|by|with respect to|wrt)\b.*$/i;

/** The sides of "compare A and B", "A vs B", "A versus B, C": up to 3, or null when the message compares no places. */
export function sidesOf(message: string): string[] | null {
  const m = message.replace(/[?.!]+$/, "").trim();
  let body: string | null = null;
  const a = m.match(/\bcompare\s+(.+)$/i) ?? m.match(/\bcomparison (?:of|between)\s+(.+)$/i) ?? m.match(/\bdifference between\s+(.+)$/i);
  if (a) body = a[1];
  else if (/\b(vs\.?|versus)\b/i.test(m)) body = m.replace(/^.*?\b(?:how (?:does|do|is|are)|which is worse|which is better|what about)\b\s*/i, "");
  if (!body) return null;
  const parts = body.replace(TAIL, "").split(/\s*(?:,|\band\b|\bvs\.?\b|\bversus\b|\bwith\b|\bto\b|&)\s*/i).map((s) => s.replace(/\b(zone|area|the)\b/gi, (w) => (/zone/i.test(w) ? w : "")).trim()).filter((s) => s.length >= 2);
  return parts.length >= 2 ? parts.slice(0, 3) : null;
}

/** Each side on the gazetteer: a zone, a locality inside a zone, or outside the district. */
export async function resolveSides(sides: string[]): Promise<Side[]> {
  return Promise.all(sides.map(async (asked) => {
    const zoneNo = asked.match(/\bzone\s*-?\s*(\d{1,2})\b/i)?.[1];
    if (zoneNo && Number(zoneNo) >= 1 && Number(zoneNo) <= 15) return { asked, place: `Zone ${zoneNo}`, zone: Number(zoneNo), locality: null, outside: false };
    const p = await resolvePlace(asked).catch(() => null);
    if (!p || p.zone == null) return { asked, place: p?.place ?? null, zone: null, locality: null, outside: true };
    // a locality narrower than its zone ("Velachery" in Adyar zone) is matched on the incident's place
    return { asked, place: p.place, zone: Number(p.zone), locality: p.ward ? p.place : null, outside: false };
  }));
}
