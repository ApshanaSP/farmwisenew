/**
 * The plan as chips, one per part ("Flooding & waterlogging ▾", "Open ▾", "Last 30 days ▾", "Within 300 m ▾",
 * "of Schools (OSM) ▾"), and the edits their menus make. An edit changes the plan in the browser and the server re-runs
 * it with no AI call, so "300 m" to "500 m" updates at once. Pure: shared by the server (first answer) and the panel.
 */
import { fmtDistance } from "./geom";
import { LIMITS, OPEN_FILTER, type AreaRef, type Filter, type Period, type Plan, type Step } from "./plan";
import type { LayerId } from "./types";
import { CAT_TA, FAMILY_WORD, LAYER_WORD, SEV_WORD, periodWords } from "./words";

export interface ChipOption { key: string; en: string; ta: string; on: boolean }
export interface PlanChip {
  id: string;
  part: "category" | "status" | "period" | "severity" | "distance" | "facility" | "place" | "dept" | "citizen" | "news" | "group" | "overdue" | "k";
  en: string;
  ta: string;
  isDefault: boolean;
  options: ChipOption[];
  removable: boolean;
}

export interface ChipNames {
  cat: (code: string) => string;
  dept: (code: string) => string;
  area: (a: AreaRef) => { en: string; ta: string };
  line: (id: string) => { en: string; ta: string };
  /** other things the place could mean, as options ("Adyar zone", "Adyar River") */
  alternatives?: Record<string, { key: string; en: string; ta: string }[]>;
}

const DISTANCES = [100, 200, 300, 500, 1000, 2000];
const PERIODS: [string, Period | null][] = [["1", { kind: "last_days", days: 1, offset: 0 }], ["7", { kind: "last_days", days: 7, offset: 0 }],
  ["30", { kind: "last_days", days: 30, offset: 0 }], ["90", { kind: "last_days", days: 90, offset: 0 }], ["all", null]];

const incTake = (p: Plan) => p.steps.find((s) => s.op === "take" && s.layer === "incidents") as Extract<Step, { op: "take" }> | undefined;
const periodKey = (p: Period | null | undefined) => (!p ? "all" : p.kind === "last_days" && p.offset === 0 ? String(p.days) : "custom");

