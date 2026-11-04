"use client";
/** A number that counts up to the value code gave it. Whole digits in a tabular face; with reduced motion, it just arrives. */
import { useEffect, useState } from "react";

const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(reduced() ? value : 0);
  useEffect(() => {
    if (reduced()) { setShown(value); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 650);
      setShown(k >= 1 ? value : value * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const whole = Number.isInteger(value);
  const n = shown === value ? value : whole ? Math.round(shown) : Math.round(shown * 10) / 10;
  return <>{format ? format(n) : n.toLocaleString("en-IN")}</>;
}
