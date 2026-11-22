/**
 * v3: the places an answer ranked first, as refs the next question can point at ("what is happening there", "the second
 * one", "that school"). The console sends them with a follow-up; the server lists them to the AI as "the previous
 * answer's number N". Pure: the panel, the server and the evals share it.
 */
import type { AskResponse } from "./ask";
import type { Plan } from "./plan";

export interface PrevTop { ref: string; name: string }

/** v3: the places earlier questions of the conversation asked about (zone 9, then zone 10: "compare both"), newest first */
export function earlierAreasOf(plans: (Plan | null | undefined)[], n = 4): PrevTop[] {
  const out: PrevTop[] = [];
  for (const p of [...plans].reverse()) for (const s of p?.steps ?? []) {
    if (s.op !== "inside") continue;
    const a = s.area as { kind: string; id?: number; code?: string; ref?: string };
    const ref = a.kind === "point" ? a.ref ?? "" : a.kind === "taluk" ? `taluk:${a.code}` : a.kind === "zone" || a.kind === "ward" ? `${a.kind}:${a.id}` : "";
    if (ref && !out.some((x) => x.ref === ref) && out.length < n) out.push({ ref, name: ref });
  }
  return out;
}

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