/** The chips of a plan; `defaults` names the parts the question did not state. */
export function planChips(plan: Plan, names: ChipNames, defaults: string[] = []): PlanChip[] {
  const out: PlanChip[] = [];
  const t = incTake(plan);
  const f = t?.filter ?? null;
  if (t) {
    const what = f?.category?.length ? f.category.map(names.cat).join(", ") : f?.family?.length ? f.family.map((x) => FAMILY_WORD[x]?.en ?? x).join(", ") : "All incident types";
    const whatTa = f?.category?.length ? f.category.map((c) => CAT_TA[c] ?? c).join(", ") : f?.family?.length ? f.family.map((x) => FAMILY_WORD[x]?.ta ?? x).join(", ") : "அனைத்து வகைகளும்";
    out.push({ id: "category", part: "category", en: what, ta: whatTa, isDefault: false, removable: !!(f?.category || f?.family), options: [] });
    const st = f?.status ?? "any";
    out.push({ id: "status", part: "status", en: st === "open" ? "Open" : st === "closed" ? "Closed" : "Any status", ta: st === "open" ? "திறந்தவை" : st === "closed" ? "முடிந்தவை" : "எந்த நிலையும்",
      isDefault: defaults.includes("status"), removable: false,
      options: (["open", "closed", "any"] as const).map((k) => ({ key: k, en: k === "any" ? "Any status" : k[0].toUpperCase() + k.slice(1), ta: k === "open" ? "திறந்தவை" : k === "closed" ? "முடிந்தவை" : "எந்த நிலையும்", on: st === k })) });
    if (!plan.steps.some((s) => s.op === "change")) {
      const pk = periodKey(f?.period);
      out.push({ id: "period", part: "period", en: cap(periodWords(f?.period ?? null, "en")), ta: periodWords(f?.period ?? null, "ta"), isDefault: defaults.includes("period"), removable: false,
        options: PERIODS.map(([k, p]) => ({ key: k, en: cap(periodWords(p, "en")), ta: periodWords(p, "ta"), on: pk === k })) });
    }
    const sv = f?.severity ?? null;
    const svKey = !sv ? "any" : sv.length === 1 ? "severe" : "severe_high";
    out.push({ id: "severity", part: "severity", en: !sv ? "Any severity" : sv.map((s) => cap(SEV_WORD[s as keyof typeof SEV_WORD].en)).join(" or "),
      ta: !sv ? "எந்தத் தீவிரமும்" : sv.map((s) => SEV_WORD[s as keyof typeof SEV_WORD].ta).join(" / "), isDefault: !sv, removable: false,
      options: [["severe", "Severe only", "கடுமையானவை மட்டும்"], ["severe_high", "Severe or high", "கடுமையான / அதிக"], ["any", "Any severity", "எந்தத் தீவிரமும்"]]
        .map(([k, en, ta]) => ({ key: k, en, ta, on: svKey === k })) });
    if (f?.citizen) out.push({ id: "citizen", part: "citizen", en: "Citizen complaints", ta: "குடிமக்கள் புகார்கள்", isDefault: false, removable: true, options: [] });
    if (f?.news) out.push({ id: "news", part: "news", en: "In the news", ta: "செய்திகளில் வந்தவை", isDefault: false, removable: true, options: [] });
    if (f?.overdue) out.push({ id: "overdue", part: "overdue", en: "Past deadline", ta: "காலக்கெடு தாண்டியவை", isDefault: false, removable: true, options: [] });
    if (f?.dept?.length) out.push({ id: "dept", part: "dept", en: f.dept.map(names.dept).join(", "), ta: f.dept.map(names.dept).join(", "), isDefault: false, removable: true, options: [] });
  }
  for (const s of plan.steps) {
    if (s.op === "within") {
      out.push(distanceChip(`d:${s.as}`, "Within", "க்குள்", s.meters, defaults.includes("distance")));
      for (const n of s.near) {
        const ft = plan.steps.find((x) => x.as === n) as Extract<Step, { op: "take" }> | undefined;
        if (!ft) continue;
        const lw = LAYER_WORD[ft.layer as LayerId];
        const gov = ft.where?.government ? "government " : "";
        const kinds = ft.where?.kinds?.length === 1 && ft.where.kinds[0] === "clinic" ? "clinics" : null;
        out.push({ id: `f:${n}`, part: "facility", en: `of ${cap(gov + (kinds ?? lw.en))} (${ft.layer === "police" ? "store" : "OSM"})`, ta: `${ft.where?.government ? "அரசு " : ""}${lw.ta}`,
          isDefault: false, removable: s.near.length > 1, options: [] });
      }
    }
    if (s.op === "along") {
      out.push(distanceChip(`d:${s.as}`, "Within", "க்குள்", s.meters, defaults.includes("distance")));
      const l = names.line(s.line);
      out.push({ id: `p:${s.as}`, part: "place", en: `of ${l.en}`, ta: l.ta, isDefault: false, removable: false, options: names.alternatives?.[s.as]?.map((a) => ({ ...a, on: false })) ?? [] });
    }
    if (s.op === "inside") {
      const a = names.area(s.area);
      out.push({ id: `p:${s.as}`, part: "place", en: a.en, ta: a.ta, isDefault: false, removable: false, options: names.alternatives?.[s.as]?.map((x) => ({ ...x, on: false })) ?? [] });
      if (s.area.kind === "point") out.push(distanceChip(`r:${s.as}`, "Radius", "ஆரம்", s.area.radius_m, defaults.includes("radius")));
    }
    if (s.op === "nearest") out.push({ id: `k:${s.as}`, part: "k", en: s.k === 1 ? "Nearest one" : `${s.k} nearest`, ta: s.k === 1 ? "அருகிலுள்ள ஒன்று" : `அருகிலுள்ள ${s.k}`,
      isDefault: defaults.includes("k"), removable: false, options: [1, 3, 5, 10].map((k) => ({ key: String(k), en: k === 1 ? "Nearest one" : `${k} nearest`, ta: `${k}`, on: s.k === k })) });
    if (s.op === "count_by") out.push({ id: `g:${s.as}`, part: "group", en: `By ${s.by === "hex500" ? "500 m cell" : s.by}`, ta: `${s.by === "ward" ? "வார்டு" : s.by === "zone" ? "மண்டல" : s.by === "taluk" ? "வட்ட" : "500 மீ"} வாரியாக`,
      isDefault: false, removable: true, options: (["ward", "zone", "taluk", "hex500"] as const).map((b) => ({ key: b, en: b === "hex500" ? "500 m cells" : `By ${b}`, ta: b, on: s.by === b })) });
    if (s.op === "compare") {
      const a = names.area(s.a), b = names.area(s.b);
      out.push({ id: `c:${s.as}`, part: "place", en: `${a.en} vs ${b.en}`, ta: `${a.ta} / ${b.ta}`, isDefault: false, removable: true, options: [] });
    }
  }
  return out;
}

