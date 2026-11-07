"use client";
/**
 * The top bar's tools in one labelled menu (the bar used to carry five bare icons): Export, Workspaces, Customize,
 * light or dark, and the language. Each row says what it does, so nothing has to be guessed from an icon. The language
 * also has its own one-tap switch next to the menu (LangSwitch), since a Tamil reader looks for it first.
 */
import { useEffect, useRef } from "react";
import { I, type IconName } from "./icons";
import { useLang } from "@/lib/i18n/lang";

export interface TopMenuItem { key: string; icon: IconName; label: string; sub?: string; on?: boolean; run: () => void }

export function TopMenu({ open, onToggle, items }: { open: boolean; onToggle: () => void; items: TopMenuItem[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [lang, setLang] = useLang();
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onToggle(); };
    window.addEventListener("keydown", k);
    box.current?.querySelector<HTMLElement>("button.tm-i")?.focus();
    return () => window.removeEventListener("keydown", k);
  }, [open, onToggle]);
  const on = items.filter((i) => i.on).length;
  return (
    <div className="rel" ref={box}>
      <button className={`tbtn tm-btn${open ? " on" : ""}`} data-pop onClick={onToggle} aria-haspopup="menu" aria-expanded={open} title="Export, workspaces, customize, theme and language">
        <I n="grid" /><span>Menu</span><I n="chevd" className="tm-chev" />{on > 0 && <em className="tm-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="pop tm-pop" role="menu" data-pop>
          {items.map((it) => (
            <button key={it.key} role="menuitem" className={`pop-i tm-i${it.on ? " on" : ""}`} onClick={() => { onToggle(); it.run(); }}>
              <span className="tm-ic"><I n={it.icon} /></span><span><b>{it.label}</b>{it.sub && <small>{it.sub}</small>}</span>
            </button>
          ))}
          <div className="tm-lang" role="group" aria-label="Language">
            <span className="tm-ic"><I n="globe" /></span>
            <span className="tm-lang-l"><b>Language</b><small>The whole site, and Jarvis</small></span>
            <span className="tm-seg" translate="no">
              <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")} aria-pressed={lang === "en"}>English</button>
              <button className={lang === "ta" ? "on" : ""} onClick={() => setLang("ta")} aria-pressed={lang === "ta"}>தமிழ்</button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** One tap between English and Tamil, written in the language it switches to. */
export function LangSwitch({ compact }: { compact?: boolean }) {
  const [lang, setLang] = useLang();
  return (
    <button className={`tbtn lang-sw${compact ? " compact" : ""}`} translate="no" onClick={() => setLang(lang === "ta" ? "en" : "ta")}
      title={lang === "ta" ? "Switch the site to English" : "தளத்தைத் தமிழில் காட்டு (Tamil)"} aria-label={lang === "ta" ? "English: switch the site to English" : "தமிழ்: switch the site to Tamil"}>
      <span className="lang-a" aria-hidden="true" data-g={lang === "ta" ? "A" : "அ"} /><span>{lang === "ta" ? "English" : "தமிழ்"}</span>
    </button>
  );
}
