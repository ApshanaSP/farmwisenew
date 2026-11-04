/**
 * What the rain view (RainView.tsx) asks the Overview's map (SatMap.tsx) to draw: flood streets with how strongly each
 * is drawn, a dot per flooding report, what is chosen, and where the camera goes. The console's own pins step aside
 * while it is shown.
 */
/** where the rain view reads its data (here, not in RainView.tsx, so the console can name it without loading the view) */
export interface RainApi { state: string; rains: string; plan: string; impacts: string; live: string; tiles: string }
export const LIVE_RAIN_API: RainApi = { state: "/api/rehearsal/state", rains: "/api/rehearsal/rains", plan: "/api/rehearsal/plan",
  impacts: "/api/rehearsal/impacts?lens=", live: "/api/rehearsal/traffic/live", tiles: "/api/rehearsal/traffic/{z}/{x}/{y}" };
/** the dev preview's (/dev/collector): no sign-in, dry-run store only */
export const DEV_RAIN_API: RainApi = { state: "/api/rehearsal/dev", rains: "/api/rehearsal/dev?kind=rains", plan: "/api/rehearsal/dev?kind=plan",
  impacts: "/api/rehearsal/dev?kind=impacts&lens=", live: "/api/rehearsal/dev?kind=live", tiles: "/api/rehearsal/traffic/{z}/{x}/{y}" };
/** how the view opens: a rain to show first ("latest", an id, or null for all rains), and a tab other than Flooding; a new seq opens it afresh */
export interface RainStart { rain: string | null; seq: number; lens?: "traffic" | "power" | "metro" }

/** which tab draws: its colours (flood blue, traffic orange, power amber, metro violet) */
export type RainTheme = "flood" | "traffic" | "power" | "metro";
export type RainPickKind = "street" | "report" | "point" | "area" | "line";

export interface RainLayer {
  theme?: RainTheme;
  /** streets or roads: their lines, a point on them (a spot over the whole district), and how strongly each is drawn (0 faint … 3 strong) */
  streets: { key: string; lines: [number, number][][]; at: [number, number]; level: 0 | 1 | 2 | 3; tip: string }[];
  /** reports: "repeat" stood on a street that had flooded in an earlier rain, "new" did not; the other tabs' reports by source */
  dots: { id: string; lat: number; lon: number; tone: "repeat" | "new" | "citizen" | "news" | "sample"; tip: string }[];
  /** wards shaded by how often they were hit (Power) */
  areas?: { key: string; rings: [number, number][][]; level: 0 | 1 | 2 | 3; tip: string }[];
  /** places hit (underpasses, stations): a letter in a shape, strong by level */
  points?: { key: string; lat: number; lon: number; level: 0 | 1 | 2 | 3; glyph: string; tip: string }[];
  /** places for orientation only (substations, stations not hit, underpasses with no report) */
  context?: { id: string; lat: number; lon: number; glyph: string; tip: string }[];
  /** metro and suburban lines, in their own colours; with a level they are Metro's places (0 grey: not hit in the
   *  chosen rain, 1–3 thicker the worse), and clicking one picks it */
  rails?: { id: string; color: string; path: [number, number][]; tip: string; level?: 0 | 1 | 2 | 3 }[];
  /** live traffic-flow tiles (URL template), and live incidents */
  tiles?: string | null;
  live?: { id: string; path: [number, number][]; tip: string; flooding: boolean }[];
  /** what is chosen: drawn on top */
  sel: { kind: RainPickKind; id: string } | null;
  /** the camera: each new seq frames these points (null: the whole district) */
  fit: { seq: number; pts: [number, number][] | null; maxZoom?: number };
  onPick: (kind: RainPickKind, id: string) => void;
}
