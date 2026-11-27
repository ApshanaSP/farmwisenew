"use client";

import { useEffect, useRef, useState } from "react";
import { I } from "@/components/collector/app/icons";
import { SevChip, deptIcon, fmtShort, fullTitle, type Row } from "@/components/collector/app/lib";
import { OFFICER } from "@/lib/officer/departments";
import type { Ctx } from "./OfficerApp";
import { sevLabel } from "@/lib/sev-label";

/** Scales a photo down in the browser (longest side OFFICER.photoMaxPx, JPEG) so reports upload quickly. */
async function shrink(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const sc = Math.min(1, OFFICER.photoMaxPx / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement("canvas");
    cv.width = Math.round(img.naturalWidth * sc);
    cv.height = Math.round(img.naturalHeight * sc);
    cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise<Blob | null>((resolve) => cv.toBlob(resolve, "image/jpeg", 0.82));
    return blob ?? file;
  } catch {
    return file; // the server checks the file type and says so if it cannot be used
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Completion report: what was done, with photos of the finished work. A severe grievance goes to the Collector for
 * verification; any other is closed by the department, and the report is kept as its record, or, when the officer
 * wants the Collector's approval, sent to the Collector like a severe one (the owner's decision of 27 Nov).
 */
export function SendReport({ row, c, onSent }: { row: Row; c: Ctx; onSent: (step: "send" | "close") => void }) {
  const severe = row.sev === "Severe";
  const [remarks, setRemarks] = useState("");
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const add = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) { setErr("Choose image files (JPG or PNG)."); return; }
    const room = OFFICER.maxPhotos - photos.length;
    const added: { blob: Blob; url: string }[] = [];
    for (const f of imgs.slice(0, Math.max(0, room))) {
      const blob = await shrink(f);
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      added.push({ blob, url });
    }
    setPhotos((p) => [...p, ...added]);
    setErr(imgs.length > room ? `At most ${OFFICER.maxPhotos} photos can be attached.` : "");
  };

  // which way the report went (the button pressed), for the busy label
  const [going, setGoing] = useState<"send" | "close">(severe ? "send" : "close");
  const send = async (step: "send" | "close") => {
    const text = remarks.trim();
    if (text.length < OFFICER.minRemarks) { setErr("Write remarks describing the work done."); return; }
    if (!photos.length) { setErr("Attach at least one photo of the completed work."); return; }
    setBusy(true);
    setGoing(step);
    setErr("");
    const fd = new FormData();
    fd.append("remarks", text);
    fd.append("step", step);
    photos.forEach((p, k) => fd.append("photos", p.blob, `photo-${k + 1}.jpg`));
    try {
      const r = await fetch(`/api/officer/grievances/${encodeURIComponent(row.id)}/report`, { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not send the report.");
      onSent(step);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="osend">
      <div className="rep" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <span className="bic t-info"><I n={deptIcon(c.dept.code)} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: "block" }}>{fullTitle(row)}</b>
          <span className="dim" style={{ fontSize: 12.5 }}>{row.id} · {row.zone_name ?? "Chennai"} · reported {fmtShort(row.t)} · {row.complaints} complaint{row.complaints === 1 ? "" : "s"}</span>
        </span>
        <SevChip s={row.sev} />
      </div>
      <label className="fld">
        <span className="sec-t" style={{ margin: 0 }}>Remarks · what was done</span>
        <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder={`e.g. ${c.dept.remarkHint}`} maxLength={OFFICER.maxRemarks} autoFocus />
        <small>{remarks.trim().length}/{OFFICER.maxRemarks}</small>
      </label>
      <div className="fld">
        <span className="sec-t" style={{ margin: 0 }}>Photos of completed work ({photos.length}/{OFFICER.maxPhotos})</span>
        {photos.length > 0 && (
          <div className="ph-grid" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
            {photos.map((p, k) => (
              <figure key={p.url}>
                <img src={p.url} alt={`Uploaded photo ${k + 1}`} />
                <button className="ph-x" onClick={() => setPhotos((all) => all.filter((x) => x !== p))} aria-label={`Remove photo ${k + 1}`}><I n="x" /></button>
              </figure>
            ))}
          </div>
        )}
        <label className={`odrop${over ? " over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); add([...e.dataTransfer.files]); }}>
          <I n="photo" /><b>Upload site photos</b><small className="dim">JPG or PNG · you can pick several, or drop them here</small>
          <input type="file" accept="image/*" multiple onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ""; }} disabled={busy || photos.length >= OFFICER.maxPhotos} />
        </label>
      </div>
      {err && <div className="oerr" role="alert">{err}</div>}
      <div className="osend-f">
        <button className="btn plain" onClick={c.closeAll} disabled={busy}>Cancel</button>
        {!severe && <span className="hint" style={{ marginRight: "auto" }}>{sevLabel(row.sev)}: your department verifies and closes it, or sends it to the Collector for approval.</span>}
        {!severe && (
          <button className="btn plain" onClick={() => send("send")} disabled={busy} title="The Collector checks your report and closes the case, or sends it back">
            {busy && going === "send" ? <><I n="refresh" className="spin" />Sending…</> : <><I n="send" />Send to Collector for approval</>}
          </button>
        )}
        <button className="btn" onClick={() => send(severe ? "send" : "close")} disabled={busy}>{busy && (severe || going === "close") ? <><I n="refresh" className="spin" />{severe ? "Sending…" : "Closing…"}</>
          : severe ? <><I n="send" />Send to Collector</> : <><I n="check" />Close as done</>}</button>
      </div>
    </div>
  );
}
