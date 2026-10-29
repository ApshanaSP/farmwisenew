"use client";

import { useEffect, useState } from "react";
import type { MapGeo } from "@/lib/collector/geo";
import RainRehearsal, { type Endpoints } from "@/components/collector/app/rehearsal/RainRehearsal";
import { BeforeRainTasks } from "@/components/officer/BeforeRainTasks";
import "@/components/collector/app/collector.css";
import "@/components/collector/app/tokens.css";
import "@/components/collector/app/motionfx.css";
import "leaflet/dist/leaflet.css";

const DEV: Endpoints = {
  state: (q) => `/api/rehearsal/dev?${q}`,
  reach: (q) => `/api/rehearsal/dev?kind=reach&${q}`,
  plan: "/api/rehearsal/dev?kind=plan"
};

export default function Preview() {
  const [geo, setGeo] = useState<MapGeo | null>(null);
  const [open, setOpen] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  // the query string is read after the first render, so the server's HTML and the browser's match
  const [p, setP] = useState<URLSearchParams | null>(null);
  useEffect(() => { setP(new URLSearchParams(window.location.search)); fetch("/api/rehearsal/dev?kind=geo").then((r) => r.json()).then(setGeo).catch(() => undefined); }, []);
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
        <div className="rr-host" style={{ position: "relative", width: "calc(100vw - 24px)", height: "min(608px, calc(100vh - 24px))" }}>
          {open ? <RainRehearsal geo={geo} init={{ replay: p.get("replay"), manual: p.get("manual") === "1" }} onClose={() => setOpen(false)} endpoints={DEV} dev
            toast={(m) => { setToast(m); setTimeout(() => setToast(null), 5000); }} onOpenIncident={(id) => setToast(`Would open ${id}`)} />
            : <button onClick={() => setOpen(true)}>Open the rehearsal</button>}
        </div>
      )}
      {toast && <div style={{ position: "fixed", bottom: 16, left: 16, background: "#0F172A", color: "#fff", padding: "8px 12px", borderRadius: 10, fontSize: 13, zIndex: 9999 }}>{toast}</div>}
    </div>
  );
}
