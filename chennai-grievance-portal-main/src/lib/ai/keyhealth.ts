/**
 * AI keys that a provider has refused (LT-29). A refused or expired key used to fail silently: the gateway moved on to
 * the next provider (or to the rules) and nobody knew why the answers had become plainer. Each refusal (HTTP 401 or 403,
 * Bedrock's AccessDenied / ExpiredToken) is remembered here until that provider answers again, and the console shows it
 * to the Collector as an admin banner with what to do (docs/AI_KEY_ROTATION.md).
 */
import { bedrockProblem } from "@/lib/ai/bedrock";

export interface KeyProblem { provider: string; reason: string; since: string }

declare global {
  // eslint-disable-next-line no-var
  var __keyProblems: Map<string, KeyProblem> | undefined;
}
const store = () => (global.__keyProblems ??= new Map());
const istNow = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 16).replace("T", " ");

const NAMES: Record<string, string> = { bedrock: "Amazon Bedrock", groq: "Groq", gemini: "Google Gemini", openai: "OpenAI" };

/** A provider refused its key. Kept until it answers again (the first refusal's time is kept). */
export function keyRefused(provider: string, status: number | string, message = ""): void {
  const reason = /expired/i.test(message) || status === "ExpiredTokenException" ? "key expired"
    : status === 401 || /invalid api key|unauthori[sz]ed|invalid.*key/i.test(message) ? "key not accepted (401)"
      : status === 403 || /forbidden|access ?denied/i.test(message) ? "key refused (403)" : `key refused (${status})`;
  const s = store(), old = s.get(provider);
  s.set(provider, { provider, reason, since: old?.since ?? istNow() });
}

/** A provider answered: its key works. */
export function keyWorks(provider: string): void { store().delete(provider); }

/** Is this failure a refused key (and not a busy or broken provider)? */
export const isKeyRefusal = (status: number | undefined, message: string) =>
  status === 401 || status === 403 || /invalid api key|api key not valid|unauthori[sz]ed|permission denied|expired/i.test(message);

/** Every key problem known now, Bedrock's own record included. */
export function keyProblems(): KeyProblem[] {
  const out = [...store().values()];
  const b = bedrockProblem();
  if (b && !out.some((p) => p.provider === "bedrock")) out.push({ provider: "bedrock", reason: b === "AWS keys expired" ? "key expired" : "key refused (403)", since: "" });
  return out;
}

/** The admin banner's text, or null when every key works. */
export function adminNotice(problems: KeyProblem[], available: boolean): { title: string; line: string } | null {
  if (!problems.length) return null;
  const list = problems.map((p) => `${NAMES[p.provider] ?? p.provider}: ${p.reason}${p.since ? ` since ${p.since.slice(11)}` : ""}`).join("; ");
  return {
    title: available ? "An AI key needs renewing" : "AI is off: every AI key was refused",
    line: `${list}. ${available ? "Another provider is answering for now." : "Ask District IQ and the AI write-ups use the rules only."} `
      + "To renew: run npm run ai:key in chennai-grievance-portal-main and paste the new key (see docs/AI_KEY_ROTATION.md); no restart is needed."
  };
}
