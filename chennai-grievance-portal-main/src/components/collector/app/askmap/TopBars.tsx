"use client";
/**
 * v3: a ranked answer at a glance. The top five as bars (the longest is the first), each with its rank, name and
 * figure; a click picks that place: its cases on the map, and a card with the two things an officer wants next:
 * this answer's kind of problem in that place (the list of garbage complaints in Perambur (Ward 44)), or the place's
 * full overview (every department's open issues there). Above the bars, the same answer by ward, zone or taluk, one
 * tap each (the plan is changed in place, no AI call). The same order and numbers as the map's numbered badges
 * (answerLayers.rankedOf), so the panel and the map tell one story.
 */
import { useState } from "react";
import type { AskResponse } from "@/lib/map/ask";
import type { AreaRef, Plan } from "@/lib/map/plan";
import type { MapAsk } from "./useMapAsk";
import { rankedOf, type RankRow } from "./answerLayers";
import { I } from "../icons";

type By = "ward" | "zone" | "taluk";
const BY_WORD: Record<By, [string, string]> = { ward: ["Ward", "வார்டு"], zone: ["Zone", "மண்டலம்"], taluk: ["Taluk", "வட்டம்"] };

/** the plan with its ranking step counted by another kind of area (count_by, speed or rank), or null when it has none */
export function regroup(plan: Plan | null, by: By): Plan | null {
  if (!plan) return null;
  const last = plan.steps.find((s) => s.as === plan.show);
  if (!last || !((last.op === "count_by" && (last.by === "ward" || last.by === "zone" || last.by === "taluk")) || last.op === "speed" || last.op === "rank")) return null;
  if (last.op === "speed" && last.by !== "ward" && last.by !== "zone" && last.by !== "taluk") return null;
  return { ...plan, steps: plan.steps.map((s) => (s === last ? { ...s, by } as typeof s : s)) };
}

/** the area a ranked row stands for (a ward, zone or taluk; a facility's surroundings for a count near places) */
export function areaOfRow(by: string, key: string, radius: number | null): AreaRef | null {
  if (by === "ward" || by === "zone") return Number.isFinite(Number(key)) ? { kind: by, id: Number(key) } : null;
  if (by === "taluk") return { kind: "taluk", code: key };
  if (by === "near" && /^(osm|fac):/.test(key)) return { kind: "point", ref: key, radius_m: radius ?? 500 };
  return null;
}

/** this answer's cases in one area: the same incidents (kind, time, status) kept inside it, as a list on the map */
export function herePlan(plan: Plan | null, area: AreaRef): Plan | null {
  const take = plan?.steps.find((s) => s.op === "take" && s.layer === "incidents");
  if (!plan || !take) return null;
  return { language: plan.language, show: "here", steps: [take, { op: "inside", as: "here", of: take.as, area }] };
}

