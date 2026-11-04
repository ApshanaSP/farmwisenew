"use client";
/**
 * The screens the Collector pinned, on the Overview: a chip each, and a click (or "open <name>") builds the screen again from
 * today's data. Nothing is stored here but the recipe and its slots, so a pinned figure is never stale. Hidden when there are none.
 */
import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n/lang";
import "./jarvisswitch.css";

interface Pin { id: string; title: string; recipe: string; slots: Record<string, unknown>; at: string }
const read = (): Pin[] => { try { return JSON.parse(localStorage.getItem("thunai-pins") ?? "[]") as Pin[]; } catch { return []; } };

export default function JarvisPins() {
  const [pins, setPins] = useState<Pin[]>([]);
  const [lang] = useLang();
  useEffect(() => {
    const load = () => setPins(read());
    load();
    window.addEventListener("jarvis:pins", load);
    return () => window.removeEventListener("jarvis:pins", load);
  }, []);
  if (!pins.length) return null;
  return (
    <nav className="jpins" aria-label={lang === "ta" ? "பின் செய்த திரைகள்" : "Pinned screens"} data-no-i18n>
      <span>{lang === "ta" ? "பின் செய்தவை" : "Pinned"}</span>
      {pins.map((p) => <button key={p.id} onClick={() => window.dispatchEvent(new CustomEvent("jarvis:open-pin", { detail: p }))}>{p.title}</button>)}
    </nav>
  );
}
