"use client";

/** A plain sign-out link for server-rendered pages (the officer console's "unavailable" page had none, so signing in again landed on the same page). */
export default function SignOutLink({ label = "Sign out" }: { label?: string }) {
  return (
    <a
      href="/login"
      onClick={async (e) => {
        e.preventDefault();
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        window.location.href = "/login";
      }}
    >
      {label}
    </a>
  );
}
