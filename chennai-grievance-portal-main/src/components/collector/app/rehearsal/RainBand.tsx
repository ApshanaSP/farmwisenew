"use client";
/**
 * The rain band: one slim line at the top of every page when IMD, the Chennai Flood Monitor or a reservoir says heavy
 * rain is near (rehearsal trigger, lib/rehearsal/trigger.ts), with a countdown and the readiness of the jobs sent. One
 * button opens Rain & flooding on the Overview's map. Quiet when there is nothing to say. Also listens for
 * "diq:rehearsal" (Ask the Map) to open it from a question.
 */
import { useEffect, useState } from "react";
import { I } from "../icons";
import type { RehearsalState } from "@/lib/rehearsal/types";
import "./rehearsal.css";

export interface RehearsalOpen { replay: string | null; manual: boolean; stop?: "warn" | "act" | "rain" | "check" | "learn" | null; focus?: "streets" | "help" | "schools" | "drains" | null }

export function RainBand({ onOpen, hidden }: { onOpen: (o: RehearsalOpen) => void; hidden?: boolean }) {
  const [d, setD] = useState<RehearsalState | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => fetch("/api/rehearsal/state").then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j?.trigger) setD(j); }).catch(() => undefined);
    load();
    const t = setInterval(load, 5 * 60_000);
    const open = (e: Event) => onOpen({ replay: null, manual: false, ...((e as CustomEvent).detail ?? {}) });
    window.addEventListener("diq:rehearsal", open);
    // tells Ask the Map that rehearsal questions can open the rehearsal here
    (window as Window & { __diqRehearsal?: boolean }).__diqRehearsal = true;
    return () => { live = false; clearInterval(t); window.removeEventListener("diq:rehearsal", open); (window as Window & { __diqRehearsal?: boolean }).__diqRehearsal = false; };
  }, [onOpen]);
  if (!d || hidden || d.trigger.level === "none") return null;
  const t = d.trigger;
  const r0 = t.reasons[0];
  const left = t.hoursLeft;
  const sent = d.counts.tasks;
  return (
    <div className={`rr-band lv-${t.level}`} role="region" aria-label="Rain rehearsal">
      <span className="rr-rain" aria-hidden="true" />
      <I n="cloud" />
      <b>{t.level === "act" ? "Heavy rain soon" : t.level === "rehearse" ? "Heavy rain likely" : "Rain watch"}{t.rainAt ? ` · ${dayName(t.rainAt)}` : ""}</b>
      <span className="rr-band-src" title={t.reasons.map((r) => r.en).join("\n")}>{r0?.en}</span>
      {left != null && left > 0 && <span className="rr-band-left"><I n="timer" />{left} h left</span>}
      {sent > 0 && <span className="rr-band-ready" title="Before-rain jobs done"><I n="checkc" />Ready {d.counts.done} / {sent}</span>}
      <span className="tspace" />
      <span className="rr-band-n" title="Streets that flooded in past rains">{d.counts.likely} likely flood streets</span>
      <button className="rr-band-go" onClick={() => onOpen({ replay: null, manual: false })}><I n="map" />Show flood streets</button>
    </div>
  );
}

export const dayName = (t: string) => new Date(t.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
