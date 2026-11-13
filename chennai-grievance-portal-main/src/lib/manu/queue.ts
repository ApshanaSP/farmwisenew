/**
 * What the citizen who filed a complaint is told when it is not in the department officer's queue yet: on the pipeline's store (it joins at
 * the next update), and on the AWS store when adding its case failed (addCaseLive in cases.ts says so, and the next build adds it). Only an
 * added case may be described as "already in the department officer's queue" (QUEUE_DELAY_NOTE on the AWS store, P5-033 seam-05): the
 * route said so even when the add had failed (pass 6's reviewerB-04).
 *
 * The same words as lib/officer/queue-note.ts's own note for the next update; tests/qa/pass7/desk-and-accounts/queue-note.test.ts keeps them
 * equal.
 */
export const NEXT_UPDATE_NOTE: { readonly en: string; readonly ta: string } = {
  en: "Your complaint is registered. The department officer will see it in their queue at the next update, which runs every hour.",
  ta: "உங்கள் புகார் பதிவு செய்யப்பட்டது. துறை அலுவலர் அடுத்த புதுப்பிப்பில் தம் பட்டியலில் இதைப் பார்ப்பார். புதுப்பிப்பு ஒவ்வொரு மணிநேரமும் நடக்கும்."
};
