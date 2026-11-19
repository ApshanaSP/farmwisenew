/**
 * The HUD's core, drawn on a small 2D canvas docked in the bar, and the one state machine that drives every visual (v4, Pillar
 * 6): each state gives a speed, an intensity, the bar's glow and a frame rate, from one smoothed audio level (the microphone's
 * while it listens, the voice's while it speaks). The frame rate is a decision, not a constant: about 15 fps at rest, 60 while it
 * speaks, and no loop at all when nothing on it moves (holding, offline, off, a finished interruption, a hidden tab, reduced
 * motion). No library. The glow is a gradient painted once to an offscreen canvas and stamped: shadowBlur per frame costs more.
 *   idle: slow breathing          listening: rings follow the mic      hearing: rings open wide and brighten
 *   thinking: segments orbit      acting: one arc sweeps a full ring   speaking: the disc pulses with the voice
 *   holding: rings frozen, half open      interrupted: collapses, then still      offline: amber, dashed and still
 */
import type { CoreState, HudState } from "./hudstore";

export type VisualState = CoreState | "acting";
export interface Visual {
  state: VisualState;
  /** how fast its parts move (0: still) */
  speed: number;
  /** how bright the core is, 0..1 */
  intensity: number;
  /** the smoothed audio level it follows, 0..1 (0 in a state that does not follow one) */
  level: number;
  /** frames a second it needs (0: one frame, then the loop stops) */
  fps: number;
  /** the bar border's glow, 0..1 */
  glow: number;
}

const TABLE: Record<VisualState, { speed: number; intensity: number; fps: number; glow: number; follows: boolean }> = {
  off:         { speed: 0,    intensity: 0.35, fps: 0,  glow: 0,    follows: false },
  idle:        { speed: 0.6,  intensity: 0.5,  fps: 15, glow: 0,    follows: false },
  listening:   { speed: 0.6,  intensity: 0.65, fps: 30, glow: 0.2,  follows: true },
  hearing:     { speed: 1,    intensity: 0.9,  fps: 30, glow: 0.5,  follows: true },
  thinking:    { speed: 1,    intensity: 0.8,  fps: 30, glow: 0.55, follows: false },
  acting:      { speed: 1.4,  intensity: 0.9,  fps: 30, glow: 0.75, follows: false },
  speaking:    { speed: 1,    intensity: 1,    fps: 60, glow: 0.4,  follows: true },
  holding:     { speed: 0,    intensity: 0.55, fps: 0,  glow: 0.35, follows: false },
  interrupted: { speed: 0,    intensity: 0.7,  fps: 60, glow: 0.6,  follows: false },
  offline:     { speed: 0,    intensity: 0.45, fps: 0,  glow: 0.5,  follows: false }
};
/** below this the microphone is quiet: a listening core drops to the resting rate */
export const QUIET = 0.03;
/** an interruption collapses in 120 ms; after this the core is still */
export const COLLAPSE_MS = 160;

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/** The visual state from the store: a plan step running in the console is "acting"; a muted microphone is still. */
export function visualStateOf(s: Pick<HudState, "mode" | "core"> & { acting?: boolean }): VisualState {
  if (s.core === "thinking" && s.acting) return "acting";
  if (s.mode === "muted" && s.core === "idle") return "off";
  return s.core;
}

/** The one state machine: a state and the smoothed level give everything the core and the bar's glow draw. */
export function visualOf(state: VisualState, level: number): Visual {
  const t = TABLE[state] ?? TABLE.idle;
  const lv = t.follows ? clamp01(level) : 0;
  const fps = state === "listening" && lv < QUIET ? 15 : t.fps;
  const glow = clamp01(t.glow + (t.follows ? (1 - t.glow) * 0.75 * lv : 0));
  return { state, speed: t.speed, intensity: t.intensity, level: lv, fps, glow };
}

/**
 * When to draw the next frame, in ms, or null to stop the loop (a state change starts it again). Hidden tab and reduced motion
 * stop it; so does a state where nothing moves, and an interruption once it has collapsed.
 */
export function frameDelay(v: Visual, o: { hidden: boolean; reduced: boolean; sinceMs: number }): number | null {
  if (o.hidden || o.reduced || v.fps <= 0) return null;
  if (v.state === "interrupted" && o.sinceMs > COLLAPSE_MS) return null;
  return 1000 / v.fps;
}

/** One smoothed level: it rises fast (40 ms) and falls slowly (140 ms), so the rings follow speech without flicker. */
export function smoothLevel(prev: number, raw: number, dtMs: number): number {
  const p = clamp01(prev), r = clamp01(raw);
  const tau = r > p ? 40 : 140;
  const k = 1 - Math.exp(-Math.max(0, Math.min(250, dtMs)) / tau);
  return clamp01(p + (r - p) * k);
}

/** The bar's glow this frame: steady, except a slow swell while it works (a real state, never shown on an instant answer). */
export function glowAt(v: Visual, phase: number): number {
  if (v.state === "thinking" || v.state === "acting") return clamp01(v.glow * (0.8 + 0.2 * Math.sin(phase * Math.PI)));
  return v.glow;
}

const TAU = Math.PI * 2;
const RGB = {
  dark: { cyan: "34, 211, 238", amber: "251, 191, 36" },
  // on a light page the light cyan washes out: the console's own darker cyan and amber, no navy disc behind them
  light: { cyan: "8, 145, 178", amber: "180, 83, 9" }
};
const stamps = new Map<string, HTMLCanvasElement>();
function stampOf(rgb: string): HTMLCanvasElement {
  let c = stamps.get(rgb);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  r.addColorStop(0, `rgba(${rgb}, .5)`);
  r.addColorStop(0.35, `rgba(${rgb}, .16)`);
  r.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  stamps.set(rgb, c);
  return c;
}

