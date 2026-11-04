/**
 * The HUD's core, drawn on a 2D canvas: one audio-reactive element with a distinct shape for each state, so the state reads
 * without colour. No library. The glow is a gradient painted once to an offscreen canvas and stamped, because shadowBlur on
 * every frame would cost more than everything else here.
 *   idle: slow breathing          listening: rings follow the mic      hearing: rings open wide and brighten
 *   thinking: segments orbit      speaking: the disc pulses            holding: rings frozen, half open
 *   interrupted: collapses        offline: amber and still
 */
import type { CoreState } from "./hudstore";

const CYAN = "34, 211, 238", AMBER = "251, 191, 36";
const TAU = Math.PI * 2;

export interface CoreInput { state: CoreState; t: number; mic: number; voice: number; since: number }

let glow: HTMLCanvasElement | null = null;
let glowAmber: HTMLCanvasElement | null = null;
function makeGlow(rgb: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(128, 128, 8, 128, 128, 128);
  r.addColorStop(0, `rgba(${rgb}, .55)`);
  r.addColorStop(0.35, `rgba(${rgb}, .18)`);
  r.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  return c;
}

function ring(g: CanvasRenderingContext2D, r: number, width: number, rgb: string, alpha: number, from = 0, to = TAU) {
  g.beginPath();
  g.strokeStyle = `rgba(${rgb}, ${alpha})`;
  g.lineWidth = width;
  g.arc(0, 0, Math.max(0.5, r), from, to);
  g.stroke();
}

/** Draw one frame. The canvas is square, `size` CSS pixels at `dpr`. */
export function drawCore(g: CanvasRenderingContext2D, size: number, dpr: number, i: CoreInput) {
  const { state, t } = i;
  const rgb = state === "offline" ? AMBER : CYAN;
  const R = size / 2 - 6;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size, size);
  g.translate(size / 2, size / 2);
  const stamp = state === "offline" ? (glowAmber ??= makeGlow(AMBER)) : (glow ??= makeGlow(CYAN));
  const s = t / 1000;
  const breathe = 0.5 + 0.5 * Math.sin(s * 1.1);

  let disc = 0.2, glowSize = 0.7;
  switch (state) {
    case "off": case "idle":
      disc = 0.16 + 0.03 * breathe; glowSize = 0.55 + 0.1 * breathe;
      break;
    case "listening":
      disc = 0.17 + 0.06 * i.mic; glowSize = 0.6 + 0.3 * i.mic;
      break;
    case "hearing":
      disc = 0.2 + 0.1 * i.mic; glowSize = 0.8 + 0.3 * i.mic;
      break;
    case "thinking":
      disc = 0.2; glowSize = 0.8;
      break;
    case "speaking":
      disc = 0.22 + 0.32 * i.voice; glowSize = 0.8 + 0.6 * i.voice;
      break;
    case "holding":
      disc = 0.16; glowSize = 0.45;
      break;
    case "interrupted": {
      // collapses in 120 ms
      const k = Math.min(1, (t - i.since) / 120);
      disc = 0.25 * (1 - k) + 0.03; glowSize = 0.9 * (1 - k) + 0.1;
      break;
    }
    case "offline":
      disc = 0.14; glowSize = 0.4;
      break;
  }
  const gs = R * 2 * glowSize;
  g.globalCompositeOperation = "lighter";
  g.drawImage(stamp, -gs, -gs, gs * 2, gs * 2);
  g.globalCompositeOperation = "source-over";

  // the disc
  g.beginPath();
  g.fillStyle = `rgba(${rgb}, ${state === "holding" || state === "offline" ? 0.45 : 0.88})`;
  g.arc(0, 0, R * disc, 0, TAU);
  g.fill();

  switch (state) {
    case "off": case "idle":
      ring(g, R * (0.62 + 0.02 * breathe), 1.5, rgb, 0.35);
      break;
    case "listening": case "hearing": {
      const lv = i.mic * (state === "hearing" ? 1 : 0.7);
      const a = state === "hearing" ? 0.95 : 0.6;
      ring(g, R * (0.42 + 0.22 * lv), 2.5, rgb, a);
      ring(g, R * (0.6 + 0.26 * lv), 1.5, rgb, a * 0.7);
      ring(g, R * (0.78 + 0.2 * lv), 1, rgb, a * 0.4);
      break;
    }
    case "thinking": {
      // three arcs, each its own speed: orbiting, not filling
      for (const [r, speed, len, w] of [[0.5, 1.9, 1.1, 3], [0.68, -1.25, 1.6, 2], [0.86, 0.7, 0.8, 1.5]] as const) {
        const a = s * speed;
        ring(g, R * r, w, rgb, 0.9, a, a + len);
        ring(g, R * r, w, rgb, 0.45, a + Math.PI, a + Math.PI + len * 0.5);
      }
      break;
    }
    case "speaking":
      ring(g, R * (0.42 + 0.34 * i.voice), 2.5, rgb, 0.85);
      ring(g, R * 0.9, 1, rgb, 0.3);
      break;
    case "holding":
      // frozen, half open: the arcs do not move
      ring(g, R * 0.55, 3, rgb, 0.85, Math.PI * 1.15, Math.PI * 1.85);
      ring(g, R * 0.75, 2, rgb, 0.55, Math.PI * 1.15, Math.PI * 1.85);
      ring(g, R * 0.55, 3, rgb, 0.85, Math.PI * 0.15, Math.PI * 0.85);
      ring(g, R * 0.75, 2, rgb, 0.55, Math.PI * 0.15, Math.PI * 0.85);
      break;
    case "interrupted": {
      const k = Math.min(1, (t - i.since) / 120);
      ring(g, R * (0.7 * (1 - k) + 0.08), 2, rgb, 0.9 * (1 - k) + 0.1);
      break;
    }
    case "offline":
      ring(g, R * 0.6, 2, rgb, 0.7);
      ring(g, R * 0.8, 1, rgb, 0.4);
      break;
  }
}

/** One still frame for reduced motion: static rings, the state still readable by shape. */
export function drawStill(g: CanvasRenderingContext2D, size: number, dpr: number, state: CoreState) {
  drawCore(g, size, dpr, { state: state === "interrupted" ? "listening" : state, t: 0, mic: 0.5, voice: 0.4, since: -1000 });
}
