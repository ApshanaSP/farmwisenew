"use client";
/**
 * The screen while a console opens (after sign-in, or a reload): the FarmwiseAI leaf breathing inside two turning
 * rings, a progress line that sweeps, and what is being got ready, in English and Tamil. Shown by the login page as
 * soon as the password is accepted and by the consoles' loading.tsx while the server builds the first screen, so the
 * wait always moves. Stills under prefers-reduced-motion.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./console-loader.css";

const STEPS: [string, string][] = [
  ["Signing you in", "உள்நுழைகிறது"],
  ["Reading today's incidents", "இன்றைய நிகழ்வுகளைப் படிக்கிறது"],
  ["Drawing the map of Chennai", "சென்னை வரைபடத்தை வரைகிறது"],
  ["Checking the news and the weather", "செய்தி, வானிலையைச் சரிபார்க்கிறது"],
  ["Almost ready", "கிட்டத்தட்ட தயார்"]
];

/** Any other page of the site (loading.tsx at the root). */
const PAGE_STEPS: [string, string][] = [
  ["Verifying your session", "உங்கள் அமர்வு சரிபார்க்கப்படுகிறது"],
  ["Retrieving the information", "தகவல் பெறப்படுகிறது"],
  ["Preparing the page for display", "பக்கம் தயாரிக்கப்படுகிறது"],
  ["Almost ready", "கிட்டத்தட்ட தயார்"]
];

export default function ConsoleLoader({ title = "Opening your console", overlay = false, page = false }: { title?: string; overlay?: boolean; page?: boolean }) {
  const steps = page ? PAGE_STEPS : STEPS;
  const [i, setI] = useState(0);
  const [ta, setTa] = useState(false);
  useEffect(() => {
    try { setTa(localStorage.getItem("diq-lang") === "ta"); } catch { /* English */ }
    const t = setInterval(() => setI((x) => Math.min(steps.length - 1, x + 1)), 1300);
    return () => clearInterval(t);
  }, [steps.length]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const el = (
    <div className={`cld${overlay ? " over" : ""}`} role="status" aria-live="polite" data-no-i18n>
      <div className="cld-orb" aria-hidden="true">
        <span className="cld-ring r1" /><span className="cld-ring r2" />
        <img src="/brand/districtiq-mark.png" alt="" />
      </div>
      <b className="cld-t">{page ? (ta ? "பக்கம் திறக்கப்படுகிறது" : "Opening the page") : ta ? "உங்கள் பணியகத்தைத் திறக்கிறது" : title}</b>
      <span className="cld-s" key={i}>{ta ? steps[i][1] : steps[i][0]}…</span>
      <span className="cld-bar" aria-hidden="true"><i /></span>
    </div>
  );
  // over the page, the overlay sits on <body>: inside the sign-in card it would fade out with the card
  if (overlay) return mounted ? createPortal(el, document.body) : null;
  return el;
}
