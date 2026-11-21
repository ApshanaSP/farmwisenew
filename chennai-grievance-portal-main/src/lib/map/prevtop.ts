/**
 * v3: the places an answer ranked first, as refs the next question can point at ("what is happening there", "the second
 * one", "that school"). The console sends them with a follow-up; the server lists them to the AI as "the previous
 * answer's number N". Pure: the panel, the server and the evals share it.
 */
import type { AskResponse } from "./ask";

export interface PrevTop { ref: string; name: string }

export function prevTopOf(r: AskResponse | null | undefined, n = 3): PrevTop[] {
  if (!r || r.kind !== "answer") return [];
  const area = (by: string, key: string) => (by === "ward" || by === "zone" || by === "taluk" ? `${by}:${key}` : null);
  const out: PrevTop[] = [];
  const push = (ref: string | null, name: string) => { if (ref && out.length < n && !out.some((x) => x.ref === ref)) out.push({ ref, name }); };
  const ex = r.extra;
  if (ex.forecast) for (const x of ex.forecast.rows) push(`zone:${x.key}`, x.label);
  else if (ex.groups?.length && ex.groupsBy && ex.groupsBy !== "category" && ex.groupsBy !== "dept" && ex.groupsBy !== "hex500") {
    for (const g of ex.groups) push(ex.groupsBy === "near" ? (/^(osm|fac):/.test(g.key) ? g.key : null) : area(ex.groupsBy, g.key), g.label);
  } else if (ex.speed && (ex.speed.by === "ward" || ex.speed.by === "zone" || ex.speed.by === "taluk")) {
    for (const x of ex.speed.rows) push(area(ex.speed.by, x.key), x.label);
  } else if (ex.rank) {
    for (const x of ex.rank.rows) push(area(ex.rank.by, x.key), x.label);
  }
  return out;
}
