"use client";
/** English / தமிழ் on the public pages (sign-in, sign-up, the citizen pages): the whole site follows, Jarvis too. */
import { useLang } from "@/lib/i18n/lang";

export default function LangToggle() {
  const [lang, setLang] = useLang();
  return (
    <button type="button" className="diq-tbtn" translate="no" onClick={() => setLang(lang === "ta" ? "en" : "ta")}
      title={lang === "ta" ? "Switch the site to English" : "தளத்தைத் தமிழில் காட்டு (Tamil)"} aria-label={lang === "ta" ? "English: switch the site to English" : "தமிழ்: switch the site to Tamil"}>
      <span aria-hidden="true" className="inline-grid h-6 w-6 place-items-center rounded-md bg-emerald-600/10 text-[13px] font-bold text-emerald-700 before:content-[attr(data-g)]" data-g={lang === "ta" ? "A" : "அ"} />
      {/* on a 360 px phone the glyph alone: the name is the aria-label, and the top bar has no room for the word (RC-46) */}
      <span className="max-[400px]:hidden">{lang === "ta" ? "English" : "தமிழ்"}</span>
    </button>
  );
}
