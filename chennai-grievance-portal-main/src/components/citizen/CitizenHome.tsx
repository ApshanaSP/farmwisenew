"use client";

import Link from "next/link";
import { MotionConfig, motion } from "motion/react";
import { ArrowRight, CheckCircle2, ChevronRight, ClipboardList, FilePlus2, FileText, Loader, Phone, Search, UserRound, Zap } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { MiniProgress } from "@/components/StatusTracker";
import { CountUp, EmptyState } from "@/components/ui";
import { EASE_OUT, enter, stagger } from "@/components/ui/motion";
import { ComplaintStatus } from "@/types";
import "@/components/citizen/citizen.css";

export interface RecentComplaint { code: string; title: string; status: ComplaintStatus; createdAt: string; department: string }

/** Chennai's calendar, whatever zone the server or the browser runs in: the server and the browser print the same day (RC-16) */
const IST = { timeZone: "Asia/Kolkata" } as const;
const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { ...IST, day: "numeric", month: "short", year: "numeric" });

/**
 * The citizen home, laid out as the consoles' Overview: the green band carries the day, the greeting, the two things a citizen
 * comes to do and the three counts as glass tiles; under it two cards, the recent complaints with where each one is, and the
 * other things to do.
 */
export default function CitizenHome({ name, stats, recent }: { name: string | null; stats: { total: number; open: number; resolved: number }; recent: RecentComplaint[] }) {
  const today = new Date().toLocaleDateString("en-IN", { ...IST, weekday: "long", day: "numeric", month: "long" });
  const pct = stats.total ? Math.round((stats.resolved / stats.total) * 100) : 0;
  // the band's own versions of the accent, amber and green, which read on the dark green (marina.css .band)
  const tiles = [
    { label: "Total filed", value: stats.total, icon: ClipboardList, kc: "#8EF0B6", note: "Every complaint you have raised" },
    { label: "In progress", value: stats.open, icon: Loader, kc: "#FFC56E", note: "With a department right now" },
    { label: "Resolved", value: stats.resolved, icon: CheckCircle2, kc: "#7CE8B3", note: stats.total ? `${pct}% of yours, work done and checked` : "Work done and checked" }
  ];
  const actions = [
    { href: "/citizen/file-complaint", icon: FilePlus2, title: "File a complaint", text: "Report a civic issue with a photo and location", kc: "var(--accent)" },
    { href: "/citizen/track-complaints", icon: Search, title: "Track status", text: "Follow each complaint to closure", kc: "var(--live)" },
    { href: "/profile", icon: UserRound, title: "My profile", text: "Contact details and password", kc: "var(--neutral)" },
    { href: "tel:1913", icon: Phone, title: "Call 1913", text: "Helpline, 24×7, for urgent civic issues", kc: "var(--high)" }
  ];
  return (
    <MotionConfig reducedMotion="user">
      <motion.main initial="hidden" animate="show" variants={stagger(0.05)} className="cz-body">
        {/* the green band, as on the consoles' Overview: the day, the greeting, the two things a citizen comes to do, the counts */}
        <motion.section variants={enter} className="cz-band">
          <div className="cz-band-row">
            <div className="cz-band-t">
              <p className="cz-band-eb"><span suppressHydrationWarning>{today}</span><i aria-hidden="true">·</i><span>Citizen portal</span></p>
              <h1 className="cz-hello">
                {/* the name as typed: never sent to the translator */}
                Vanakkam{name ? <>, <span translate="no">{name}</span></> : null} <span className="cz-ta" lang="ta">· வணக்கம்</span>
              </h1>
              <p className="cz-band-sub">
                Report a civic issue in your neighbourhood or follow one you have filed. Most complaints reach a department within minutes.
              </p>
            </div>
            <div className="cz-band-acts">
              <Link href="/citizen/track-complaints" className="cz-bbtn"><Search aria-hidden="true" />Track status</Link>
              <Link href="/citizen/file-complaint" className="cz-bbtn solid"><FilePlus2 aria-hidden="true" />File a complaint</Link>
            </div>
          </div>
          <div className="cz-kpis">
            {tiles.map(({ label, value, icon: Icon, kc, note }) => (
              <div key={label} className="cz-kpi" style={{ ["--kc" as string]: kc }}>
                <span className="cz-kpi-ic"><Icon aria-hidden="true" /></span>
                <div className="cz-kpi-t">
                  <p className="cz-kpi-l">{label}</p>
                  <p className="cz-kpi-n"><CountUp value={value} /></p>
                  <p className="cz-kpi-note">{note}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <motion.section variants={enter} className="cz-card">
            <header className="cz-ch">
              <span className="cz-ch-ic" aria-hidden="true"><ClipboardList /></span>
              <div className="cz-ch-t"><h2>Recent complaints</h2><small>Your latest three, with where each one is</small></div>
              {recent.length > 0 && (
                <div className="cz-ch-r"><Link href="/citizen/track-complaints" className="cz-more">See all<ArrowRight aria-hidden="true" /></Link></div>
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
                    <Link href={`/citizen/track-complaints?code=${encodeURIComponent(c.code)}`} className="cz-row">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-[12px] font-medium text-navy-700" translate="no">{c.code}</p>
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

          <motion.section variants={enter} className="cz-card">
            <header className="cz-ch">
              <span className="cz-ch-ic" aria-hidden="true"><Zap /></span>
              <div className="cz-ch-t"><h2>Quick actions</h2><small>What you can do here</small></div>
            </header>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 px-3 pb-3">
              {actions.map(({ href, icon: Icon, title, text, kc }) => (
                <li key={href}>
                  <Link href={href} className="cz-act" style={{ ["--kc" as string]: kc }}>
                    <span className="cz-act-ic"><Icon aria-hidden="true" /></span>
                    <span className="min-w-0"><b>{title}</b><small>{text}</small></span>
                    <ChevronRight aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </motion.section>
        </div>
      </motion.main>
    </MotionConfig>
  );
}