export function TopBars({ r, ask, lang }: { r: AskResponse; ask: MapAsk; lang: "en" | "ta" }) {
  const [all, setAll] = useState(false);
  const k = rankedOf(r);
  if (!k) return null;
  const ta = lang === "ta";
  const rows = all ? k.rows.slice(0, 50) : k.rows.slice(0, 5);
  const max = Math.max(...k.rows.map((x) => x.n), 1);
  const picked = ask.spot ? k.rows.find((x) => x.label === ask.spot!.label) ?? null : null;
  const pickedAt = picked ? k.rows.indexOf(picked) : -1;
  const by = k.by as By;
  const canRegroup = !k.rain && (by === "ward" || by === "zone" || by === "taluk") && !!regroup(r.plan, by);
  return (
    <div className="amp-rank" role="list" aria-label={ta ? "வரிசை" : "Ranking"}>
      {canRegroup && (
        <div className="amp-by" role="tablist" aria-label={ta ? "எந்த அளவில்" : "Count by"}>
          {(["ward", "zone", "taluk"] as By[]).map((b) => (
            <button key={b} role="tab" aria-selected={b === by} className={b === by ? "on" : ""} disabled={ask.busy || b === by}
              onClick={() => { const p = regroup(r.plan, b); if (p) void ask.run(p, ta ? `${BY_WORD[b][1]} வாரியாக` : `By ${b}`); }}>
              {ta ? BY_WORD[b][1] : `${BY_WORD[b][0]} wise`}
            </button>
          ))}
        </div>
      )}
      {rows.map((x, i) => {
        const on = ask.spot?.label === x.label;
        return (
          <button key={x.key} role="listitem" className={`amp-rk${on ? " on" : ""}${i === 0 ? " first" : ""} t-${x.tone || "x"}`} style={{ ["--w" as string]: `${Math.max(4, (x.n / max) * 100)}%`, ["--d" as string]: `${i * 60}ms` }}
            onClick={() => ask.setSpot(on ? null : { ids: x.ids, label: x.label })} title={`${x.label}: ${x.sub}`} aria-current={on ? "true" : undefined}>
            <span className="rk">{i + 1}</span>
            <span className="nm"><b>{x.label}</b><i /></span>
            <span className="fg">{x.fig}</span>
          </button>
        );
      })}
      {k.rows.length > 5 && (
        <button className="amp-rank-more" onClick={() => setAll((v) => !v)}>
          {all ? (ta ? "முதல் 5 மட்டும்" : "Show the top 5") : ta ? `அனைத்தும் (${k.rows.length})` : `Show all ${k.rows.length.toLocaleString("en-IN")}`}
        </button>
      )}
      {picked && <PlaceCard r={r} ask={ask} lang={lang} row={picked} rank={pickedAt + 1} by={k.by} radius={k.radius} onClose={() => ask.setSpot(null)} />}
    </div>
  );
}

/**
 * The place an officer picked from the ranking (a bar, a badge or an area on the map): what it holds for this answer,
 * and the two ways on: this answer's kind of problem there, as its own list, or the place's whole overview.
 */
function PlaceCard({ r, ask, lang, row, rank, by, radius, onClose }: { r: AskResponse; ask: MapAsk; lang: "en" | "ta"; row: RankRow; rank: number; by: string; radius: number | null; onClose: () => void }) {
  const ta = lang === "ta";
  const area = areaOfRow(by, row.key, radius);
  const here = area ? herePlan(r.plan, area) : null;
  const topic = r.topic ? (ta ? r.topic.ta : r.topic.en) : ta ? "அனைத்துப் புகார்களும்" : "all complaints";
  const overview = () => {
    if (area?.kind === "ward") void ask.draw({ ward: area.id }, undefined, ta ? `${row.label}: முழு மேலோட்டம்` : `Full overview of ${row.label}`);
    else void ask.ask(ta ? `${row.label} இல் என்ன நடக்கிறது` : by === "near" ? `what is happening near ${row.label}` : `what is happening in ${row.label}`);
  };
  return (
    <div className="amp-pick" role="region" aria-label={row.label}>
      <header>
        <span className="rk">{rank}</span>
        <div><b>{row.label}</b><small>{row.fig === String(row.n) || /^\d/.test(row.sub) ? row.sub : `${row.fig} · ${row.sub}`}</small></div>
        <button className="x" onClick={onClose} aria-label={ta ? "மூடு" : "Close"}><I n="x" /></button>
      </header>
      <p>{ta ? "அடுத்து என்ன பார்க்க வேண்டும்?" : "What do you want to see here?"}</p>
      <div className="amp-pick-acts">
        {here && (
          <button className="pri" disabled={ask.busy} onClick={() => void ask.run(here, ta ? `${row.label}: ${topic}` : `${topic[0].toUpperCase()}${topic.slice(1)} in ${row.label}`)}>
            <I n="tasks" /><span><b>{ta ? `${topic} மட்டும்` : `Only ${topic}`}</b><small>{ta ? "இந்த இடத்தின் பட்டியலும் வரைபடமும்" : "the list and the map for this place"}</small></span>
          </button>
        )}
        <button disabled={ask.busy} onClick={overview}>
          <I n="info" /><span><b>{ta ? "முழு மேலோட்டம்" : "Full overview"}</b><small>{ta ? "எல்லாத் துறைகளும், எல்லா வகைகளும்" : "every kind of problem and department here"}</small></span>
        </button>
      </div>
    </div>
  );
}