export interface CoreInput {
  v: Visual;
  /** the motion's phase, in seconds times the speed (so a change of speed does not jump) */
  ph: number;
  /** now, and when the state began (for the interruption's collapse) */
  t: number;
  since: number;
  tone: "light" | "dark";
}

/** Draw one frame. The canvas is square, `size` CSS pixels at `dpr`. */
export function drawCore(g: CanvasRenderingContext2D, size: number, dpr: number, i: CoreInput) {
  const { v, ph } = i;
  const state = v.state;
  const pal = RGB[i.tone];
  const rgb = state === "offline" ? pal.amber : pal.cyan;
  const R = size / 2 - Math.max(2, size * 0.05);
  // line widths follow the size: the core is 40 px in the bar
  const k = Math.min(2, Math.max(0.6, size / 120));
  const ring = (r: number, w: number, alpha: number, from = 0, to = TAU) => {
    g.beginPath();
    g.strokeStyle = `rgba(${rgb}, ${alpha * (0.4 + 0.6 * v.intensity)})`;
    g.lineWidth = w * k;
    g.arc(0, 0, Math.max(0.5, r), from, to);
    g.stroke();
  };
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size, size);
  g.translate(size / 2, size / 2);
  const breathe = 0.5 + 0.5 * Math.sin(ph * 1.8);
  const lv = v.level;

  let disc = 0.2, glowSize = 0.7;
  const collapse = Math.min(1, Math.max(0, (i.t - i.since) / 120));
  switch (state) {
    case "off": disc = 0.15; glowSize = 0.4; break;
    case "idle": disc = 0.16 + 0.03 * breathe; glowSize = 0.55 + 0.1 * breathe; break;
    case "listening": disc = 0.17 + 0.08 * lv; glowSize = 0.6 + 0.3 * lv; break;
    case "hearing": disc = 0.2 + 0.12 * lv; glowSize = 0.8 + 0.3 * lv; break;
    case "thinking": disc = 0.2; glowSize = 0.8; break;
    case "acting": disc = 0.22; glowSize = 0.85; break;
    case "speaking": disc = 0.22 + 0.3 * lv; glowSize = 0.8 + 0.5 * lv; break;
    case "holding": disc = 0.16; glowSize = 0.45; break;
    case "interrupted": disc = 0.25 * (1 - collapse) + 0.05; glowSize = 0.9 * (1 - collapse) + 0.15; break;
    case "offline": disc = 0.14; glowSize = 0.4; break;
  }
  // the stamp stays inside the canvas: a glow clipped by the canvas edge shows as a hard square
  const gs = Math.min(size / 2, R * 2 * glowSize);
  g.globalAlpha = v.intensity * (i.tone === "light" ? 0.7 : 1);
  g.globalCompositeOperation = i.tone === "dark" ? "lighter" : "source-over";
  g.drawImage(stampOf(rgb), -gs, -gs, gs * 2, gs * 2);
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;

  g.beginPath();
  g.fillStyle = `rgba(${rgb}, ${state === "holding" || state === "offline" || state === "off" ? 0.5 : 0.9})`;
  g.arc(0, 0, R * disc, 0, TAU);
  g.fill();

  switch (state) {
    case "off": case "idle":
      ring(R * (0.62 + 0.02 * breathe), 1.5, state === "off" ? 0.3 : 0.45);
      break;
    case "listening": case "hearing": {
      const l = lv * (state === "hearing" ? 1 : 0.7);
      const a = state === "hearing" ? 0.95 : 0.65;
      ring(R * (0.42 + 0.22 * l), 2.5, a);
      ring(R * (0.6 + 0.26 * l), 1.5, a * 0.7);
      ring(R * (0.78 + 0.2 * l), 1, a * 0.4);
      break;
    }
    case "thinking":
      // three arcs, each its own speed: orbiting, not filling
      for (const [r, sp, len, w] of [[0.5, 1.9, 1.1, 3], [0.7, -1.25, 1.6, 2], [0.9, 0.7, 0.8, 1.5]] as const) {
        const a = ph * sp;
        ring(R * r, w, 0.9, a, a + len);
        ring(R * r, w, 0.45, a + Math.PI, a + Math.PI + len * 0.5);
      }
      break;
    case "acting": {
      // doing, not deciding: one bright arc sweeps a whole ring, round and round
      ring(R * 0.7, 2, 0.3);
      const a = ph * 2.4;
      ring(R * 0.7, 3, 0.95, a, a + 1.4);
      ring(R * 0.45, 2, 0.7);
      break;
    }
    case "speaking":
      ring(R * (0.42 + 0.34 * lv), 2.5, 0.85);
      ring(R * 0.9, 1, 0.3);
      break;
    case "holding":
      // frozen, half open: the arcs do not move
      ring(R * 0.55, 3, 0.85, Math.PI * 1.15, Math.PI * 1.85);
      ring(R * 0.78, 2, 0.55, Math.PI * 1.15, Math.PI * 1.85);
      ring(R * 0.55, 3, 0.85, Math.PI * 0.15, Math.PI * 0.85);
      ring(R * 0.78, 2, 0.55, Math.PI * 0.15, Math.PI * 0.85);
      break;
    case "interrupted":
      ring(R * (0.7 * (1 - collapse) + 0.1), 2, 0.9 * (1 - collapse) + 0.15);
      break;
    case "offline":
      // still, and broken: a dashed ring, so it reads without the colour
      g.setLineDash([3, 5]);
      ring(R * 0.66, 2, 0.85);
      g.setLineDash([]);
      break;
  }
}
