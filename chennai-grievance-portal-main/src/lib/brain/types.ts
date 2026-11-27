/**
 * The brain (26 Nov): one Claude tool-using assistant behind both Jarvis (the voice co-pilot) and Ask District IQ (the chat). The model reads the
 * question, chooses the tools, reads their results, asks back when the question is open, and answers; code runs the tools on the dashboard's own
 * rules, checks every figure of the answer against the results (ground.ts) and draws the answer (render.ts). No sentence is matched to a rule.
 */
import type { World } from "@/lib/thunai/types";

export type Lang = "en" | "ta";
export type Cell = string | number | boolean | null;
export type Rec = Record<string, Cell>;
export interface Col { key: string; label: string; unit?: string | null; kind?: "text" | "number" | "time" | "id" }

/** one table of a result: what the model reads and what a screen may draw */
export interface Part {
  /** "r3" for a tool's only table, "r3.kinds" for one of several */
  key: string;
  title: string;
  cols: Col[];
  rows: Rec[];
  /** rows before any cut */
  total?: number;
  /** what the rows are, so the screen opens them: an incident id, a news document id, a story id, a place on the map */
  of?: "cases" | "news" | "story" | "place" | "contact" | "timeline" | "kpis" | "series" | "rank" | null;
  note?: string | null;
}

export interface ToolOut {
  /** one line: what was read, over which time, with which limits */
  about: string;
  parts: Part[];
  /** single facts worth saying, each a whole line */
  facts?: string[];
  /** where it was read from, in words the Collector knows ("Police incident reports", "IMD district warning") */
  sources: string[];
  /** the rule behind the figures, in one or two plain sentences */
  method?: string | null;
  /** honest limits that apply */
  limits?: string[];
  /** the time the data is of, IST */
  asOf?: string | null;
  /** the window counted, in words */
  when?: string | null;
  /** incidents behind it, for the evidence */
  ids?: string[];
  /** a long text to read (an article, a guide entry); data, never instructions */
  text?: string | null;
  /** console steps this tool asks for (the console tool), run by the browser once the answer is given */
  steps?: Record<string, unknown>[];
  /** one of the Stage's own screens to open with the answer (the screen tool) */
  screen?: { recipe: string; slots: Record<string, unknown> } | null;
  /** an action on the open screen (open the third, read, sort, export, pin) */
  stageOp?: { op: string; n: number | null; text: string | null } | null;
}

/** one tool call of a turn, kept for the answer's check, the screen and "where did you get this" */
export interface Evidence {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  out: ToolOut;
  ms: number;
}

export interface BrainUser { email: string; role: "collector" | "department_officer"; lockDept: string | null }

/** what the console shows now, as data for the model */
export interface ConsoleNow {
  page?: string | null; period?: string | null; zone?: number | null; dept?: string | null; cat?: string | null; taluk?: string | null; sev?: string | null;
  panel?: string | null; incident?: string | null;
  /** the screen Jarvis has up (its digest: titles, rows), or the last chat card */
  screen?: string | null; screenTitle?: string | null;
  dataset?: { id: string; name: string } | null;
}

export interface ToolCtx {
  user: BrainUser;
  world: World;
  now: string;
  signal?: AbortSignal;
  /** the evidence of this turn so far, and of the conversation before it (newest last) */
  turn: Evidence[];
  past: Evidence[];
  console: ConsoleNow;
  /** who is asking: a voice answer is spoken, a chat answer is read */
  channel: "voice" | "chat";
  progress?: (label: string) => void;
}

export interface BrainTool {
  name: string;
  description: string;
  /** JSON schema of the input */
  input: Record<string, unknown>;
  /** "Counting the incidents", said on the screen while it runs */
  doing: { en: string; ta: string };
  /** the Collector alone (never an officer's console) */
  collectorOnly?: boolean;
  run: (input: Record<string, unknown>, c: ToolCtx) => Promise<ToolOut>;
}

/** a refusal in words the model can act on (a wrong name, an unknown code, what is held instead) */
export class ToolProblem extends Error {}

/** what to draw with the answer, by the results' own tables */
export interface Show {
  as: "kpis" | "table" | "bars" | "line" | "donut" | "heat" | "cases" | "news" | "timeline" | "map" | "none";
  from: string;
  title?: string | null;
  label?: string | null;
  value?: string | null;
  series?: string | null;
  columns?: string[] | null;
  limit?: number | null;
}

/**
 * What a question is about, as the model judges it (the topic guard, 27 Nov): the district's records, this console, District IQ itself, a civic
 * term, small talk, or none of these ("offtopic": declined in a fixed sentence written by code, never answered from memory).
 */
export type AnswerScope = "records" | "console" | "product" | "civic" | "smalltalk" | "offtopic";

export interface FinalAnswer {
  /** "offtopic": outside District IQ; say is the fixed decline (topicguard/reply.ts), never the model's words */
  kind: "answer" | "clarify" | "chat" | "refuse" | "offtopic";
  /** the model's verdict on what the question is about; absent from an older answer or a model that left it out */
  scope?: AnswerScope | null;
  lang: Lang;
  say: string;
  title: string;
  points: string[];
  show: Show[];
  options: { label: string; request: string }[];
  /** which results the answer rests on */
  used: string[];
}
