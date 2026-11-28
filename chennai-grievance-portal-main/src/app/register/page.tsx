"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, FormEvent } from "react";
import { AlertCircle, ArrowRight, Check, Loader2, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import AuthShell from "@/components/AuthShell";
import { authError, authLeave } from "@/components/auth/AuthCard";
import PasswordInput from "@/components/auth/PasswordInput";
import { checkPasswordRules, passwordStrengthScore } from "@/lib/validators";

export default function RegisterPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const fail = (m: string) => { setError(m); authError(); };
    if (!firstName.trim()) return fail("Please enter your first name.");
    if (password !== confirmPassword) return fail("Passwords do not match.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          confirmPassword,
          firstName,
          lastName
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setSubmitting(false);
        authError();
        return;
      }
      await authLeave();
      router.push("/login?registered=1");
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
      authError();
    }
  }

  return (
    <AuthShell headline={<>Raise a complaint. Follow it to the end.</>}>
      <div className="mx-auto w-full max-w-[480px]">
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-ink">Create a citizen account</h1>
        <p className="mt-1 text-[15px] text-ink-muted">Takes under a minute. File complaints and track every step.</p>

        {error && (
          <div role="alert" className="alert-error mt-3 animate-scale-in py-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-3.5">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 min-[400px]:grid-cols-2">
            <div>
              <label htmlFor="firstName" className="auth-label">First name</label>
              <input id="firstName" type="text" required autoComplete="given-name" className="auth-input" placeholder="Arjun"
                value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="lastName" className="auth-label">Last name <span className="font-normal text-ink-subtle">(optional)</span></label>
              <input id="lastName" type="text" autoComplete="family-name" className="auth-input" placeholder="Kumar"
                value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="auth-label">Email address</label>
            <input id="email" type="email" required autoComplete="email" className="auth-input" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          {/* each password field has one show / hide button of its own (Edge's eye is hidden for these: globals.css .pw-field) */}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="password" className="auth-label">Password</label>
              <PasswordInput id="password" required autoComplete="new-password" className="auth-input"
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="auth-label">Confirm password</label>
              <PasswordInput id="confirmPassword" required autoComplete="new-password" aria-describedby="confirm-note"
                className={`auth-input ${confirmPassword && !passwordsMatch ? "border-red-300" : ""}`}
                aria-invalid={confirmPassword && !passwordsMatch ? true : undefined}
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              {/* said in words under the field (it was a tick inside it, hidden from screen readers) */}
              <p id="confirm-note" aria-live="polite" className={`mt-1 flex min-h-[18px] items-center gap-1 text-[12.5px] ${passwordsMatch ? "text-emerald-700" : "text-ink-subtle"}`}>
                {passwordsMatch ? <><Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />Passwords match</> : confirmPassword ? "Passwords do not match yet" : ""}
              </p>
            </div>
          </div>

          <StrengthLine password={password} />

          <button type="submit" disabled={submitting} className="auth-submit group">
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                Creating account...
              </>
            ) : (
              <>
                Create account
                <ArrowRight className="h-5 w-5 transition-transform duration-200 ease-spring group-hover:translate-x-0.5" aria-hidden="true" />
              </>
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-[15px] text-ink-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-navy-700 transition hover:underline">Sign in</Link>
        </p>

        <p className="mt-4 flex items-start gap-2 rounded-[10px] border border-canvas-border bg-canvas-sunken/60 px-3.5 py-2.5 text-[13px] text-ink-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-emerald-600" aria-hidden="true" />
          <span>Department officers and the Collector&apos;s office don&apos;t register here. Their accounts are issued by the Collector&apos;s office; just <Link href="/login" className="font-semibold text-navy-700 hover:underline">sign in</Link>.</span>
        </p>
      </div>
    </AuthShell>
  );
}

/** Password rules as a single row of ticks, so the form keeps its height as you type. */
function StrengthLine({ password }: { password: string }) {
  const rules = checkPasswordRules(password);
  const score = passwordStrengthScore(password);
  // four segments that fill as the rules pass and change colour: weak (red) -> fair (amber) -> strong (green)
  const filled = password ? Math.max(1, Math.round((rules.filter((r) => r.passed).length / rules.length) * 4)) : 0;
  const colour = score >= 100 ? "var(--ok)" : score >= 60 ? "var(--medium)" : "var(--critical)";
  // the word in the text colours, which reach 4.5:1 (the fills are too light for small text: "Fair" was 2.9:1 on white)
  const ink = score >= 100 ? "var(--ok-ink)" : score >= 60 ? "var(--medium-ink)" : "var(--critical-ink)";
  const word = !password ? "" : score >= 100 ? "Strong" : score >= 60 ? "Fair" : "Weak";
  const short: Record<string, string> = {
    "At least 8 characters": "8+ chars", "One uppercase letter": "A–Z", "One lowercase letter": "a–z",
    "One number": "0–9", "One special character": "symbol", "No spaces": "no spaces"
  };
  return (
    <div aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas-sunken">
              <motion.span className="block h-full rounded-full" initial={false} style={{ originX: 0 }}
                animate={{ scaleX: i < filled ? 1 : 0, backgroundColor: colour }} transition={{ duration: 0.3, delay: i * 0.04 }} />
            </span>
          ))}
        </div>
        <span className="w-12 text-right text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: password ? ink : undefined }}>{word}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]">
        {rules.map((r) => (
          <span key={r.label} title={r.label} className={`inline-flex items-center gap-1 ${r.passed ? "text-emerald-700" : "text-ink-subtle"}`}>
            <Check className={`h-3.5 w-3.5 ${r.passed ? "" : "opacity-30"}`} strokeWidth={3} aria-hidden="true" />
            {short[r.label] ?? r.label}
          </span>
        ))}
      </div>
    </div>
  );
}
