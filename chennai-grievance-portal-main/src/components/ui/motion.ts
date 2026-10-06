/**
 * District IQ motion presets: one vocabulary for every portal. Motion explains (where something came from, where it went,
 * what changed); it never decorates. Wrap each app in <MotionConfig reducedMotion="user"> so every motion.* respects the
 * system setting, and use `reduced()` for hand-written animations (count-ups, map flights, confetti).
 * Only two things may loop: the live dot pulse and the AI "thinking" shimmer.
 */
import type { Transition, Variants } from "motion/react";

/** durations in seconds (tokens.css --t-*) */
export const T = { instant: 0.09, fast: 0.16, base: 0.24, slow: 0.38, enter: 0.52 } as const;
/** cubic-bezier easings (tokens.css --ease-out / --ease-in-out) */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export const spring = {
  /** indicators, toggles, the sliding pill */
  snappy: { type: "spring", stiffness: 420, damping: 34 } as Transition,
  /** dialogs, drawers, shared-layout morphs */
  soft: { type: "spring", stiffness: 220, damping: 28 } as Transition
};

/** first-load entrance: fade, rise 8px, un-blur; children stagger 40ms apart */
export const enter: Variants = {
  hidden: { opacity: 0, y: 8, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: T.enter, ease: EASE_OUT } }
};
export const stagger = (gap = 0.04, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } }
});

/** content swap on a filter / period change: a quick cross-fade, never blank-then-redraw */
export const crossfade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: T.fast } },
  exit: { opacity: 0, transition: { duration: T.fast * 0.6 } }
};

/** page change: the new page enters 24px from the direction of travel (dir 1 = next, -1 = previous) */
export const pageSlide: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: 24 * dir, filter: "blur(2px)" }),
  center: { opacity: 1, x: 0, filter: "blur(0px)", transition: { duration: T.slow, ease: EASE_OUT } },
  exit: (dir: number) => ({ opacity: 0, x: -16 * dir, transition: { duration: T.fast, ease: EASE_IN_OUT } })
};

/** a title that rolls vertically when its text changes */
export const roll: Variants = {
  initial: { y: "60%", opacity: 0 },
  animate: { y: "0%", opacity: 1, transition: { duration: T.base, ease: EASE_OUT } },
  exit: { y: "-60%", opacity: 0, transition: { duration: T.fast, ease: EASE_IN_OUT } }
};

/** dialogs: scale .96 -> 1 with the soft spring */
export const dialog: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: spring.soft },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: { duration: T.fast, ease: EASE_IN_OUT } }
};
export const scrim: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: T.base } },
  exit: { opacity: 0, transition: { duration: T.fast } }
};
/** right drawer (bottom sheet on phones uses `sheet`) */
export const drawer: Variants = {
  initial: { x: "104%" },
  animate: { x: 0, transition: spring.soft },
  exit: { x: "104%", transition: { duration: T.base, ease: EASE_IN_OUT } }
};
export const sheet: Variants = {
  initial: { y: "100%" },
  animate: { y: 0, transition: spring.soft },
  exit: { y: "100%", transition: { duration: T.base, ease: EASE_IN_OUT } }
};
/** a row leaving a list after an action (Verify, Approve): height + fade */
export const collapse: Variants = {
  initial: { opacity: 1, height: "auto" },
  exit: { opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, transition: { duration: 0.28, ease: EASE_IN_OUT } }
};
/** the error shake: x ±6px three times, 300ms */
export const shake = { x: [0, -6, 6, -6, 6, -3, 0], transition: { duration: 0.3 } };

/** true when the user asked the system for less motion (client only) */
export function reduced(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
