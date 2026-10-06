"use client";

/** The Studio before any data: what it does, the seven agents around the District IQ core, and samples to try. */
import type { SampleInfo } from "@/lib/studio/samples";
import { STEPS } from "@/lib/studio/types";
import { I } from "../icons";
import { AGENT_ICON } from "./Pipeline";

const FEATS = [
  { ic: "doc" as const, t: "Reads messy files", s: "Title rows, merged cells, Tamil headers, Indian dates" },
  { ic: "shield" as const, t: "Cleans and shows its work", s: "Duplicates, typos, outliers: every change listed" },
  { ic: "compare" as const, t: "Links with the district", s: "Compared with six months of incidents" },
  { ic: "chat" as const, t: "Answers in plain words", s: "Ask, pin, set alerts; every number computed" }
];

export default function Hero({ samples, onSample, busy }: { samples: SampleInfo[]; onSample: (k: string) => void; busy: boolean }) {
  return (
    <div className="ds-hero">
      <div className="ds-hero-l">
        <span className="ds-kicker"><i />AI Data Studio</span>
        <h2>Drop any department file.<span>Get the story, the map and a live dashboard.</span></h2>
        <p>Excel, CSV, JSON or a link: seven agents read it, clean it, map it to Chennai&apos;s wards, link it with the district&apos;s incidents and tell
          you what needs attention. The AI understands; every number is computed from the rows.</p>
        <div className="ds-feats">
          {FEATS.map((f, i) => (
            <div key={f.t} className="ds-feat" style={{ ["--i" as string]: i }}>
              <span><I n={f.ic} /></span><b>{f.t}</b><small>{f.s}</small>
            </div>
          ))}
        </div>
        <div className="ds-try">
          <h4>Try it with a sample <small>synthetic data on real Chennai wards</small></h4>
          <div className="ds-try-g">
            {samples.map((s, i) => (
              <button key={s.key} className="ds-sample" disabled={busy} onClick={() => onSample(s.key)} style={{ ["--i" as string]: i }}>
                <span className={`ds-sample-ic ${s.icon}`}><I n={s.icon} /></span>
                <span className="ds-sample-b"><b>{s.title}</b><small>{s.dept}</small><em>{s.blurb}</em></span>
                <span className="ds-fmt">{s.format}</span>
                <I n="right" className="ds-go" />
              </button>
            ))}
            {!samples.length && <p className="ds-muted">Samples are not on this server: run <code>node scripts/make-studio-samples.cjs</code>.</p>}
          </div>
        </div>
      </div>
      <div className="ds-hero-r" aria-hidden="true">
        <Constellation />
      </div>
    </div>
  );
}

function Constellation() {
  const R = 150, cx = 200, cy = 200;
  const nodes = STEPS.map((s, i) => {
    const a = (-90 + (360 / STEPS.length) * i) * (Math.PI / 180);
    return { ...s, x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), i };
  });
  return (
    <div className="ds-const">
      <svg viewBox="0 0 400 400">
        <defs>
          <radialGradient id="dsCore" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#A5B4FC" stopOpacity=".95" />
            <stop offset=".55" stopColor="#6366F1" stopOpacity=".55" />
            <stop offset="1" stopColor="#6366F1" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="dsSpoke" x1="0" x2="1">
            <stop offset="0" stopColor="#38BDF8" stopOpacity="0" />
            <stop offset=".5" stopColor="#38BDF8" stopOpacity=".9" />
            <stop offset="1" stopColor="#A78BFA" stopOpacity="0" />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={R} className="ds-orbit" />
        <circle cx={cx} cy={cy} r={R - 46} className="ds-orbit in" />
        {nodes.map((n) => (
          <g key={n.key}>
            <line x1={cx} y1={cy} x2={n.x} y2={n.y} className="ds-spoke" style={{ animationDelay: `${n.i * 0.35}s` }} />
            <circle r="3" className="ds-packet">
              <animateMotion dur={`${2.6 + (n.i % 3) * 0.4}s`} begin={`${n.i * 0.37}s`} repeatCount="indefinite" path={`M${n.x},${n.y} L${cx},${cy}`} />
            </circle>
          </g>
        ))}
        <circle r="4" className="ds-packet orb"><animateMotion dur="9s" repeatCount="indefinite" path={`M${cx},${cy - R} a${R},${R} 0 1,1 -0.01,0`} /></circle>
        <circle cx={cx} cy={cy} r="74" fill="url(#dsCore)" className="ds-core-glow" />
        <circle cx={cx} cy={cy} r="38" className="ds-core" />
      </svg>
      <div className="ds-core-l"><b>District<span>IQ</span></b><small>7 agents</small></div>
      {nodes.map((n) => (
        <div key={n.key} className="ds-cnode" style={{ left: `${(n.x / 400) * 100}%`, top: `${(n.y / 400) * 100}%`, ["--i" as string]: n.i }}>
          <span><I n={AGENT_ICON[n.key]} /></span><b>{n.agent}</b>
        </div>
      ))}
    </div>
  );
}
