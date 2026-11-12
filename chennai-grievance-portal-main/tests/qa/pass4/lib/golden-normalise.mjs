// QA pass 4, golden master: the normalisation rules. Each rule is listed, with its reason, in docs/qa/pass4/golden/NORMALISE.md.
// Figures, dates and text are never touched here. Add a rule only with a stated reason.

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/g;

/** UUIDs that are fixed: those in the pinned snapshot, and the made-up one the plan asks for. Only a UUID made during the run is random. */
export const uuidsIn = (text) => new Set(text.match(UUID) ?? []);

/**
 * The rules, in order:
 *  captured  values a write made up at random in this run (a complaint code, a photo folder, a dataset id), replaced everywhere after they appear
 *  uuid      request, session, message and card ids (crypto.randomUUID), numbered by first appearance in the body; a UUID in `known` is real data, and stays
 *  grant     the "Confirm it's you" ticket, a signed token
 */
export function normaliseText(text, captured = new Map(), known = new Set()) {
  let out = text;
  for (const [value, name] of captured) if (out.includes(value)) out = out.split(value).join(name);
  const seen = new Map();
  out = out.replace(UUID, (m) => {
    if (known.has(m)) return m;
    if (!seen.has(m)) seen.set(m, `<uuid-${seen.size + 1}>`);
    return seen.get(m);
  });
  return out.replace(/("grant"\s*:\s*")[^"]+(")/g, "$1<grant>$2");
}

/** For what goes in a committed file (the manifest): a test account's email or mobile never does. Bodies, which stay gitignored, are not masked. */
export const maskPersonal = (text) => String(text).replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "(email)").replace(/(?<![\d-])[6-9]\d{9}(?!\d)/g, "(mobile)");

/** Is this response text (and so normalised and diffable)? Anything else is compared by its bytes alone. */
export const isText = (contentType) => !contentType || /json|text|csv|xml|event-stream|javascript/i.test(contentType);
