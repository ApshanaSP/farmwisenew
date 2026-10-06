import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, ClipboardList, FilePlus2, FileText, Loader, Phone, Search, UserRound } from "lucide-react";
import { getSessionFromCookies } from "@/lib/auth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StatusBadge from "@/components/StatusBadge";
import { ComplaintStatus } from "@/types";
import pool from "@/lib/db";
import { CITIZEN_NAV } from "@/lib/constants";
import { RowDataPacket } from "mysql2";

export default async function CitizenLandingPage() {
  const session = await getSessionFromCookies();
  if (!session || session.role !== "citizen") {
    redirect("/login");
  }

  const [profileRows] = await pool.query<RowDataPacket[]>(
    "SELECT first_name FROM user_profiles WHERE user_id = ?",
    [session.userId]
  );
  const firstName = profileRows[0]?.first_name as string | undefined;

  const [statRows] = await pool.query<RowDataPacket[]>(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'Verified by Collector') AS resolved,
       SUM(status NOT IN ('Verified by Collector', 'Rejected')) AS open
     FROM complaints WHERE user_id = ?`,
    [session.userId]
  );
  const stats = {
    total: Number(statRows[0]?.total ?? 0),
    resolved: Number(statRows[0]?.resolved ?? 0),
    open: Number(statRows[0]?.open ?? 0)
  };

  const [recentRows] = await pool.query<RowDataPacket[]>(
    `SELECT c.complaint_code, c.title, c.status, c.created_at, d.name AS department_name
     FROM complaints c
     JOIN departments d ON d.id = c.department_id
     WHERE c.user_id = ?
     ORDER BY c.created_at DESC
     LIMIT 3`,
    [session.userId]
  );

  const statCards = [
    { label: "Total filed", value: stats.total, icon: ClipboardList, kc: "rgb(var(--c-navy-500))", note: "Every complaint you have raised" },
    { label: "In progress", value: stats.open, icon: Loader, kc: "rgb(var(--c-amber-400))", note: "With a department right now" },
    { label: "Resolved", value: stats.resolved, icon: CheckCircle2, kc: "rgb(var(--c-emerald-400))", note: "Verified by the Collector" }
  ];
  const actions = [
    { href: "/citizen/file-complaint", icon: FilePlus2, title: "File a complaint", text: "Report a civic issue with a photo and location", kc: "rgb(var(--c-navy-500))" },
    { href: "/citizen/track-complaints", icon: Search, title: "Track status", text: "Follow each complaint to closure", kc: "rgb(var(--c-sky-400))" },
    { href: "/profile", icon: UserRound, title: "My profile", text: "Contact details and ward", kc: "rgb(var(--c-violet-400))" }
  ];

  return (
    <div className="diq-bg flex min-h-screen flex-col">
      <Header userName={firstName || session.email} homeHref="/citizen" nav={CITIZEN_NAV} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {/* page head, as on the Collector console */}
        <section className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-500">Public grievance redressal</p>
            <h1 className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight text-ink">
              Welcome{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-1 max-w-xl text-[13.5px] text-ink-subtle">
              Report a civic issue in your neighbourhood or follow one you have filed. Most complaints reach a department within minutes.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/citizen/track-complaints" className="diq-tbtn">
              <Search className="h-4 w-4" aria-hidden="true" />
              Track status
            </Link>
            <Link
              href="/citizen/file-complaint"
              className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-brand px-4 text-[13px] font-semibold text-white shadow-brand transition hover:brightness-110"
            >
              <FilePlus2 className="h-4 w-4" aria-hidden="true" />
              File a complaint
            </Link>
          </div>
        </section>

        {/* KPI tiles */}
        <section className="stagger mb-5 grid gap-3 sm:grid-cols-3">
          {statCards.map(({ label, value, icon: Icon, kc, note }) => (
            <div key={label} className="diq-kpi" style={{ ["--kc" as string]: kc }}>
              <span className="diq-ic">
                <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-subtle">{label}</p>
                <p className="text-[30px] font-extrabold leading-[1.1] tracking-tight tabular-nums text-ink">{value}</p>
                <p className="truncate text-xs text-ink-subtle">{note}</p>
              </div>
            </div>
          ))}
        </section>

        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          {/* Recent activity */}
          <section className="diq-panel min-w-0 animate-fade-up lg:self-start">
            <div className="flex items-center gap-2.5 px-4 pb-2 pt-3.5">
              <span className="diq-ic h-7 w-7 rounded-[9px]" style={{ ["--kc" as string]: "rgb(var(--c-navy-500))" }}>
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2 className="text-sm font-bold text-ink">Recent complaints</h2>
              {recentRows.length > 0 && (
                <Link
                  href="/citizen/track-complaints"
                  className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-navy-700 transition hover:bg-navy-50"
                >
                  See all
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              )}
            </div>

            {recentRows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
                  <FileText className="h-5 w-5" />
                </span>
                <p className="mt-1 text-sm font-semibold text-ink">No complaints yet</p>
                <p className="max-w-sm text-sm leading-relaxed text-ink-muted">
                  When you report a civic issue, it will appear here with its current stage.
                </p>
              </div>
            ) : (
              <ul className="space-y-2 px-3 pb-3">
                {recentRows.map((c) => (
                  <li key={c.complaint_code as string}>
                    <Link
                      href="/citizen/track-complaints"
                      className="flex items-center justify-between gap-4 rounded-[10px] border border-canvas-border bg-canvas-sunken/60 px-3.5 py-3 transition hover:border-navy-300/60"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{c.title as string}</p>
                        <p className="mt-0.5 text-xs text-ink-subtle">
                          <span className="font-mono">{c.complaint_code as string}</span> &middot; {c.department_name as string} &middot;{" "}
                          {new Date(c.created_at as string).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      <StatusBadge status={c.status as ComplaintStatus} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Quick actions + helpline */}
          <section className="flex min-w-0 flex-col gap-4">
            <div className="diq-panel animate-fade-up p-3">
              <h2 className="px-1 pb-2 pt-0.5 text-sm font-bold text-ink">Quick actions</h2>
              <div className="space-y-2">
                {actions.map(({ href, icon: Icon, title, text, kc }) => (
                  <Link
                    key={href}
                    href={href}
                    style={{ ["--kc" as string]: kc }}
                    className="group flex items-center gap-3 rounded-[10px] border border-canvas-border bg-canvas-sunken/60 px-3 py-2.5 transition hover:border-navy-300/60"
                  >
                    <span className="diq-ic h-9 w-9">
                      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block text-[13.5px] font-semibold text-ink">{title}</b>
                      <span className="block truncate text-xs text-ink-subtle">{text}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-navy-700" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-[14px] border border-amber-200 bg-amber-50 p-3.5">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Phone className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <p className="text-[13px] text-amber-800">
                Emergency or life-threatening civic issue? Call the GCC helpline <span className="font-bold">1913</span>, 24&times;7.
              </p>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
