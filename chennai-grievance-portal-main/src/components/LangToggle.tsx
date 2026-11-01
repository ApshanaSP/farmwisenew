"use client";
/** English / தமிழ் on the public pages (sign-in, sign-up, the citizen pages): the whole site follows, Jarvis too. */
import { useLang } from "@/lib/i18n/lang";

export default function LangToggle() {
  const [lang, setLang] = useLang();
  return (
    <button type="button" className="diq-tbtn" translate="no" onClick={() => setLang(lang === "ta" ? "en" : "ta")}
      title={lang === "ta" ? "Switch the site to English" : "தளத்தைத் தமிழில் காட்டு (Tamil)"} aria-label={lang === "ta" ? "Switch to English" : "Switch to Tamil"}>
      <span className="inline-grid h-6 w-6 place-items-center rounded-md bg-emerald-600/10 text-[13px] font-bold text-emerald-700">{lang === "ta" ? "A" : "அ"}</span>
      {lang === "ta" ? "English" : "தமிழ்"}
    </button>
  );
}
