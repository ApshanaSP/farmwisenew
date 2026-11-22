/**
 * What a plan must have for an eval question (eval/map-final/dev.json, eval/map-v2/typos.json): the op it shows, the layers it takes, the
 * categories, distances, areas and periods. Shared by the live AI eval (mapai.live.ts) and the typo golden (typos.golden.ts). Pure.
 */
import type { Plan, Step } from "./plan";

export interface Want { show?: string; layers?: string[]; of_layer?: string; cats?: string[]; family_or_cat?: string; meters?: number; beyond?: number; by?: string; order?: string;
  areas?: string; area?: string; kinds?: string[]; period_days?: number; language?: string; severity?: string; overdue?: boolean; from_place?: boolean; understood?: boolean;
  /** v3: ranked per 10,000 people; the status filter (open, closed, any) */ per?: boolean; status?: string;
  /** v3: every kind of problem (no category, family or dept on the incidents); one department */ every_kind?: boolean; dept?: string;
  /** v3: a new question carries nothing of the last one: not these kinds, no area, not these layers */ no_cats?: string[]; no_area?: boolean; no_layers?: string[] }
export interface Q { id: string; q: string; want: Want }


/** What is wrong with the plan for this question ([] = it passes). */
export function misses(plan: Plan | null, problems: string[] | null, want: Want): string[] {
  if (want.understood === false) return problems?.includes("not a map question") ? [] : ["should be refused as not a map question"];
  if (!plan) return [`no plan (${(problems ?? []).join("; ").slice(0, 120)})`];
  const out: string[] = [];
  const show = plan.steps.find((s) => s.as === plan.show)!;
  const takes = plan.steps.filter((s): s is Extract<Step, { op: "take" }> => s.op === "take");
  const inc = takes.find((t) => t.layer === "incidents");
  if (want.show && show.op !== want.show) out.push(`shows ${show.op}, not ${want.show}`);
  for (const l of want.layers ?? []) if (!takes.some((t) => t.layer === l)) out.push(`no ${l}`);
  if (want.of_layer) {
    const w = plan.steps.find((s) => s.op === "within") as Extract<Step, { op: "within" }> | undefined;
    const of = w && plan.steps.find((s) => s.as === w.of);
    if (!(of?.op === "take" && of.layer === want.of_layer)) out.push(`within is not of ${want.of_layer}`);
  }
  const cats = [...(inc?.filter?.category ?? []), ...(inc?.filter?.family ?? [])];
  for (const c of want.cats ?? []) if (!cats.includes(c) && !cats.some((x) => x.startsWith(`${c}_`))) out.push(`no category ${c} (has ${cats.join(",") || "none"})`);
  if (want.family_or_cat && !cats.some((c) => c === want.family_or_cat || c.startsWith(want.family_or_cat!))) out.push(`no ${want.family_or_cat}`);
  const step = <O extends Step["op"]>(op: O) => plan.steps.find((s) => s.op === op) as Extract<Step, { op: O }> | undefined;
  if (want.meters != null && (step("within")?.meters ?? step("along")?.meters) !== want.meters) out.push(`meters ${step("within")?.meters ?? "none"}, not ${want.meters}`);
  if (want.beyond != null && step("farthest")?.beyond_m !== want.beyond) out.push(`beyond ${step("farthest")?.beyond_m ?? "none"}, not ${want.beyond}`);
  if (want.areas && step("farthest")?.areas !== want.areas) out.push(`areas ${step("farthest")?.areas}, not ${want.areas}`);
  if (want.by && ((show as { by?: string }).by ?? step("count_by")?.by ?? step("rank")?.by ?? (plan.steps.find((x) => x.op === "speed") as { by?: string } | undefined)?.by) !== want.by) out.push(`by ${(show as { by?: string }).by ?? "none"}, not ${want.by}`);
  const ord = (step("rank") as { order?: string } | undefined)?.order ?? (plan.steps.find((x) => x.op === "speed") as { order?: string } | undefined)?.order;
  if (want.order && ord !== want.order) out.push(`order ${ord ?? "none"}, not ${want.order}`);
  if (want.area) {
    const ins = plan.steps.filter((s): s is Extract<Step, { op: "inside" }> => s.op === "inside");
    if (!ins.some((s) => `${s.area.kind}:${s.area.kind === "zone" || s.area.kind === "ward" ? s.area.id : ""}` === want.area)) out.push(`not inside ${want.area}`);
  }
  if (want.kinds) for (const k of want.kinds) if (!takes.some((t) => t.where?.kinds?.includes(k))) out.push(`no kind ${k}`);
  // v3: 30 days is also a calendar month ("last month" read as the month before, "this month" as this one)
  if (want.period_days != null) { const p = inc?.filter?.period; if (!((p?.kind === "last_days" && p.days === want.period_days) || (want.period_days === 30 && p?.kind === "month") || (want.period_days === 7 && p?.kind === "week"))) out.push(`period ${JSON.stringify(p)}, not last ${want.period_days} days`); }
  if (want.language && plan.language !== want.language) out.push(`language ${plan.language}, not ${want.language}`);
  if (want.severity && !inc?.filter?.severity?.includes(want.severity)) out.push(`no severity ${want.severity}`);
  if (want.overdue && inc?.filter?.overdue !== true) out.push("not overdue");
  if (want.from_place && !step("nearest")?.from.startsWith("place:")) out.push("nearest is not from the place");
  if (want.every_kind && (cats.length || inc?.filter?.dept?.length)) out.push(`not every kind (kept ${[...cats, ...(inc?.filter?.dept ?? [])].join(",")})`);
  if (want.dept && !inc?.filter?.dept?.includes(want.dept)) out.push(`no dept ${want.dept} (has ${inc?.filter?.dept?.join(",") ?? "none"})`);
  if (want.per != null && (step("count_by")?.per === "people") !== want.per) out.push(want.per ? "not per people" : "per people, not asked");
  if (want.status && (inc?.filter?.status ?? "open") !== want.status) out.push(`status ${inc?.filter?.status ?? "default"}, not ${want.status}`);
  for (const c of want.no_cats ?? []) if (cats.some((x) => x === c || x.startsWith(`${c}_`))) out.push(`kept ${c} from before`);
  if (want.no_area && plan.steps.some((x) => x.op === "inside" || x.op === "compare")) out.push("kept an area from before");
  for (const l of want.no_layers ?? []) if (takes.some((t) => t.layer === l)) out.push(`kept ${l} from before`);
  return out;
}

/**
 * An eval call retried while its provider says it is busy (a per-minute limit, an overloaded model), after the wait it asks for: the score
 * then measures understanding, not quota. A question still busy after `tries` is reported as unanswered, never as a misreading.
 */
export async function withBusyRetry<T>(call: () => Promise<T>, tries = 6, maxWaitS = 60): Promise<{ value: T | null; busy: boolean; waits: number }> {
  let waits = 0;
  for (let k = 0; k < tries; k++) {
    try { return { value: await call(), busy: false, waits }; }
    catch (e) {
      const m = /busy|rate.?limit|overloaded|429|529/i.test((e as Error)?.message ?? "");
      if (!m) throw e;
      const after = Number((e as { retryAfter?: number }).retryAfter) || 10;
      waits++;
      await new Promise((r) => setTimeout(r, Math.min(maxWaitS, Math.max(2, after)) * 1000));
    }
  }
  return { value: null, busy: true, waits };
}
