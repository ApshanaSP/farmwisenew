"use client";
/** Words and small pieces shared by Rain's four tabs (RainView.tsx, ImpactView.tsx): dates of a rain, counts, a dot per rain. */
import type { PastRain } from "@/lib/rehearsal/types";

export const n0 = (x: number) => x.toLocaleString("en-IN");
const day = (d: string) => new Date(d.slice(0, 10) + "T00:00:00Z");
export const fmtD = (d: string) => day(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
export const fmtT = (t: string) => new Date(t.replace(" ", "T") + "Z").toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "UTC" });
/** "21 Oct", "21–23 Oct", "30 Sept–2 Oct" */
export const range = (r: { start: string; end: string }) => {
  if (r.start === r.end) return fmtD(r.start);
  const a = day(r.start), b = day(r.end);
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${fmtD(r.end)}` : `${fmtD(r.start)}–${fmtD(r.end)}`;
};
export const days = (r: { start: string; end: string }) => Math.round((day(r.end).getTime() - day(r.start).getTime()) / 86_400_000) + 1;
export const plural = (n: number, one: string, many = `${one}s`) => `${n0(n)} ${n === 1 ? one : many}`;

/** one dot per heavy rain, oldest first: filled where it was hit; the chosen rain ringed */
export function RainDots({ rains, on, now = null, onRain }: { rains: PastRain[]; on: (r: PastRain) => boolean; now?: string | null; onRain?: (id: string) => void }) {
  return (
    <span className="rv-dots" aria-label={`${rains.filter(on).length} of ${rains.length} rains`}>
      {rains.map((r) => onRain
        ? <button key={r.id} className={`${on(r) ? "on" : ""}${now === r.id ? " now" : ""}`} title={`${range(r)} rain: ${on(r) ? "hit" : "not hit"}`} onClick={() => onRain(r.id)} />
        : <i key={r.id} className={`${on(r) ? "on" : ""}${now === r.id ? " now" : ""}`} title={`${range(r)} rain: ${on(r) ? "hit" : "not hit"}`} />)}
    </span>
  );
}
