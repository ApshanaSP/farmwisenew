"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { I } from "./icons";
import type { Console } from "./CollectorApp";
import { dayWords, deadlineSource, deadlineWords, pointsText, type ScoreWhy as Why } from "@/lib/collector/scorewhy";
import { sevLabel } from "@/lib/sev-label";

const CARD: CSSProperties = { background: "var(--surface-2)", borderRadius: 12, padding: "8px 12px", marginTop: 8 };
const SUM: CSSProperties = { cursor: "pointer", display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 8px", listStyle: "none", minWidth: 0 };
const LIST: CSSProperties = { listStyle: "none", margin: "8px 0 2px", padding: 0, display: "flex", flexDirection: "column", gap: 6 };
const ITEM: CSSProperties = { display: "grid", gridTemplateColumns: "44px minmax(0, 1fr)", gap: 8, fontSize: 13.5, lineHeight: 1.35 };
const PTS: CSSProperties = { fontWeight: 800, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const NOTE: CSSProperties = { fontSize: 12, color: "var(--text-3)", margin: "6px 0 0", lineHeight: 1.4 };
const LABEL: CSSProperties = { fontSize: 12, color: "var(--text-3)", fontWeight: 600 };
const MORE: CSSProperties = { marginLeft: "auto", color: "var(--text-3)", display: "inline-flex" };
const BASIS: CSSProperties = { display: "block", fontSize: 12, color: "var(--text-3)", overflowWrap: "anywhere" };

/**
 * How the incident was scored, beside its key facts: three short rows, each opening to its named points. Severity: the
 * points of the kind of event and each factor with its basis (the BNS section, or "District IQ default"). Priority: the
 * severity plus each urgency or exposure term, and any adjustment from the Collector's past decisions. Deadline: the hours
 * and where they come from (a citizen's charter or regulation clause with its link and the date it was read, or a
 * District IQ default). Rules only, no AI. Hidden while loading or when the scores cannot be read.
 */
export function ScoreWhy({ id, c }: { id: string; c: Console }) {
  const [w, setW] = useState<Why | null>(null);

  useEffect(() => {
    let live = true;
    setW(null);
    fetch(`/api/collector/incidents/${encodeURIComponent(id)}/score`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => null); if (live && r.ok && j?.severity) setW(j as Why); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [id, c.reloadKey]);

  if (!w) return null;
  const { severity: s, priority: p, deadline: d } = w;
  const pTerms = p.terms.filter((t) => t.key !== "severity");
  const added = pTerms.reduce((a, t) => a + (t.points ?? 0), 0);

  return (
    <div className="score-why">
      <div className="iv-t"><I n="sliders" />How it was scored<span>Fixed rules on the recorded facts</span></div>
      {(w.generated || w.fromNews || w.editedLater) && (
        <p style={{ ...NOTE, marginTop: 4 }}>
          {w.generated && "Scored on a generated record (demonstration data), not an official one. "}
          {w.fromNews && "The kind of event and any death or injury counts were read from the news articles (AI-assisted). "}
          {w.editedLater}
        </p>
      )}

      <details style={CARD}>
        <summary style={SUM}>
          <span style={LABEL}>Severity</span>
          <b>{sevLabel(s.level) || "Not rated"}{s.score != null ? ` · ${Math.round(s.score)} of 100` : ""}</b>
          <span style={MORE}><I n="chevd" /></span>
        </summary>
        {s.items.length > 0 && (
          <ul style={LIST}>
            {s.items.filter((x) => !/^capped at/i.test(x.what)).map((x, k) => (
              <li key={k} style={ITEM}>
                <span style={PTS}>{pointsText(x.points)}</span>
                <span>{x.what}{x.basis && <span style={BASIS}>{x.basis}</span>}</span>
              </li>
            ))}
          </ul>
        )}
        {s.capped && <p style={NOTE}>{s.capped}.</p>}
        <p style={NOTE}>{s.bands}.</p>
      </details>

      <details style={CARD}>
        <summary style={SUM}>
          <span style={LABEL}>Priority</span>
          <b>{p.score != null ? Math.round(p.score * 10) / 10 : "—"}</b>
          {p.withPoints && s.score != null && pTerms.length > 0 && (
            <span style={LABEL}>severity {Math.round(s.score)} {pointsText(added)}</span>
          )}
          <span style={MORE}><I n="chevd" /></span>
        </summary>
        <ul style={LIST}>
          {p.terms.map((t, k) => (
            <li key={k} style={ITEM}>
              <span style={PTS}>{t.key === "severity" ? (t.points != null ? Math.round(t.points) : "") : pointsText(t.points)}</span>
              <span>{t.words}</span>
            </li>
          ))}
        </ul>
        {p.setLater && <p style={NOTE}>The priority shown on the console was set after these points were added up.</p>}
        <p style={NOTE}>
          {p.withPoints
            ? "Priority is the severity plus points for urgency and spread (District IQ defaults). Your past decisions can move it by at most 10."
            : "The points of each reason are not stored for this incident; the reasons are listed."}
        </p>
      </details>

      <details style={CARD}>
        <summary style={SUM}>
          <span style={LABEL}>Deadline</span>
          <b>{deadlineWords(d)}</b>
          <span style={{ ...LABEL, color: d.official ? "var(--accent)" : "var(--text-3)", minWidth: 0, overflowWrap: "anywhere" }}>{deadlineSource(d)}</span>
          <span style={MORE}><I n="chevd" /></span>
        </summary>
        {d.official ? (
          <p style={{ ...NOTE, color: "var(--text-2)", fontSize: 13 }}>
            {d.rule}{d.rule ? ". " : ""}
            {d.url && <a href={d.url} target="_blank" rel="noreferrer">Read the source ↗</a>}
            {d.fit && <span style={BASIS}>{d.fit}.</span>}
            {d.checked && <span style={BASIS}>Checked on {dayWords(d.checked)}</span>}
          </p>
        ) : (
          <p style={NOTE}>
            {d.source === "District IQ default"
              ? "Set by District IQ: no published timeline was found for this service."
              : "Where this deadline comes from is not recorded for this incident."}
          </p>
        )}
        {d.related.length > 0 && (
          <ul style={LIST}>
            {d.related.map((x, k) => (
              <li key={k} style={{ ...NOTE, margin: 0 }}>
                {x.rule} ({x.source}{x.clause ? `, ${x.clause}` : ""}){x.url && <> <a href={x.url} target="_blank" rel="noreferrer" aria-label="Read the source">↗</a></>}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
