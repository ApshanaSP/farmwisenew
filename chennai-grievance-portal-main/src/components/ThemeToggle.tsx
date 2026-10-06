"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Moon, Sun } from "lucide-react";

/** The page theme lives on <html data-theme>; the choice is shared with the Collector and Officer consoles ("diq-theme"). */
export function readTheme(): "dark" | "light" {
  try {
    return localStorage.getItem("diq-theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Sun <-> moon: the icon turns and swaps when the theme changes. */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("light");
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
    <button type="button" onClick={toggle} title={label} aria-label={label} className={`diq-tbtn w-9 overflow-hidden px-0 ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={theme} className="grid place-items-center" initial={{ rotate: -90, scale: 0.4, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0.4, opacity: 0 }} transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}>
          {theme === "dark" ? <Sun className="h-[17px] w-[17px]" aria-hidden="true" /> : <Moon className="h-[17px] w-[17px]" aria-hidden="true" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
