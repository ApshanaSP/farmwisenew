/**
 * District IQ icons: one family (Lucide), one stroke language. Screens ask for an icon by its role ("pin", "news"),
 * so the set can change in one place. Decorative only (aria-hidden); text carries the meaning.
 */
import {
  Activity, ArrowDown, ArrowRight, ArrowUp, Bell, Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheckBig, Clock3, Construction,
  ChartBarBig, ChartLine, ChartNoAxesCombined, ChartPie, CloudRain, Copy, CornerUpRight, Download, Droplets, Ellipsis, ExternalLink, FileText,
  GitCompareArrows, HeartPulse, House, Image, Info, Landmark, Layers, LayoutGrid, Leaf, Lightbulb, ListChecks, Map, MapPin, Maximize2, Menu,
  MessageSquareText, Mic, Newspaper, Phone, Play, Plus, RadioTower, Radar, RefreshCw, ScrollText, Search, SendHorizontal, Shield, SlidersHorizontal,
  Smartphone, Square, Table2, Target, ThumbsDown, ThumbsUp, Timer, Trash, TriangleAlert, Tv, User, Users, Volume2, Wind, X, Zap, Sun, Moon, type LucideIcon
} from "lucide-react";

const ICONS = {
  home: House, gov: Landmark, bell: Bell, chat: MessageSquareText, doc: FileText, check: Check, checkc: CircleCheckBig, map: Map, search: Search,
  download: Download, pin: MapPin, alert: TriangleAlert, clock: Clock3, user: User, drop: Droplets, bulb: Lightbulb, trash: Trash, health: HeartPulse,
  shield: Shield, leaf: Leaf, scroll: ScrollText, cone: Construction, chevr: ChevronRight, chevd: ChevronDown, chevl: ChevronLeft, x: X, up: ArrowUp,
  down: ArrowDown, right: ArrowRight, dots: Ellipsis, cloud: CloudRain, wind: Wind, chart: ChartNoAxesCombined, tasks: ListChecks, phone: Phone,
  menu: Menu, ext: ExternalLink, photo: Image, news: Newspaper, tv: Tv, sensor: RadioTower, social: Users, app: Smartphone, esc: CornerUpRight,
  copy: Copy, refresh: RefreshCw, plus: Plus, send: SendHorizontal, spark: Radar, layers: Layers, bolt: Zap, expand: Maximize2, timer: Timer,
  sliders: SlidersHorizontal, target: Target, thumbUp: ThumbsUp, thumbDown: ThumbsDown, table: Table2, donut: ChartPie, line: ChartLine,
  barH: ChartBarBig, stop: Square, info: Info, grid: LayoutGrid, compare: GitCompareArrows, play: Play, bookmark: Bookmark, mic: Mic, volume: Volume2,
  pulse: Activity, sun: Sun, moon: Moon
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function I({ n, className = "" }: { n: IconName; className?: string }) {
  const C = ICONS[n] ?? Info;
  return <C className={`ic ${className}`} aria-hidden="true" focusable="false" strokeWidth={1.75} absoluteStrokeWidth={false} />;
}
