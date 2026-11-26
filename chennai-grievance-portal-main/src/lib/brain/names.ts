/**
 * Names the model gives a tool, turned into the store's own codes: a zone by number or name, a taluk, a department, a kind of incident, a group
 * of kinds, a locality. A name the store does not hold is a problem the model can act on (the closest names are given), never a guess.
 */
import type { World } from "@/lib/thunai/types";
import { DEPT_ALIASES } from "@/lib/thunai/lexicon";
import { editDistance } from "@/lib/thunai/normalise";
import { isTopic, TOPICS, TOPIC_KEYS, topicCats, type Topic } from "@/lib/thunai/v18/topics";
import { ToolProblem } from "./types";

const key = (s: string) => s.toLowerCase().normalize("NFC").replace(/&/g, "and").replace(/[^a-z0-9஀-௿]+/g, " ").replace(/\b(zone|taluk|department|dept|division|area)\b/g, " ").replace(/\s+/g, " ").trim();
const squash = (s: string) => key(s).replace(/ /g, "");

/** the closest of some names to a name heard (a few letters apart), best first */
function close(q: string, names: { id: string; name: string }[], n = 3): { id: string; name: string; d: number }[] {
  const a = squash(q);
  return names.map((x) => ({ ...x, d: editDistance(a, squash(x.name), 8) })).filter((x) => x.d <= Math.max(2, Math.floor(a.length * 0.4))).sort((x, y) => x.d - y.d).slice(0, n);
}

export function zoneOf(v: unknown, w: World): number {
  const s = String(v ?? "").trim();
  const m = s.match(/^(?:zone\s*)?(\d{1,2})$/i);
  if (m) {
    const n = Number(m[1]);
    if (w.zones.some((z) => z.n === n)) return n;
    throw new ToolProblem(`There is no zone ${n}: the Greater Chennai Corporation has zones 1 to 15.`);
  }
  const k = squash(s);
  const hit = w.zones.find((z) => squash(z.name) === k || (z.ta && squash(z.ta) === k));
  if (hit) return hit.n;
  const near = close(s, w.zones.map((z) => ({ id: String(z.n), name: z.name })));
  if (near[0] && near[0].d <= 2 && (!near[1] || near[1].d > near[0].d)) return Number(near[0].id);
  // a locality that lies in one zone
  const p = placeOf(s, w);
  if (p?.zone) throw new ToolProblem(`"${s}" is not a zone: it is a locality in zone ${p.zone} (${zoneName(p.zone, w)}). Use place: "${p.name}" for the locality alone, or zones: [${p.zone}] for the whole zone.`);
  throw new ToolProblem(`"${s}" is not one of the 15 zones (${w.zones.map((z) => `${z.n} ${z.name}`).join(", ")}).${near.length ? ` Did they mean ${near.map((x) => x.name).join(" or ")}?` : ""}`);
}
export const zoneName = (n: number | null | undefined, w: World): string => w.zones.find((z) => z.n === n)?.name ?? (n ? `Zone ${n}` : "no zone");

/** a locality the gazetteer knows (its name, its zone when it lies in one) */
export function placeOf(v: unknown, w: World): { name: string; zone: number | null; aliases: string[] } | null {
  const k = squash(String(v ?? ""));
  if (!k) return null;
  const hits = w.places.filter((p) => squash(p.name) === k || p.aliases.some((a) => squash(a) === k));
  if (hits.length) {
    const zones = new Set(hits.map((h) => h.zone).filter((z) => z != null));
    return { name: hits[0].name, zone: zones.size === 1 ? (hits[0].zone ?? null) : null, aliases: [...new Set(hits.flatMap((h) => [h.name, ...h.aliases]))] };
  }
  return null;
}
/** how a name sounds to a speech reader: its consonants, with the ones that are confused made one ("Coletour" and "Kolathur" are both kltr) */
export function soundKey(t: string): string {
  return squash(t).replace(/ck|q/g, "k").replace(/c(?=[eiy])/g, "s").replace(/ch|sh|j|z(?!h)/g, "s").replace(/zh/g, "l").replace(/c|g|x/g, "k").replace(/ph|f|b/g, "p").replace(/d|th|dh/g, "t").replace(/w/g, "v").replace(/m(?=p)/g, "").replace(/[aeiouyh]/g, "").replace(/(.)\1+/g, "$1");
}
/** places that sound like a name heard, the closest in letters first */
export function soundsLike(v: string, w: World): string[] {
  const k = soundKey(v);
  if (k.length < 3) return [];
  const a = squash(v);
  const names = [...new Set([...w.places.map((p) => p.name), ...w.zones.map((z) => z.name), ...w.taluks.map((t) => t.name)])];
  return names.filter((n) => soundKey(n) === k && squash(n) !== a).map((n) => ({ n, d: editDistance(a, squash(n), 12) })).filter((x) => x.d <= Math.max(3, a.length * 0.6)).sort((x, y) => x.d - y.d).slice(0, 3).map((x) => x.n);
}
/** places heard nearly right ("Velacheri", "Alandhur", "Coletour") */
export function nearPlaces(v: string, w: World): string[] {
  return [...new Set([...soundsLike(v, w), ...close(v, w.places.map((p) => ({ id: p.name, name: p.name })), 3).map((x) => x.name)])].slice(0, 4);
}
/** the words of a request that name no place, put right by their sound: "the Coletour news" -> "Kolathur" (one word or two together) */
export function heardAs(text: string, w: World): { heard: string; name: string } | null {
  const ws = text.split(/\s+/).map((x) => x.replace(/[^\p{L}]/gu, "")).filter(Boolean);
  for (const len of [2, 1]) for (let i = 0; i + len <= ws.length; i++) {
    const g = ws.slice(i, i + len).join(" ");
    if (g.replace(/ /g, "").length < 5 || !/^[A-Za-z ]+$/.test(g) || placeOf(g, w)) continue;
    if (len === 1 && COMMON.has(g.toLowerCase())) continue;
    const n = soundsLike(g, w)[0];
    if (n) return { heard: g, name: n };
  }
  return null;
}
const COMMON = new Set("about after again because before between school hospital police water traffic street station reported newspaper papers river central market please people today tamil district incident incidents office report reports result results message recent morning evening number action accident".split(" "));

