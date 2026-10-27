/**
 * The console's search box (LT-36): every word of the query must match, in any order, somewhere in the incident's
 * title, place, zone or category ("velachery flooding" and "flooding velachery" both find the Velachery flooding);
 * the words are matched by stem and by a few synonyms ("flooding" also finds waterlogging, "garbage" also finds waste),
 * so the search no longer needs the exact phrase. Pure: intel.search() turns the groups into SQL.
 */

/** Words that carry no meaning in a search. */
const STOP = new Set(["the", "a", "an", "in", "at", "on", "of", "for", "near", "and", "or", "to", "is", "are", "with", "by", "from", "show", "me", "all", "any"]);

/** A word and the other words that mean the same in the records. */
const SYNONYMS: [RegExp, string[]][] = [
  [/^(flood|flooding|flooded|floods|waterlog\w*|inundat\w*|stagnat\w*)$/, ["flood", "waterlog", "inundat", "stagnat", "submerg"]],
  [/^(garbage|waste|trash|rubbish|dump\w*)$/, ["garbage", "waste", "trash", "rubbish", "dump"]],
  [/^(pothole|potholes|craters?)$/, ["pothole", "crater"]],
  [/^(power|electricity|outage|powercut)$/, ["power", "electric", "outage", "tangedco"]],
  [/^(water|drinking)$/, ["water"]],
  [/^(sewage|drain|drains|drainage|manhole)$/, ["sewage", "drain", "manhole"]],
  [/^(accident|accidents|crash|collision)$/, ["accident", "crash", "collision", "collide"]],
  [/^(streetlight|streetlights|light|lights)$/, ["streetlight", "street light", "light"]],
  [/^(dog|dogs|stray)$/, ["dog", "stray"]],
  [/^(tree|trees|fallen)$/, ["tree", "fallen"]],
  [/^(mosquito|mosquitoes|dengue)$/, ["mosquito", "dengue"]]
];

/** A plain English stem: "flooding" -> "flood", "complaints" -> "complaint". */
export function stem(w: string): string {
  return w.length <= 4 ? w : w.replace(/(ings|ing|ed|es|s)$/i, "").replace(/(.)\1$/, "$1") || w;
}

/** The query as groups of alternatives: a record matches when every group has one alternative in it. */
export function searchGroups(text: string): string[][] {
  const words = String(text ?? "").toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter((w) => w.length >= 2 && !STOP.has(w)).slice(0, 6);
  return words.map((w) => {
    const syn = SYNONYMS.find(([rx]) => rx.test(w))?.[1] ?? [];
    return [...new Set([w, stem(w), ...syn])].filter((x) => x.length >= 2);
  });
}

/** Does a record's text match the query? (the same rule as the SQL, for tests and in-memory lists) */
export const matchesAll = (hay: string, groups: string[][]) => {
  const h = hay.toLowerCase();
  return groups.every((g) => g.some((x) => h.includes(x)));
};
