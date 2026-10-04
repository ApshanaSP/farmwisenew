import Link from "next/link";
import { ReactNode } from "react";
import { Building2, Headphones, User, Wrench } from "lucide-react";
import Logo from "@/components/Logo";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";

const ROLES = [
  { icon: User, title: "Citizens", text: "Raise an issue, follow it to closure" },
  { icon: Wrench, title: "Department officers", text: "Act on work routed to your desk" },
  { icon: Building2, title: "District Collector", text: "See the whole district, verify results" }
];

/**
 * Full-viewport frame for sign-in and sign-up: a slim top bar, the two-panel
 * card and a one-line footer, sized so the page never scrolls on a laptop screen.
 */
export default function AuthShell({ children, headline }: { children: ReactNode; headline: ReactNode }) {
  return (
    <div className="auth-bg flex h-[100dvh] min-h-[600px] flex-col overflow-hidden">
      <header className="diq-top relative flex-none">
        <div className="mx-auto flex h-[60px] max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <Logo className="h-[34px] w-[34px]" />
            <span className="leading-tight">
              <span className="block text-[15px] font-extrabold uppercase leading-none tracking-[0.11em] text-ink">
                District <span className="text-navy-500">IQ</span>
              </span>
              <span className="mt-1 block text-[9.5px] font-semibold uppercase tracking-[0.17em] text-ink-subtle">
                Chennai District Intelligence
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="diq-tbtn hidden sm:inline-flex">
              <Headphones className="h-4 w-4 text-navy-500" aria-hidden="true" />
              Help desk <b className="text-ink">1913</b>
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 items-center justify-center px-4 py-4 sm:px-6">
        <div className="grid h-full max-h-[660px] w-full max-w-[1120px] animate-fade-up overflow-hidden rounded-[18px] border border-canvas-border bg-canvas-raised shadow-lift lg:grid-cols-[1fr_1.08fr]">
          <aside className="auth-hero relative hidden flex-col justify-between overflow-hidden p-9 text-white lg:flex">
            <div aria-hidden="true" className="auth-grid pointer-events-none absolute inset-0" />
            <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-indigo-400/25 blur-3xl" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -left-16 h-80 w-80 rounded-full bg-sky-400/15 blur-3xl" />

            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-[#E0E7FF] ring-1 ring-inset ring-white/20">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#6EE7B7]" />
                Live across Chennai&apos;s 15 zones
              </span>
              <h2 className="mt-5 text-balance font-display text-[2.1rem] font-extrabold leading-[1.1] tracking-tight">{headline}</h2>
              <p className="mt-3 max-w-md text-[15px] leading-relaxed text-[#D6DEF5]/85">
                Complaints, field reports, news, weather and water levels in one place, so every desk works from the same picture.
              </p>
            </div>

            <ul className="relative space-y-2.5">
              {ROLES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex items-center gap-3.5 rounded-[14px] bg-white/[0.05] px-4 py-3 ring-1 ring-inset ring-white/10 backdrop-blur-sm">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-white/25 to-white/5 ring-1 ring-inset ring-white/20">
                    <Icon className="h-5 w-5 text-[#7DD3FC]" aria-hidden="true" />
                  </span>
                  <span>
                    <b className="block text-[15px] font-semibold">{title}</b>
                    <span className="text-[13px] text-[#D6DEF5]/75">{text}</span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="relative grid grid-cols-3 gap-3 border-t border-white/15 pt-5">
              {[["15", "Zones"], ["200", "Wards"], ["8", "Live data feeds"]].map(([v, l]) => (
                <div key={l}>
                  <p className="font-display text-2xl font-extrabold tabular-nums">{v}</p>
                  <p className="text-xs uppercase tracking-wider text-[#D6DEF5]/65">{l}</p>
                </div>
              ))}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col justify-center overflow-y-auto px-6 py-7 sm:px-10 lg:px-12">{children}</section>
        </div>
      </main>

      <Footer compact />
    </div>
  );
}