export function talukOf(v: unknown, w: World): { code: string; name: string } {
  const s = String(v ?? "").trim();
  const byCode = w.taluks.find((t) => t.code.toLowerCase() === s.toLowerCase());
  if (byCode) return byCode;
  const k = squash(s);
  const hit = w.taluks.find((t) => squash(t.name) === k || (t.ta && squash(t.ta) === k));
  if (hit) return hit;
  const near = close(s, w.taluks.map((t) => ({ id: t.code, name: t.name })));
  if (near[0] && near[0].d <= 2 && (!near[1] || near[1].d > near[0].d)) return w.taluks.find((t) => t.code === near[0].id)!;
  throw new ToolProblem(`"${s}" is not a taluk of Chennai district (${w.taluks.map((t) => t.name).join(", ")}).`);
}

const allDepts = (w: World) => [...w.depts, ...(w.bodies ?? []).filter((b) => !w.depts.some((d) => d.code === b.code))];
export function deptOf(v: unknown, w: World): { code: string; name: string } {
  const s = String(v ?? "").trim(), depts = allDepts(w);
  const byCode = depts.find((d) => d.code.toLowerCase() === s.toLowerCase());
  if (byCode) return byCode;
  const k = squash(s);
  const hit = depts.find((d) => squash(d.name) === k);
  if (hit) return hit;
  for (const [code, names] of Object.entries(DEPT_ALIASES as Record<string, readonly string[] | undefined>)) {
    if (Array.isArray(names) && names.some((a) => squash(a) === k)) { const d = depts.find((x) => x.code === code); if (d) return d; }
  }
  const part = depts.filter((d) => k.length >= 4 && (squash(d.name).includes(k) || k.includes(squash(d.name))));
  if (part.length === 1) return part[0];
  const near = close(s, depts.map((d) => ({ id: d.code, name: d.name })));
  if (!part.length && near[0] && near[0].d <= 2) return depts.find((d) => d.code === near[0].id)!;
  throw new ToolProblem(`"${s}" ${part.length > 1 ? `matches more than one department (${part.map((d) => `${d.code} ${d.name}`).join("; ")}): choose, or ask the Collector which` : `is not a department here. Departments: ${depts.map((d) => `${d.code} ${d.name}`).join("; ")}`}.`);
}
export const deptName = (code: string | null | undefined, w: World): string => allDepts(w).find((d) => d.code === code)?.name ?? String(code ?? "no department");

/** a kind of incident (one category), or a group of kinds, as category codes */
export function kindsOf(v: unknown, w: World): { codes: string[]; name: string } {
  const s = String(v ?? "").trim();
  const up = s.toUpperCase().replace(/[\s-]+/g, "_");
  if (isTopic(up)) return { codes: topicCats(up as Topic, w.cats), name: TOPICS[up as Topic].en };
  const c = w.cats.find((x) => x.code === up) ?? w.cats.find((x) => squash(x.label) === squash(s));
  if (c) return { codes: [c.code], name: c.label };
  const t = TOPIC_KEYS.find((x) => squash(TOPICS[x].en) === squash(s));
  if (t) return { codes: topicCats(t, w.cats), name: TOPICS[t].en };
  const part = w.cats.filter((x) => key(x.label).split(" ").some((y) => y.length >= 4 && key(s).split(" ").includes(y)));
  if (part.length === 1) return { codes: [part[0].code], name: part[0].label };
  throw new ToolProblem(`"${s}" is not a kind of incident here. Use a kind code (${w.cats.map((x) => x.code).join(", ")}) or a group (${TOPIC_KEYS.join(", ")}); for anything narrower use words: ["${s}"].`);
}

const SEV = ["Severe", "High", "Medium", "Low"] as const;
export function sevOf(v: unknown): (typeof SEV)[number] {
  const s = String(v ?? "").toLowerCase();
  const hit = SEV.find((x) => x.toLowerCase() === s) ?? (/critical|serious|severe|grave/.test(s) ? "Severe" : /moderate|medium/.test(s) ? "Medium" : /high|major/.test(s) ? "High" : /low|minor/.test(s) ? "Low" : null);
  if (!hit) throw new ToolProblem(`"${v}" is not a severity: Severe, High, Medium or Low.`);
  return hit;
}
