"use client";

/**
 * The card that holds a sign-in / sign-up / reset form. It fades up on arrival, shakes once on an error
 * (a form dispatches `auth:error`), and on success scales to .98 and fades (`auth:leave`) before the page changes.
 */
import { useEffect, type ReactNode } from "react";
import { MotionConfig, motion, useAnimationControls } from "motion/react";
import { EASE_OUT, reduced } from "@/components/ui/motion";

export const authError = () => window.dispatchEvent(new Event("auth:error"));
/** play the leave animation, then resolve (so the caller can navigate) */
export const authLeave = () => new Promise<void>((done) => { window.dispatchEvent(new Event("auth:leave")); setTimeout(done, reduced() ? 0 : 240); });

export default function AuthCard({ children }: { children: ReactNode }) {
  const ctl = useAnimationControls();
  useEffect(() => {
    ctl.start({ opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: EASE_OUT } });
    const err = () => { if (!reduced()) ctl.start({ x: [0, -6, 6, -6, 6, -3, 0], transition: { duration: 0.3 } }); };
    const leave = () => ctl.start({ opacity: 0, scale: 0.98, transition: { duration: 0.22 } });
    window.addEventListener("auth:error", err);
    window.addEventListener("auth:leave", leave);
    return () => { window.removeEventListener("auth:error", err); window.removeEventListener("auth:leave", leave); };
  }, [ctl]);
  return (
    <MotionConfig reducedMotion="user">
      <motion.div initial={{ opacity: 0, y: 14, scale: 1 }} animate={ctl} className="auth-card w-full max-w-[440px]">
        {children}
      </motion.div>
    </MotionConfig>
  );
}
