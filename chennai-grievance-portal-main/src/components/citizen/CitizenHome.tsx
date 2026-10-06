"use client";

import Link from "next/link";
import { MotionConfig, motion } from "motion/react";
import { ArrowRight, CheckCircle2, ClipboardList, FilePlus2, FileText, Loader, Phone, Search, UserRound } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { MiniProgress } from "@/components/StatusTracker";
import { CountUp, EmptyState, ProgressRing } from "@/components/ui";
import { EASE_OUT, enter, stagger } from "@/components/ui/motion";
import { ComplaintStatus } from "@/types";

export interface RecentComplaint { code: string; title: string; status: ComplaintStatus; createdAt: string; department: string }

const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** The citizen home: greeting, three KPI tiles, recent complaints with their progress, quick actions. */
export default function CitizenHome({ name, stats, recent }: { name: string | null; stats: { total: number; open: number; resolved: number }; recent: RecentComplaint[] }) {
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const pct = stats.total ? stats.resolved / stats.total : 0;
  const tiles = [
    { label: "Total filed", value: stats.total, icon: ClipboardList, kc: "var(--accent)", note: "Every complaint you have raised" },
    { label: "In progress", value: stats.open, icon: Loader, kc: "var(--high)", note: "With a department right now" },
    { label: "Resolved", value: stats.resolved, icon: CheckCircle2, kc: "var(--ok)", note: "Verified by the Collector", ring: true }
  ];
  const actions = [
    { href: "/citizen/file-complaint", icon: FilePlus2, title: "File a complaint", text: "Report a civic issue with a photo and location", kc: "var(--accent)" },
    { href: "/citizen/track-complaints", icon: Search, title: "Track status", text: "Follow each complaint to closure", kc: "var(--live)" },
    { href: "/profile", icon: UserRound, title: "My profile", text: "Contact details and password", kc: "var(--neutral)" },
    { href: "tel:1913", icon: Phone, title: "Call 1913", text: "Helpline, 24×7, for urgent civic issues", kc: "var(--high)" }
  ];
  return (
    <MotionConfig reducedMotion="user">
      <motion.main initial="hidden" animate="show" variants={stagger(0.05)} className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8 sm:px-6">
        {/* the ocean band, as on the consoles: the day, the greeting and the two things a citizen comes to do */}
        <motion.section variants={enter} className="mesh-navy relative mb-6 flex flex-wrap items-end justify-between gap-5 overflow-hidden rounded-[20px] px-7 py-6 text-white shadow-lift">
          <div className="relative">
            <p className="text-[13px] font-semibold text-[#CFE9F0]">{today}</p>
            <h1 className="mt-1 text-[30px] font-extrabold leading-tight tracking-[-0.03em] text-white">
              Vanakkam{name ? `, ${name}` : ""} <span className="font-medium text-[#93C6D4]" lang="ta">· வணக்கம்</span>
            </h1>
            <p className="mt-1.5 max-w-[60ch] text-[15px] text-[#CFE9F0]">
              Report a civic issue in your neighbourhood or follow one you have filed. Most complaints reach a department within minutes.
            </p>
          </div>
          <div className="relative flex flex-wrap gap-2">
            <Link href="/citizen/track-complaints" className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-white/25 bg-white/10 px-4 text-[14px] font-semibold text-white transition hover:bg-white/20">
              <Search className="h-4 w-4" aria-hidden="true" />Track status</Link>
            <Link href="/citizen/file-complaint" className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-white px-5 text-[15px] font-bold text-[#0A3D62] shadow-[0_10px_24px_-12px_rgba(0,0,0,.6)] transition hover:-translate-y-0.5">
              <FilePlus2 className="h-[18px] w-[18px]" aria-hidden="true" />File a complaint</Link>
          </div>
        </motion.section>

        <motion.section variants={stagger(0.05)} className="mb-6 grid gap-3 sm:grid-cols-3">
          {tiles.map(({ label, value, icon: Icon, kc, note, ring }) => (
            <motion.div key={label} variants={enter} className="diq-kpi" style={{ ["--kc" as string]: kc }}>
              <span className="diq-ic"><Icon className="h-[19px] w-[19px]" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">{label}</p>
                <p className="font-display text-[30px] font-extrabold leading-[1.15] tracking-[-0.035em] text-ink tabular"><CountUp value={value} /></p>
                <p className="truncate text-xs text-ink-subtle">{note}</p>
              </div>
              {ring && stats.total > 0 && (
                <span title={`${Math.round(pct * 100)}% of your complaints are resolved`}>
                  <ProgressRing value={pct} size={46} stroke={4} color="var(--ok)">{Math.round(pct * 100)}%</ProgressRing>
                </span>
              )}
            </motion.div>
          ))}
        </motion.section>

        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <motion.section variants={enter} className="diq-panel min-w-0 lg:self-start">
            <header className="ui-ch">
              <span className="ui-ch-ic" data-tone="accent" aria-hidden="true"><ClipboardList /></span>
              <div className="ui-ch-t"><h3>Recent complaints</h3><small>Your latest three, with where each one is</small></div>
              {recent.length > 0 && (
                <div className="ui-ch-r"><Link href="/citizen/track-complaints" className="ui-more">See all<ArrowRight aria-hidden="true" /></Link></div>
              )}
            </header>
            {recent.length === 0 ? (
              <EmptyState icon={<FileText />} action={<Link href="/citizen/file-complaint" className="btn-primary h-9">File a complaint</Link>}>
                <b className="block text-ink">You haven&apos;t filed any complaints yet</b>
                When you report a civic issue, it will appear here with its current stage.
              </EmptyState>
            ) : (
              <ul className="space-y-2 px-3 pb-3">
                {recent.map((c, i) => (
                  <motion.li key={c.code} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.05, duration: 0.4, ease: EASE_OUT }}>
                    <Link href={`/citizen/track-complaints?code=${encodeURIComponent(c.code)}`}
                      className="group block rounded-[10px] border border-canvas-border bg-canvas-sunken/50 px-4 py-3 transition hover:-translate-y-0.5 hover:border-navy-300/60 hover:bg-canvas-sunken">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-mono text-[12px] font-medium text-navy-600">{c.code}</p>
                          <p className="mt-0.5 truncate text-[15px] font-semibold text-ink">{c.title}</p>
                          <p className="mt-0.5 truncate text-xs text-ink-subtle">{c.department} · {fmtDate(c.createdAt)}</p>
                        </div>
                        <StatusBadge status={c.status} short />
                      </div>
                      <div className="mt-3"><MiniProgress status={c.status} /></div>
                    </Link>
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.section>

          <motion.section variants={enter} className="grid min-w-0 grid-cols-2 gap-3 self-start">
            {actions.map(({ href, icon: Icon, title, text, kc }) => (
              <Link key={href} href={href} style={{ ["--kc" as string]: kc }}
                className="group flex min-h-[132px] flex-col justify-between rounded-[12px] border border-canvas-border bg-canvas-raised p-4 shadow-card transition duration-200 ease-spring hover:-translate-y-1 hover:border-navy-300/60">
                <span className="diq-ic h-10 w-10 transition-transform duration-200 ease-spring group-hover:-translate-y-0.5 group-hover:translate-x-0.5"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <span>
                  <b className="flex items-center gap-1 text-[15px] font-semibold text-ink">{title}<ArrowRight className="h-4 w-4 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden="true" /></b>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-subtle">{text}</span>
                </span>
              </Link>
            ))}
          </motion.section>
        </div>
      </motion.main>
    </MotionConfig>
  );
}
