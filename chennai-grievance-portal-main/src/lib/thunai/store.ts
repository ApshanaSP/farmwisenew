/**
 * Thunai's files on this server: one memory file per Collector user (notes, habits, preferences, reminders, recent
 * commands) and the shared hash-chained audit trail. Both live in data/thunai/ (git-ignored), never in the shared store.
 * THUNAI_DIR moves them (tests use a temporary folder).
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { brokenAt, chain, GENESIS, type AuditEvent, type AuditLine } from "./audit";

const dir = () => process.env.THUNAI_DIR || path.join(process.cwd(), "data", "thunai");

export interface Note { id: string; text: string; at: string }
export interface Reminder { id: string; text: string; at: string; done: boolean }
export interface Memory {
  notes: Note[];
  /** heard words -> what the Collector meant (from ask-once answers and repeated corrections) */
  habits: Record<string, string>;
  /** corrections seen once, waiting for a second identical one before they become a habit */
  pending: Record<string, string>;
  prefs: { lang?: "en" | "ta"; mode?: "voice" | "visual" | "quiet"; rate?: number };
  reminders: Reminder[];
  recent: { text: string; at: string }[];
}

const EMPTY: Memory = { notes: [], habits: {}, pending: {}, prefs: {}, reminders: [], recent: [] };

function file(user: number) { return path.join(dir(), `memory-${Number(user)}.json`); }

export function readMemory(user: number): Memory {
  try {
    const m = JSON.parse(fs.readFileSync(file(user), "utf8"));
    return { ...EMPTY, ...m };
  } catch { return { ...EMPTY, habits: {}, pending: {}, prefs: {} }; }
}

function writeMemory(user: number, m: Memory) {
  fs.mkdirSync(dir(), { recursive: true });
  const f = file(user);
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(m, null, 1));
  fs.renameSync(`${f}.tmp`, f);
}

const id = () => crypto.randomBytes(6).toString("hex");
const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

export type MemoryOp =
  | { op: "note"; text: string }
  | { op: "forget"; id?: string; all?: boolean }
  | { op: "remind"; text: string; at: string }
  | { op: "reminderDone"; id: string }
  | { op: "habit"; heard: string; meant: string }
  | { op: "correction"; heard: string; meant: string }
  | { op: "prefs"; prefs: Memory["prefs"] }
  | { op: "recent"; text: string };

/** Apply one change and return the new memory. Corrections become a habit on the second identical one. */
export function changeMemory(user: number, op: MemoryOp, now = new Date()): Memory {
  const m = readMemory(user);
  const at = now.toISOString();
  switch (op.op) {
    case "note": m.notes = [...m.notes, { id: id(), text: clip(op.text, 300), at }].slice(-100); break;
    case "forget":
      if (op.all) Object.assign(m, { ...EMPTY, habits: {}, pending: {}, prefs: {}, notes: [], reminders: [], recent: [] });
      else if (op.id) { m.notes = m.notes.filter((n) => n.id !== op.id); m.reminders = m.reminders.filter((r) => r.id !== op.id); delete m.habits[op.id]; }
      else m.notes = m.notes.slice(0, -1);
      break;
    case "remind": m.reminders = [...m.reminders, { id: id(), text: clip(op.text, 200), at: op.at, done: false }].slice(-50); break;
    case "reminderDone": m.reminders = m.reminders.map((r) => (r.id === op.id ? { ...r, done: true } : r)); break;
    case "habit": m.habits[clip(op.heard.toLowerCase(), 60)] = clip(op.meant, 80); break;
    case "correction": {
      const k = clip(op.heard.toLowerCase(), 60);
      if (m.pending[k] === op.meant) { m.habits[k] = clip(op.meant, 80); delete m.pending[k]; } else m.pending[k] = clip(op.meant, 80);
      break;
    }
    case "prefs": m.prefs = { ...m.prefs, ...op.prefs }; break;
    case "recent": m.recent = [...m.recent, { text: clip(op.text, 200), at }].slice(-200); break;
  }
  writeMemory(user, m);
  return m;
}

// ------------------------------------------------------------------ audit --

const auditFile = () => path.join(dir(), "audit.jsonl");

export function readAudit(limit = 200): { lines: AuditLine[]; intact: boolean } {
  let all: AuditLine[] = [];
  try {
    all = fs.readFileSync(auditFile(), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as AuditLine);
  } catch { /* no trail yet */ }
  return { lines: all.slice(-limit), intact: brokenAt(all) === -1 };
}

export function appendAudit(e: Omit<AuditEvent, "id" | "at">, now = new Date()): AuditLine {
  fs.mkdirSync(dir(), { recursive: true });
  let prev = GENESIS;
  try {
    const text = fs.readFileSync(auditFile(), "utf8").trimEnd();
    const last = text.slice(text.lastIndexOf("\n") + 1);
    if (last) prev = (JSON.parse(last) as AuditLine).hash;
  } catch { /* first line */ }
  const line = chain({ id: id(), at: now.toISOString(), ...e }, prev);
  fs.appendFileSync(auditFile(), `${JSON.stringify(line)}\n`);
  return line;
}