function distanceChip(id: string, word: string, ta: string, m: number, isDefault: boolean): PlanChip {
  const opts = [...new Set([...DISTANCES, m])].sort((a, b) => a - b);
  return { id, part: "distance", en: `${word} ${fmtDistance(m)}`, ta: `${fmtDistance(m, "ta")} ${ta}`, isDefault, removable: false,
    options: opts.map((d) => ({ key: String(d), en: fmtDistance(d), ta: fmtDistance(d, "ta"), on: d === m })) };
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The plan with one chip changed (`option` from its menu) or removed (`option` null). Returns null when the edit makes
 * no sense for this plan, so the panel leaves it alone.
 */
export function applyChip(plan: Plan, chipId: string, option: string | null): Plan | null {
  const p: Plan = JSON.parse(JSON.stringify(plan));
  const t = incTake(p);
  const f = (): Filter => (t!.filter ??= { ...OPEN_FILTER });
  const [kind, as] = chipId.includes(":") ? chipId.split(":") : [chipId, ""];
  const step = p.steps.find((s) => s.as === as);
  switch (kind) {
    case "category": if (option === null && t) { f().category = null; f().family = null; return p; } return null;
    case "status": if (t && (option === "open" || option === "closed" || option === "any")) { f().status = option; return p; } return null;
    case "period": {
      if (!t) return null;
      const per = PERIODS.find(([k]) => k === option);
      if (!per) return null;
      f().period = per[1];
      return p;
    }
    case "severity": if (!t) return null; f().severity = option === "severe" ? ["Severe"] : option === "severe_high" ? ["Severe", "High"] : null; return p;
    case "citizen": if (t && option === null) { f().citizen = null; return p; } return null;
    case "news": if (t && option === null) { delete f().news; return p; } return null;
    case "overdue": if (t && option === null) { f().overdue = null; return p; } return null;
    case "dept": if (t && option === null) { f().dept = null; return p; } return null;
    case "d": case "r": {
      const m = Number(option);
      if (!Number.isFinite(m) || m < LIMITS.minM || m > LIMITS.maxM || !step) return null;
      if (step.op === "within" || step.op === "along") step.meters = m;
      else if (step.op === "inside" && step.area.kind === "point") step.area.radius_m = m;
      else return null;
      return p;
    }
    case "f": {
      if (option !== null) return null;
      const w = p.steps.find((s) => s.op === "within" && s.near.includes(as)) as Extract<Step, { op: "within" }> | undefined;
      if (!w || w.near.length < 2) return null;
      w.near = w.near.filter((n) => n !== as);
      p.steps = p.steps.filter((s) => s.as !== as);
      return p;
    }
    case "k": { const k = Number(option); if (step?.op === "nearest" && k >= 1 && k <= LIMITS.k) { step.k = k; return p; } return null; }
    case "g": {
      if (step?.op !== "count_by") return null;
      if (option === null) { p.steps = p.steps.filter((s) => s !== step); p.show = step.of; return p; }
      if (option === "ward" || option === "zone" || option === "taluk" || option === "hex500") { step.by = option; return p; }
      return null;
    }
    case "c": {
      if (step?.op !== "compare" || option !== null) return null;
      p.steps = p.steps.filter((s) => s !== step);
      p.show = step.of;
      return p;
    }
    case "p": {
      // another meaning of the place: "zone:13", "ward:170", "taluk:TLK-MYL", "point:<ref>", or a line id
      if (!step || !option) return null;
      if (step.op === "inside") {
        const [k, v] = option.split(/:([\s\S]*)/);
        if (k === "zone" || k === "ward") step.area = { kind: k, id: Number(v) };
        else if (k === "taluk") step.area = { kind: "taluk", code: v };
        else if (k === "point") step.area = { kind: "point", ref: v, radius_m: step.area.kind === "point" ? step.area.radius_m : 1000 };
        else return null;
        return p;
      }
      if (step.op === "along" && !option.includes(":")) return null;
      if (step.op === "along") { step.line = option; return p; }
      return null;
    }
  }
  return null;
}
