/**
 * Thunai's audit trail: one JSON line per event, each carrying the SHA-256 of the line before it, so any edit or
 * deletion breaks the chain. Text only: what was heard, the plan, the risk, approvals and the outcome. Never audio.
 */
import crypto from "crypto";

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  heard: string | null;
  plan: unknown;
  risk: "A" | "B" | "C";
  approval: { how: "none" | "tap" | "spoken"; count?: number } | null;
  outcome: string;
}

export interface AuditLine extends AuditEvent { prev: string; hash: string }

export const GENESIS = "0".repeat(64);

export function hashLine(e: AuditEvent, prev: string): string {
  return crypto.createHash("sha256").update(prev + JSON.stringify(e)).digest("hex");
}

export function chain(e: AuditEvent, prev: string): AuditLine {
  return { ...e, prev, hash: hashLine(e, prev) };
}

/** -1 when the chain is intact, else the index of the first line that does not fit. */
export function brokenAt(lines: AuditLine[]): number {
  let prev = GENESIS;
  for (let i = 0; i < lines.length; i++) {
    const { prev: p, hash, ...e } = lines[i];
    if (p !== prev || hash !== hashLine(e, p)) return i;
    prev = hash;
  }
  return -1;
}
