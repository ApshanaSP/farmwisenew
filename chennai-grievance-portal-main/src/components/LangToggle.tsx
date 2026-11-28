"use client";
/** English / தமிழ் on the public pages (sign-in, sign-up, the citizen pages), drawn as the consoles' switch (shell2.css .lang-sw): the whole site follows, Jarvis too. */
import { useLang } from "@/lib/i18n/lang";
import "@/components/citizen/citizen.css";

export default function LangToggle() {
  const [lang, setLang] = useLang();
  return (
    <button type="button" className="cz-tbtn lang" translate="no" onClick={() => setLang(lang === "ta" ? "en" : "ta")}
      title={lang === "ta" ? "Switch the site to English" : "தளத்தைத் தமிழில் காட்டு (Tamil)"} aria-label={lang === "ta" ? "English: switch the site to English" : "தமிழ்: switch the site to Tamil"}>
      <span aria-hidden="true" className="cz-lang-a" data-g={lang === "ta" ? "A" : "அ"} />
      {/* on a 360 px phone the letter alone: the name is the aria-label, and the top bar has no room for the word (RC-46) */}
      <span className="cz-lang-w">{lang === "ta" ? "English" : "தமிழ்"}</span>
    </button>
  );
}
