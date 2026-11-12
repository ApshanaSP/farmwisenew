/**
 * The site's language, English or Tamil, chosen by the person and remembered in this browser ("diq-lang"). Every page
 * reads it; the Translator (components/i18n/Translator.tsx) turns the page's words into Tamil, and Jarvis listens and
 * answers in it. Changing it fires "diq:lang" so open screens follow at once, with no reload.
 */
import { useEffect, useState } from "react";

export type UiLang = "en" | "ta";
const KEY = "diq-lang";

export function getLang(): UiLang {
  if (typeof window === "undefined") return "en";
  try { return localStorage.getItem(KEY) === "ta" ? "ta" : "en"; } catch { return "en"; }
}

export function setLang(l: UiLang) {
  try { localStorage.setItem(KEY, l); } catch { /* not saved */ }
  document.documentElement.lang = l === "ta" ? "ta" : "en";
  document.documentElement.dataset.lang = l;
  window.dispatchEvent(new CustomEvent("diq:lang", { detail: l }));
}

/**
 * The language, read at the first render, for a component that is mounted after the page has hydrated (a box opened by a click, a note shown when data arrives): `useLang` starts as English and
 * switches a frame later, so such a component showed its English words first (SK2-12). Not for a component the server renders at first paint: it would not match what the server sent.
 */
export function useLangNow(): UiLang {
  const [l, setL] = useState<UiLang>(() => getLang());
  useEffect(() => {
    const on = (e: Event) => setL((e as CustomEvent<UiLang>).detail === "ta" ? "ta" : "en");
    window.addEventListener("diq:lang", on);
    return () => window.removeEventListener("diq:lang", on);
  }, []);
  return l;
}

/** The current language and a setter; follows changes made anywhere on the page. */
export function useLang(): [UiLang, (l: UiLang) => void] {
  const [l, setL] = useState<UiLang>("en");
  useEffect(() => {
    setL(getLang());
    const on = (e: Event) => setL((e as CustomEvent<UiLang>).detail === "ta" ? "ta" : "en");
    window.addEventListener("diq:lang", on);
    return () => window.removeEventListener("diq:lang", on);
  }, []);
  return [l, setLang];
}
