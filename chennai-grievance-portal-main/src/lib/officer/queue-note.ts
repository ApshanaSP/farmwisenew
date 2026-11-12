/**
 * RC-47 (PB-315): the officer queue is built from the pipeline's incidents, so a complaint filed a minute ago shows there at the next update.
 * These are the two sentences that say so: one for the citizen who filed, one for the officer whose queue it is joining.
 */
export const QUEUE_DELAY_NOTE = {
  en: "Your complaint is registered. The department officer will see it in their queue at the next update, which runs every hour.",
  ta: "உங்கள் புகார் பதிவு செய்யப்பட்டது. துறை அலுவலர் அடுத்த புதுப்பிப்பில் தம் பட்டியலில் இதைப் பார்ப்பார். புதுப்பிப்பு ஒவ்வொரு மணிநேரமும் நடக்கும்."
};

export function queueNoteFor(count: number): { en: string; ta: string } | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return {
    en: `${count} new complaint${count === 1 ? " is" : "s are"} filed with your department and will join this list at the next update.`,
    ta: `உங்கள் துறைக்கு ${count} புதிய புகார்${count === 1 ? "" : "கள்"} பதிவாகியுள்ளது; அடுத்த புதுப்பிப்பில் இந்தப் பட்டியலில் சேரும்.`
  };
}
