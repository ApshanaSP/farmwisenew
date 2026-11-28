"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { I } from "@/components/collector/app/icons";
import { fmtShort, fullTitle, type Row } from "@/components/collector/app/lib";

/** How a resolved case was resolved (lib/cases/resolution.ts Resolution), as the list rows carry it. */
export interface ResolutionView {
  photos: string[]; remark: string | null; by: string | null; sentAt: string | null;
  approvedBy: "collector" | "department" | "records"; closedAt: string | null; report: boolean;
}

/** Who closed it, in the words of the console reading it. */
export function approvedWords(r: ResolutionView | null | undefined, who: "collector" | "officer"): string {
  if (!r) return "Closed";
  if (r.approvedBy === "collector") return who === "collector" ? "Approved by you" : "Approved by the Collector";
  if (r.approvedBy === "department") return who === "collector" ? "Closed by the department" : "Closed by your department";
  return "Closed in the department's records";
}

/**
 * A photo shown large over the page (rendered into the page's body, so no dialog's own transform or overflow clips it). Esc, the x or a
 * click outside the photo closes it; the full-size file opens in a new tab from its link.
 */
export function PhotoLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={alt} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(10,20,15,.82)", display: "grid", placeItems: "center", padding: 16 }}>
      <figure onClick={(e) => e.stopPropagation()} style={{ margin: 0, maxWidth: "min(1100px, 96vw)", display: "flex", flexDirection: "column", gap: 8 }}>
        <img src={src} alt={alt} style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: 12, background: "#111" }} />
        <figcaption style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", color: "#fff", fontSize: 13 }}>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alt}</span>
          <span style={{ display: "inline-flex", gap: 8, flex: "none" }}>
            <a href={src} target="_blank" rel="noreferrer" className="btn sm plain">Open full size</a>
            <button className="btn sm" onClick={onClose} aria-label="Close the photo"><I n="x" />Close</button>
          </span>
        </figcaption>
      </figure>
    </div>,
    document.body
  );
}

const THUMB: CSSProperties = { width: 84, height: 64, flex: "none", borderRadius: 10, objectFit: "cover", display: "block", background: "var(--line)" };
const NOPHOTO: CSSProperties = { ...THUMB, display: "grid", placeItems: "center", color: "var(--text-3)" };

/**
 * The Resolved list (the Collector's Resolved tile and the officer's Resolved / Verified list): each case with its resolution photo, the
 * officer's remark, who approved the close and the dates. A click on the photo shows it large; a click on the row opens the case.
 * One column of rows that wrap (no table), so it reads the same at 1366, 1024 and 375 px.
 */
export function ResolvedRows({ rows, who, onOpen, empty = "No case was resolved in this period." }: {
  rows: Row[]; who: "collector" | "officer"; onOpen: (id: string) => void; empty?: string;
}) {
  const [big, setBig] = useState<{ src: string; alt: string } | null>(null);
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }} aria-label="Resolved cases">
        {rows.map((r) => {
          const res = (r.resolution ?? null) as ResolutionView | null;
          const photo = res?.photos?.[0] ?? null;
          const title = who === "collector" ? fullTitle(r) : String(r.type ?? r.title ?? r.id);
          const where = [r.loc, r.zone_name].filter(Boolean).join(" · ");
          return (
            <li key={r.id} onClick={() => onOpen(String(r.id))} title={`${r.id} · ${title}`}
              style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 10, border: "1px solid var(--line)", borderRadius: 12, cursor: "pointer", minWidth: 0 }}>
              {photo ? (
                <button onClick={(e) => { e.stopPropagation(); setBig({ src: photo, alt: `After the work: ${title}` }); }} aria-label="Show the photo large"
                  style={{ padding: 0, border: 0, background: "none", cursor: "zoom-in", flex: "none" }}>
                  <img src={photo} alt={`After the work: ${title}`} loading="lazy" style={THUMB} />
                </button>
              ) : <span style={NOPHOTO} aria-hidden="true"><I n="photo" /></span>}
              <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
                <b style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</b>
                <small className="dim" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[who === "collector" ? r.dept_name ?? r.dept : null, where || null, r.sev ? `${r.sev}` : null].filter(Boolean).join(" · ")}
                </small>
                {res?.remark ? (
                  <span style={{ fontSize: 13, color: "var(--text-2)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {res.report ? `“${res.remark}”` : res.remark}
                  </span>
                ) : null}
                <small style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", color: "var(--text-3)" }}>
                  <span style={{ color: res?.approvedBy === "collector" ? "var(--ok, #0E7C50)" : undefined, fontWeight: 600 }}>
                    <I n="checkc" /> {approvedWords(res, who)}{res?.closedAt ? ` · ${fmtShort(res.closedAt)}` : ""}
                  </span>
                  {res?.by && res.report ? <span>Report by {res.by}{res.sentAt ? ` · ${fmtShort(res.sentAt)}` : ""}</span> : null}
                  <span>Reported {fmtShort(r.t)}</span>
                </small>
              </span>
            </li>
          );
        })}
      </ul>
      {big && <PhotoLightbox src={big.src} alt={big.alt} onClose={() => setBig(null)} />}
    </>
  );
}
