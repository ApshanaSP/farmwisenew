"use client";

import Link from "next/link";
import { useState, FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, ArrowRight, CheckCircle2, KeyRound, Loader2, Mail } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { authError } from "@/components/auth/AuthCard";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import { CountdownRing, OtpInput, Stepper, SuccessCheck } from "@/components/ui";
import { EASE_OUT } from "@/components/ui/motion";

type Step = 1 | 2 | 3 | 4;
const STEPS = ["Request OTP", "Verify", "New password"];
const SUB: Record<Step, string> = {
  1: "Enter your registered email and we'll send a one-time code.",
  2: "Enter the 6-digit code sent to your email.",
  3: "Choose a new password.",
  4: "All done."
};

/** Forgot password: a three-step stepper (Request OTP -> Verify -> New password) inside one card; steps slide sideways. */
export default function ForgotPasswordPage() {
  const [step, setStepState] = useState<Step>(1);
  const [dir, setDir] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const setStep = (s: Step) => { setDir(s > step ? 1 : -1); setStepState(s); };
  const fail = (m: string) => { setError(m); setSubmitting(false); authError(); };

  async function requestOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) return fail(data.error || "Something went wrong.");
      setInfo(data.message);
      if (data.devOtp) setDevOtp(data.devOtp);
      if (data.cooldownRemaining) setCooldown(data.cooldownRemaining);
      setStep(2);
      setSubmitting(false);
    } catch {
      fail("Something went wrong. Please try again.");
    }
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp })
      });
      const data = await res.json();
      if (!res.ok) return fail(data.error || "Invalid OTP.");
      setStep(3);
      setSubmitting(false);
    } catch {
      fail("Something went wrong. Please try again.");
    }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) return fail("Passwords do not match.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, newPassword, confirmPassword })
      });
      const data = await res.json();
      if (!res.ok) return fail(data.error || "Something went wrong.");
      setStep(4);
      setSubmitting(false);
    } catch {
      fail("Something went wrong. Please try again.");
    }
  }

  const Submit = ({ busy, label }: { busy: string; label: string }) => (
    <button type="submit" disabled={submitting} className="auth-submit group">
      {submitting ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />{busy}</> : <>{label}<ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></>}
    </button>
  );

  return (
    <AuthShell headline={<>Locked out? Back in three short steps.</>}>
      <div className="mx-auto w-full max-w-[420px]">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[10px] bg-navy-50 text-navy-700 ring-1 ring-inset ring-navy-200">
            {step === 4 ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <KeyRound className="h-5 w-5" aria-hidden="true" />}
          </span>
          <div>
            <h1 className="font-display text-[1.6rem] font-semibold leading-tight tracking-[-0.03em] text-ink">Forgot password</h1>
            <p className="mt-0.5 text-sm text-ink-muted">{SUB[step]}</p>
          </div>
        </div>

        {step < 4 && <div className="mt-6"><Stepper steps={STEPS} current={step - 1} onStep={(i) => setStep((i + 1) as Step)} /></div>}

        <AnimatePresence initial={false}>
          {error && (
            <motion.div key="err" role="alert" className="alert-error mt-5" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative mt-5 overflow-hidden">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div key={step} custom={dir} initial={{ opacity: 0, x: 28 * dir }} animate={{ opacity: 1, x: 0, transition: { duration: 0.32, ease: EASE_OUT } }}
              exit={{ opacity: 0, x: -20 * dir, transition: { duration: 0.16 } }}>
              {step === 1 && (
                <form onSubmit={requestOtp} noValidate className="space-y-5">
                  <div className="group">
                    <label htmlFor="email" className="auth-label">Registered email</label>
                    <div className="relative">
                      <span className="input-affix group-focus-within:text-navy-500"><Mail className="h-[18px] w-[18px]" aria-hidden="true" /></span>
                      <input id="email" type="email" required autoComplete="username" className="auth-input pl-11" placeholder="you@example.com"
                        value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                  </div>
                  <Submit busy="Sending OTP..." label="Send OTP" />
                </form>
              )}

              {step === 2 && (
                <form onSubmit={verifyOtp} noValidate className="space-y-5">
                  {info && (
                    <div role="status" className="alert-success">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                      <div>
                        {info}
                        {devOtp && <p className="mt-2 rounded-[6px] bg-canvas-raised/70 px-2.5 py-1.5 font-mono text-sm font-bold text-navy-700">[Dev mode] OTP: {devOtp}</p>}
                      </div>
                    </div>
                  )}
                  <div>
                    <span className="auth-label" id="otp-l">6-digit code</span>
                    <OtpInput value={otp} onChange={setOtp} autoFocus label="6-digit OTP" />
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {cooldown > 0 && <CountdownRing seconds={cooldown} onDone={() => setCooldown(0)} size={26} />}
                    <button type="button" onClick={(e) => requestOtp(e as unknown as FormEvent)} disabled={submitting || cooldown > 0}
                      className="font-semibold text-navy-600 hover:underline disabled:cursor-default disabled:text-ink-faint disabled:no-underline">
                      {cooldown > 0 ? "Resend OTP when the timer ends" : "Resend OTP"}
                    </button>
                  </div>
                  <Submit busy="Verifying..." label="Verify OTP" />
                </form>
              )}

              {step === 3 && (
                <form onSubmit={resetPassword} noValidate className="space-y-4">
                  <div>
                    <label htmlFor="newPassword" className="auth-label">New password</label>
                    <input id="newPassword" type="password" required autoComplete="new-password" className="auth-input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                    <PasswordStrengthMeter password={newPassword} />
                  </div>
                  <div>
                    <label htmlFor="confirmPassword" className="auth-label">Confirm password</label>
                    <input id="confirmPassword" type="password" required autoComplete="new-password" className="auth-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                  </div>
                  <Submit busy="Resetting..." label="Reset password" />
                </form>
              )}

              {step === 4 && (
                <div className="flex flex-col items-center text-center">
                  <SuccessCheck size={64} />
                  <p className="mb-6 mt-4 text-sm text-ink-muted">Your password has been reset. You can now sign in with your new password.</p>
                  <Link href="/login" className="auth-submit">Go to sign in<ArrowRight className="h-5 w-5" aria-hidden="true" /></Link>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {step < 4 && (
          <p className="mt-6 text-center text-sm text-ink-muted">
            Remembered your password?{" "}
            <Link href="/login" className="font-semibold text-navy-500 hover:underline">Back to sign in</Link>
          </p>
        )}
      </div>
    </AuthShell>
  );
}
