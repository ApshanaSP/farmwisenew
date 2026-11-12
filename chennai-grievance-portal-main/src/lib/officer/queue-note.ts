/**
 * RC-47 (PB-315): the officer queue is built from the pipeline's incidents, so a complaint filed a minute ago shows there at the next update.
 * These are the two sentences that say so: one for the citizen who filed, one for the officer whose queue it is joining.
 *
 * On the AWS store the filing route puts the complaint in the officer's queue at once (addCaseLive in lib/manu/cases.ts does so only
 * when DATA_BACKEND is "aws"), so there the citizen is told it is already there, not "at the next update" (QA pass 5, seam-05).
 */
const AT_NEXT_UPDATE = {
  en: "Your complaint is registered. The department officer will see it in their queue at the next update, which runs every hour.",
  ta: "உங்கள் புகார் பதிவு செய்யப்பட்டது. துறை அலுவலர் அடுத்த புதுப்பிப்பில் தம் பட்டியலில் இதைப் பார்ப்பார். புதுப்பிப்பு ஒவ்வொரு மணிநேரமும் நடக்கும்."
};
const ALREADY_THERE = {
  en: "Your complaint is registered and is already in the department officer's queue.",
  ta: "உங்கள் புகார் பதிவு செய்யப்பட்டது; இது ஏற்கனவே துறை அலுவலரின் பட்டியலில் உள்ளது."
};
const addedAtOnce = () => process.env.DATA_BACKEND === "aws";

/** The citizen's note, read when it is sent (the filing route sends this object as it is): what is true for the store in use. */
export const QUEUE_DELAY_NOTE: { readonly en: string; readonly ta: string } = {
  get en() { return (addedAtOnce() ? ALREADY_THERE : AT_NEXT_UPDATE).en; },
  get ta() { return (addedAtOnce() ? ALREADY_THERE : AT_NEXT_UPDATE).ta; }
};

export function queueNoteFor(count: number): { en: string; ta: string } | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return {
    en: `${count} new complaint${count === 1 ? " is" : "s are"} filed with your department and will join this list at the next update.`,
    ta: `உங்கள் துறைக்கு ${count} புதிய புகார்${count === 1 ? "" : "கள்"} பதிவாகியுள்ளது; அடுத்த புதுப்பிப்பில் இந்தப் பட்டியலில் சேரும்.`
  };
}
