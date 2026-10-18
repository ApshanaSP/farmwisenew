"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, FormEvent } from "react";
import { AlertCircle, ArrowRight, Check, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import AuthShell from "@/components/AuthShell";
import { authError, authLeave } from "@/components/auth/AuthCard";
import { checkPasswordRules, passwordStrengthScore } from "@/lib/validators";

export default function RegisterPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="firstName" className="auth-label">First name</label>
              <input id="firstName" type="text" required autoComplete="given-name" className="auth-input" placeholder="Arjun"
                value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="lastName" className="auth-label">Last name <span className="font-normal text-ink-faint">(optional)</span></label>
              <input id="lastName" type="text" autoComplete="family-name" className="auth-input" placeholder="Kumar"
                value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="auth-label">Email address</label>
            <input id="email" type="email" required autoComplete="email" className="auth-input" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="password" className="auth-label">Password</label>
              <div className="relative">
                <input id="password" type={showPassword ? "text" : "password"} required autoComplete="new-password"
                  className="auth-input pr-11" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-faint transition hover:text-navy-700">
                  {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="confirmPassword" className="auth-label">Confirm password</label>
              <div className="relative">
                <input id="confirmPassword" type={showPassword ? "text" : "password"} required autoComplete="new-password"
                  className={`auth-input pr-11 ${confirmPassword && !passwordsMatch ? "border-red-300" : ""}`}
                  value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                {passwordsMatch && (
                  <span aria-hidden="true" className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-emerald-600">
                    <Check className="h-[18px] w-[18px]" strokeWidth={3} />
                  </span>
                )}
              </div>
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
          <Link href="/login" className="font-semibold text-navy-500 transition hover:underline">Sign in</Link>
        </p>

        <p className="mt-4 flex items-start gap-2 rounded-[10px] border border-canvas-border bg-canvas-sunken/60 px-3.5 py-2.5 text-[13px] text-ink-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-emerald-600" aria-hidden="true" />
          <span>Department officers and the Collector&apos;s office don&apos;t register here. Their accounts are issued by the Collector&apos;s office; just <Link href="/login" className="font-semibold text-navy-500 hover:underline">sign in</Link>.</span>
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
        <span className="w-12 text-right text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: password ? colour : undefined }}>{word}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]">
        {rules.map((r) => (
          <span key={r.label} title={r.label} className={`inline-flex items-center gap-1 ${r.passed ? "text-emerald-600" : "text-ink-subtle"}`}>
            <Check className={`h-3.5 w-3.5 ${r.passed ? "" : "opacity-30"}`} strokeWidth={3} aria-hidden="true" />
            {short[r.label] ?? r.label}
          </span>
        ))}
      </div>
    </div>
  );
}
