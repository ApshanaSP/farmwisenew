"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { checkPasswordRules, passwordStrengthScore } from "@/lib/validators";

/** A 4-segment bar that fills and changes colour (weak red -> fair amber -> strong green), with the rules as ticks. */
export default function PasswordStrengthMeter({ password }: { password: string }) {
  const rules = checkPasswordRules(password);
  const score = passwordStrengthScore(password);

  if (password.length === 0) return null;

  const passedCount = rules.filter((r) => r.passed).length;
  const filled = Math.max(1, Math.round((passedCount / rules.length) * 4));
  const tone =
    score >= 100
      ? { c: "var(--ok)", label: "Strong" }
      : score >= 60
        ? { c: "var(--medium)", label: "Fair" }
        : { c: "var(--critical)", label: "Weak" };

  return (
    <div className="mt-3" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas-sunken">
              <motion.span className="block h-full rounded-full" initial={false} style={{ originX: 0 }}
                animate={{ scaleX: i < filled ? 1 : 0, backgroundColor: tone.c }} transition={{ duration: 0.3, delay: i * 0.04 }} />
            </span>
          ))}
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: tone.c }}>{tone.label}</span>
      </div>

      <ul className="mt-2.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {rules.map((rule) => (
          <li key={rule.label} className={`flex items-center gap-1.5 text-[12px] transition-colors ${rule.passed ? "text-emerald-600" : "text-ink-faint"}`}>
            <span aria-hidden="true" className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full transition-colors ${rule.passed ? "bg-emerald-100" : "bg-canvas-sunken"}`}>
              {rule.passed && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
            </span>
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
