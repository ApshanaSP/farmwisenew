/**
 * The plain skeleton of a text, for the gates that decide "is this a forbidden order" or "is this a private question": invisible
 * marks out (every joiner too, which stripFormat keeps between Indic letters), fullwidth and other compatibility letters to
 * ordinary ones (NFKC), and the Cyrillic and Greek letters that look like Latin ones folded to the Latin letter. "Ѕend", "Ｓｅｎｄ",
 * "S​end" and "பு‍கார்" all read as the word they imitate (QA4 gate, redteam-final-6 and 7). The skeleton is only matched against,
 * never shown or stored. Small and free of other imports, so the console's own check of a button's name can use it too.
 */
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯︀-️﻿]|[\u{E0000}-\u{E007F}]/gu;

/** look-alike letters, written as pairs "look-alike" then "Latin letter" */
const LOOKALIKE: Record<string, string> = Object.fromEntries(
  ("А:A В:B Е:E К:K М:M Н:H О:O Р:P С:C Т:T Х:X У:Y Ѕ:S І:I Ј:J " +
   "а:a е:e о:o р:p с:c х:x у:y ѕ:s і:i ј:j ԁ:d ԛ:q ԝ:w һ:h ӏ:l ɡ:g ᴀ:a ᴅ:d ᴇ:e ᴍ:m ɴ:n ᴏ:o ᴘ:p ᴛ:t " +
   "Α:A Β:B Ε:E Ζ:Z Η:H Ι:I Κ:K Μ:M Ν:N Ο:O Ρ:P Τ:T Υ:Y Χ:X ο:o ν:v ρ:p ι:i κ:k υ:u ϲ:c ѵ:v").split(" ").map((p) => [p[0], p[2]])
);
const LOOKALIKE_RE = new RegExp(`[${Object.keys(LOOKALIKE).join("")}]`, "g");

export function skeleton(text: string): string {
  return String(text ?? "").replace(INVISIBLE, "").normalize("NFKC").replace(LOOKALIKE_RE, (c) => LOOKALIKE[c]);
}

/**
 * A button the model never presses for the Collector: one that sends, approves, confirms or deletes, or closes or accepts a case. The
 * console's Jarvis (Thunai.tsx) and the server's plan check (plan.ts) use this one list (before, the server's was shorter, redteam-final-6).
 */
export const DANGER_BUTTON = /send|approve|confirm|delete|remove|discard|reject|submit|verify|close it|work is done|accept|அனுப்பு|நீக்கு|உறுதி|ஒப்புதல்|ஏற்க|நிராகரி/i;
export const isDangerButton = (name: string): boolean => DANGER_BUTTON.test(skeleton(name));
