"use client";

import { useEffect, useState } from "react";
import { BeforeRainTasks } from "@/components/officer/BeforeRainTasks";
import "@/components/collector/app/collector.css";
import "@/components/collector/app/tokens.css";
import "@/components/collector/app/motionfx.css";

/** The officer's before-rain tasks card (?officer=GCC-SWD). Rain & flooding itself is on the Collector's map: /dev/collector?rain=1. */
export default function Preview() {
  // the query string is read after the first render, so the server's HTML and the browser's match
  const [p, setP] = useState<URLSearchParams | null>(null);
  useEffect(() => { setP(new URLSearchParams(window.location.search)); }, []);
  if (!p) return null;
  const theme = p.get("theme") === "dark" ? "dark" : "light";
  const officer = p.get("officer");
  return (
    <div className="dic" data-theme={theme} style={{ minHeight: "100vh", background: "var(--bg)", padding: 12 }}>
      {officer ? (
        <div style={{ maxWidth: 460 }}>
          <BeforeRainTasks dev={officer} />
        </div>
      ) : (
        <p style={{ color: "var(--text-2)" }}>
          Rain &amp; flooding is on the Collector&apos;s Overview map: <a href="/dev/collector?rain=1">/dev/collector?rain=1</a>. The officer&apos;s before-rain card: <a href="?officer=GCC-SWD">?officer=GCC-SWD</a>.
        </p>
      )}
    </div>
  );
}
