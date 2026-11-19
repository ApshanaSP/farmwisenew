"use client";

/**
 * Ask the Map's state kept inside its components, reached by voice (v10, docs/jarvis/v10-research/50-askmap-anatomy.md 4.2): the Layers menu,
 * the heat view and the base map (useMapChrome), the Export sheet and the Send dialog (AskOverlay), the suggestions tray (AskMapPanel) and Rain &
 * flooding's tab and rain (RainView). Jarvis holds the console's `mapAsk` for everything else and calls it directly.
 *
 * One window event, named like the console's others ("diq:rehearsal", "diq:studio-spot"): `diq:map-cmd` with `{ op, args, reply }`. The part that
 * owns the state listens for its own ops and answers through `reply`; listeners run synchronously inside dispatchEvent, so `mapCmd` knows at
 * once whether that part is on screen (null: nothing answered, open the map first).
 */
export type BridgeOp = "layer" | "heat" | "base" | "exportSheet" | "send" | "tray" | "rain";
export interface BridgeReply { ok: boolean; why?: string; state?: Record<string, unknown> }
export interface BridgeDetail { op: BridgeOp; args: Record<string, unknown>; reply: (r: BridgeReply) => void }
export const MAP_CMD = "diq:map-cmd";

type Win = Pick<Window, "addEventListener" | "removeEventListener" | "dispatchEvent">;
const win = (): Win | null => (typeof window !== "undefined" ? window : null);

/** Hands one op to the part of Ask the Map that owns its state; its answer, or null when no such part is mounted. */
export function mapCmd(op: BridgeOp, args: Record<string, unknown> = {}, w: Win | null = win()): BridgeReply | null {
  if (!w) return null;
  let reply: BridgeReply | null = null;
  const detail: BridgeDetail = { op, args, reply: (r) => { if (!reply) reply = r; } };
  w.dispatchEvent(new CustomEvent(MAP_CMD, { detail }));
  return reply;
}

/** For an owner's useEffect: answers its own ops, returns the cleanup. */
export function onMapCmd(ops: BridgeOp[], handle: (op: BridgeOp, args: Record<string, unknown>) => BridgeReply, w: Win | null = win()): () => void {
  if (!w) return () => undefined;
  const f = (e: Event) => {
    const d = (e as CustomEvent<BridgeDetail>).detail;
    if (!d || !ops.includes(d.op)) return;
    d.reply(handle(d.op, d.args ?? {}));
  };
  w.addEventListener(MAP_CMD, f);
  return () => w.removeEventListener(MAP_CMD, f);
}
