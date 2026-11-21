"use client";
/**
 * v3: a ranked answer at a glance. The top five as bars (the longest is the first), each with its rank, name and
 * figure; a click shows that place's cases on the map. "Show all" opens the rest. The same order and numbers as the
 * map's numbered badges (answerLayers.rankedOf), so the panel and the map tell one story.
 */
import { useState } from "react";
import type { AskResponse } from "@/lib/map/ask";
import type { MapAsk } from "./useMapAsk";
import { rankedOf } from "./answerLayers";

export function TopBars({ r, ask, lang }: { r: AskResponse; ask: MapAsk; lang: "en" | "ta" }) {
  const [all, setAll] = useState(false);
  const k = rankedOf(r);
  if (!k) return null;
  const ta = lang === "ta";
  const rows = all ? k.rows.slice(0, 50) : k.rows.slice(0, 5);
  const max = Math.max(...k.rows.map((x) => x.n), 1);
  return (
    <div className="amp-rank" role="list" aria-label={ta ? "வரிசை" : "Ranking"}>
      {rows.map((x, i) => {
        const on = ask.spot?.label === x.label;
        return (
          <button key={x.key} role="listitem" className={`amp-rk${on ? " on" : ""}${i === 0 ? " first" : ""} t-${x.tone || "x"}`} style={{ ["--w" as string]: `${Math.max(4, (x.n / max) * 100)}%`, ["--d" as string]: `${i * 60}ms` }}
            onClick={() => ask.setSpot(on ? null : { ids: x.ids, label: x.label })} title={`${x.label}: ${x.sub}`}>
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
    </div>
  );
}
