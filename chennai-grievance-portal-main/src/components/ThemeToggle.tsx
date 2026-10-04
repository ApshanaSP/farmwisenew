"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/** The page theme lives on <html data-theme>; the choice is shared with the Collector and Officer consoles ("diq-theme"). */
export function readTheme(): "dark" | "light" {
  try {
    return localStorage.getItem("diq-theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => setTheme(readTheme()), []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("diq-theme", next);
    } catch {
      /* not saved */
    }
  }

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button type="button" onClick={toggle} title={label} aria-label={label} className={`diq-tbtn w-9 px-0 ${className}`}>
      {theme === "dark" ? <Sun className="h-[17px] w-[17px]" aria-hidden="true" /> : <Moon className="h-[17px] w-[17px]" aria-hidden="true" />}
    </button>
  );
}
