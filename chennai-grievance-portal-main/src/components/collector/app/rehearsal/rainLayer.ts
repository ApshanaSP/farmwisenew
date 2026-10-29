/**
 * What the rain view (RainView.tsx) asks the Overview's map (SatMap.tsx) to draw: flood streets with how strongly each
 * is drawn, a dot per flooding report, what is chosen, and where the camera goes. The console's own pins step aside
 * while it is shown.
 */
/** where the rain view reads its data (here, not in RainView.tsx, so the console can name it without loading the view) */
export interface RainApi { state: string; rains: string; plan: string }
export const LIVE_RAIN_API: RainApi = { state: "/api/rehearsal/state", rains: "/api/rehearsal/rains", plan: "/api/rehearsal/plan" };
/** the dev preview's (/dev/collector): no sign-in, dry-run store only */
export const DEV_RAIN_API: RainApi = { state: "/api/rehearsal/dev", rains: "/api/rehearsal/dev?kind=rains", plan: "/api/rehearsal/dev?kind=plan" };
/** how the view opens: a rain to show first ("latest", an id, or null for all rains); a new seq opens it afresh */
export interface RainStart { rain: string | null; seq: number }

export interface RainLayer {
  /** flood streets: their lines, a point on them (a spot over the whole district), and how strongly each is drawn (0 faint … 3 strong) */
  streets: { key: string; lines: [number, number][][]; at: [number, number]; level: 0 | 1 | 2 | 3; tip: string }[];
  /** flooding reports: "repeat" stood on a street that had flooded in an earlier rain, "new" did not */
  dots: { id: string; lat: number; lon: number; tone: "repeat" | "new"; tip: string }[];
  /** what is chosen: drawn on top */
  sel: { kind: "street" | "report"; id: string } | null;
  /** the camera: each new seq frames these points (null: the whole district) */
  fit: { seq: number; pts: [number, number][] | null; maxZoom?: number };
  onPick: (kind: "street" | "report", id: string) => void;
}
