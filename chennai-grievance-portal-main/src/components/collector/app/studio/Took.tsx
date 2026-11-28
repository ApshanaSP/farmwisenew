"use client";

/**
 * "What we took from it": the facts of what the Studio read from a file or a link, at the top of a dataset and of its
 * dashboard: the source (and which table on a page), rows read and kept, the columns used and as what, the ones left
 * out or kept private, the period and how much was placed on the map. Computed from the saved dataset (lib/studio/took).
 */
import { useState } from "react";
import type { Took } from "@/lib/studio/took";
import { I, type IconName } from "../icons";

const AS_IC: Record<string, IconName> = { Date: "cal", Place: "pin", Ward: "pin", Zone: "pin", Taluk: "pin", "Map point": "pin", Type: "grid", Status: "checkc", Number: "barH" };

export default function TookCard({ t, compact = false }: { t: Took; compact?: boolean }) {
  const [more, setMore] = useState(false);
  // 28 Nov (the owner: the Studio was congested): the column chips are folded away under one line, opened on request
  const [cols, setCols] = useState(false);
  const dropped = Math.max(0, t.rowsRead - t.rowsKept);
  const left = t.unused.length + t.hidden.length;
  return (
    <section className={`ds-took${compact ? " compact" : ""}`} aria-label="What was taken from the source">
      <header>
        <span className="ds-took-ic"><I n={t.kind === "link" ? "ext" : "doc"} /></span>
        <div className="ds-took-t">
          <small>What we took from {t.kind === "link" ? "the link" : t.kind === "sample" ? "the sample" : "the file"}</small>
          <b title={t.url ?? t.source}>{t.url ? <a href={t.url} target="_blank" rel="noopener noreferrer">{t.source}<I n="ext" /></a> : t.source}</b>
          {t.part && <em>{t.part}</em>}
        </div>
      </header>
      <dl className="ds-took-s">
        <div><dt>Rows used</dt><dd>{t.rowsKept.toLocaleString("en-IN")}<small>{dropped ? `of ${t.rowsRead.toLocaleString("en-IN")} read · ${dropped.toLocaleString("en-IN")} dropped` : "all rows read"}</small></dd></div>
        <div><dt>Columns used</dt><dd>{t.used.length}<small>of {t.cols} in the source</small></dd></div>
        <div><dt>Period</dt><dd className="txt">{t.period ?? "No dates"}</dd></div>
        <div><dt>On the map</dt><dd>{t.placedPct != null ? `${t.placedPct}%` : "—"}<small>{t.placedPct != null ? "of rows placed in Chennai" : "no places in the data"}</small></dd></div>
      </dl>
      <button type="button" className="ds-lnk ds-took-tg" onClick={() => setCols((x) => !x)} aria-expanded={cols}>
        <I n="table" />{cols ? "Hide the columns" : `Show the ${t.used.length} columns used`}<I n="chevd" className={cols ? "ds-rot" : ""} />
      </button>
      {cols && <div className="ds-took-c" aria-label="Columns used">
        {t.used.map((c) => (
          <span key={c.header} title={c.label !== c.header ? `${c.header} (read as ${c.label})` : c.header}>
            <I n={AS_IC[c.as] ?? "table"} /><i>{c.as}</i>{c.header}
          </span>
        ))}
        {!t.used.length && <span className="none"><I n="info" />No column could be charted</span>}
        {left > 0 && <button type="button" className="ds-lnk" onClick={() => setMore((x) => !x)} aria-expanded={more}>{more ? "Hide" : `${left} not charted`}<I n="chevd" className={more ? "ds-rot" : ""} /></button>}
      </div>}
      {cols && more && (
        <p className="ds-took-x">
          {t.unused.length > 0 && <span><b>Kept, not charted:</b> {t.unused.join(", ")}</span>}
          {t.hidden.length > 0 && <span><I n="shield" /><b>Kept private:</b> {t.hidden.join(", ")}</span>}
        </p>
      )}
      {t.linked && <p className="ds-took-l"><I n="compare" />{t.linked}</p>}
    </section>
  );
}
