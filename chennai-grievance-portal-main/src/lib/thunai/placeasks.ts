/**
 * Two questions the owner asked for on 28-29 Nov that the models answered one way one time and another way the next, put into one fixed
 * shape by code before any model sees them. Pure: no store, so Jarvis's browser code and the server's answer engine share it.
 *
 * - "Which police station is responsible for Avadi?" / "police station for Avadi" / "Avadi police station": the store holds where police
 *   stations are, not the boundaries each one covers (knowledge/data.md), so the question is always asked of the map as "the nearest
 *   police stations to Avadi". The models sometimes declined it as another city's.
 * - "Open incident INC-20261128-6B8086": opens that incident (the console's own incident pop-up), with no model.
 */

const POLICE = /\b(?:which|what)\s+police\s+station\s+(?:is\s+)?(?:responsible\s+for|covers|handles|is\s+for|for|in|at|near)\s+(.+?)[?.!]*$|\bpolice\s+station\s+(?:responsible\s+for|for|covering|in|at|near(?:est\s+to)?)\s+(.+?)[?.!]*$|^(?:jarvis[,\s]+)?(.+?)\s+police\s+station[?.!]*$/i;

/** "Which police station is responsible for Avadi?" asked as the map's question, or null */
export function policeAsk(text: string): string | null {
  const t = text.trim().replace(/^(?:hi|hey|ok|okay)?\s*jarvis[,\s]*/i, "");
  const m = POLICE.exec(t);
  const place = (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").replace(/^(?:the\s+)?(?:area\s+of\s+)?/i, "").replace(/\s+(?:area|locality|region)$/i, "").trim();
  if (!place || place.length < 3 || place.split(/\s+/).length > 5 || /^(which|what|the|a|nearest)$/i.test(place)) return null;
  return `Which are the nearest police stations to ${place}, with their distances? Say that the station's own jurisdiction boundary is not held.`;
}

const OPEN_INC = /\b(?:open|show(?:\s+me)?|display|pull\s+up|bring\s+up)\b.*?\b(INC-[0-9]{8}-[A-Z0-9]{4,10}(?:-\d{1,3})?)\b/i;
/** the incident id of "open incident INC-…", or null */
export function openIncidentAsk(text: string): string | null {
  const m = OPEN_INC.exec(text.trim());
  return m ? m[1].toUpperCase() : null;
}
