"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { ArrowLeft, Building2, CalendarDays, Check, Copy, FileSearch, MapPin, Paperclip, Search, Tag, X } from "lucide-react";
import Header from "@/components/Header";
import { CITIZEN_NAV, COMPLAINT_STATUSES } from "@/lib/constants";
import Footer from "@/components/Footer";
import StatusBadge from "@/components/StatusBadge";
import StatusTracker, { MiniProgress } from "@/components/StatusTracker";
import { EmptyState, Skeleton } from "@/components/ui";
import { EASE_OUT, spring } from "@/components/ui/motion";
import { ComplaintStatus } from "@/types";

const MiniMap = dynamic(() => import("@/components/citizen/MiniMap"), { ssr: false });

interface ComplaintListItem {
  id: number;
  complaint_code: string;
  title: string;
  status: ComplaintStatus;
  rejected_stage: "Department Officer" | "Collector" | null;
  remarks: string | null;
  created_at: string;
  department_name: string;
  complaint_type_name: string;
  zone_name: string;
  locality_name: string;
}

const SHORT: Record<string, string> = {
  "Complaint Filed": "Filed", "Pending Approval": "Pending approval", "Approved by Department Officer": "Approved", "In Progress": "In progress",
  "Completed - Pending Collector Verification": "Awaiting Collector", "Verified by Collector": "Verified", Rejected: "Rejected"
};
const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** Track complaints: the list (search by code, status chips) on the left, the selected complaint's journey on the right. */
export default function TrackComplaintsPage() {
  const [me, setMe] = useState<any>(null);
  const [complaints, setComplaints] = useState<ComplaintListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((d) => d && setMe(d.user));
    loadComplaints().then((list) => {
      // opened from the home page's recent list: select that complaint (or the newest on a wide screen)
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) toggleDetails(code);
      else if (list?.[0] && window.innerWidth >= 1024) toggleDetails(list[0].complaint_code);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadComplaints(codeQuery?: string, status?: string): Promise<ComplaintListItem[] | null> {
    setLoading(true);
    const params = new URLSearchParams();
    if (codeQuery) params.set("code", codeQuery);
    if (status) params.set("status", status);
    const res = await fetch(`/api/complaints?${params.toString()}`);
    let list: ComplaintListItem[] | null = null;
    if (res.ok) {
      const data = await res.json();
      list = data.complaints || [];
      setComplaints(list!);
    }
    setLoading(false);
    return list;
  }

  async function toggleDetails(code: string) {
    if (expandedCode === code) {
      setExpandedCode(null);
      setDetail(null);
      return;
    }
    setExpandedCode(code);
    setDetailLoading(true);
    const res = await fetch(`/api/complaints/${code}`);
    if (res.ok) {
      const data = await res.json();
      setDetail(data.complaint);
      setHistory(data.history || []);
    }
    setDetailLoading(false);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    loadComplaints(search, statusFilter);
  }
  const pickStatus = (s: string) => { setStatusFilter(s); loadComplaints(search, s); };

  const sel = complaints.find((c) => c.complaint_code === expandedCode) ?? null;
  const copy = async (code: string) => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* clipboard blocked */ }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen flex-col diq-bg">
        <Header userName={me?.email} homeHref="/citizen" nav={CITIZEN_NAV} />
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8 sm:px-6">
          <div className="mb-6">
            <Link href="/citizen" className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-subtle transition hover:text-navy-600">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />Back to overview
            </Link>
            <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-ink">Track complaint status</h1>
            <p className="mt-1 text-[15px] text-ink-muted">Every complaint you&apos;ve filed, with its current stage.</p>
          </div>

          <div className="grid gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
            {/* ------------------------------------------------------------------ list */}
            <section className={`min-w-0 ${sel ? "hidden lg:block" : ""}`}>
              <form onSubmit={handleSearchSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <span className="input-affix"><Search className="h-[18px] w-[18px]" aria-hidden="true" /></span>
                  <input type="text" placeholder="Search by complaint number…" aria-label="Search by complaint number" className="form-input pl-10 text-[14px]"
                    value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <button type="submit" className="btn-primary h-[44px] px-4"><Search className="h-4 w-4" aria-hidden="true" />Search</button>
              </form>
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
                {["", ...COMPLAINT_STATUSES].map((s) => {
                  const on = statusFilter === s;
                  return (
                    <button key={s || "all"} type="button" aria-pressed={on} onClick={() => pickStatus(s)}
                      className={`h-8 rounded-full border px-3 text-[12.5px] font-medium transition duration-150 active:scale-[.97] ${
                        on ? "border-transparent bg-brand text-white shadow-brand" : "border-canvas-border bg-canvas-raised text-ink-muted hover:border-navy-300 hover:text-ink"}`}>
                      {s ? SHORT[s] ?? s : "All"}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4">
                {loading ? (
                  <div className="space-y-2.5">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="card-flat space-y-2.5 p-4"><Skeleton h={12} w={120} /><Skeleton h={16} w="80%" /><Skeleton h={4} /></div>
                    ))}
                  </div>
                ) : complaints.length === 0 ? (
                  <div className="card p-2">
                    <EmptyState icon={<FileSearch />} action={<Link href="/citizen/file-complaint" className="btn-primary h-9">File a complaint</Link>}>
                      <b className="block text-ink">No complaints found</b>You haven&apos;t filed any complaints matching this search yet.
                    </EmptyState>
                  </div>
                ) : (
                  <ul className="space-y-2.5">
                    {complaints.map((c, i) => {
                      const on = expandedCode === c.complaint_code;
                      return (
                        <motion.li key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.35, ease: EASE_OUT }}>
                          <button type="button" onClick={() => toggleDetails(c.complaint_code)} aria-expanded={on}
                            className={`relative w-full overflow-hidden rounded-[12px] border p-4 text-left transition duration-150 ${
                              on ? "border-navy-300/70 bg-canvas-raised shadow-card" : "border-canvas-border bg-canvas-raised/70 hover:border-slate-300 hover:bg-canvas-raised"}`}>
                            {on && <motion.span layoutId="trk-bar" className="absolute bottom-3 left-0 top-3 w-[3px] rounded-r bg-navy-500" transition={spring.snappy} />}
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-mono text-[12px] font-medium text-navy-600">{c.complaint_code}</p>
                                <p className="mt-0.5 line-clamp-2 text-[14.5px] font-semibold leading-snug text-ink">{c.title}</p>
                                <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-ink-subtle"><Tag className="h-3 w-3 flex-none" aria-hidden="true" />{c.complaint_type_name} · {fmtDate(c.created_at)}</p>
                              </div>
                              <StatusBadge status={c.status} short />
                            </div>
                            <div className="mt-3"><MiniProgress status={c.status} /></div>
                          </button>
                        </motion.li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            {/* ---------------------------------------------------------------- detail */}
            <section className={`min-w-0 ${sel ? "" : "hidden lg:block"}`}>
              <AnimatePresence mode="wait">
                {sel ? (
                  <motion.article key={sel.complaint_code} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: EASE_OUT }}
                    className="sticky top-[84px] overflow-hidden rounded-[14px] border border-canvas-border bg-canvas-raised shadow-card">
                    <header className="border-b border-canvas-border p-5 sm:p-6">
                      <button type="button" onClick={() => toggleDetails(sel.complaint_code)} className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-subtle hover:text-ink lg:hidden">
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />All complaints
                      </button>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[15px] font-semibold text-navy-600">{sel.complaint_code}</span>
                          <button type="button" onClick={() => copy(sel.complaint_code)} className="ui-iconbtn sm ghost" aria-label="Copy complaint number" title="Copy complaint number">
                            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                          </button>
                        </div>
                        <StatusBadge status={sel.status} />
                      </div>
                      <h2 className="mt-2 text-[20px] font-semibold leading-snug tracking-[-0.02em] text-ink">{sel.title}</h2>
                      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                        {[
                          { icon: Building2, label: "Department", value: sel.department_name },
                          { icon: Tag, label: "Type", value: sel.complaint_type_name },
                          { icon: MapPin, label: "Location", value: `${sel.locality_name}, ${sel.zone_name}` },
                          { icon: CalendarDays, label: "Filed on", value: fmtDate(sel.created_at) }
                        ].map(({ icon: Icon, label, value }) => (
                          <div key={label} className="flex min-w-0 items-start gap-2">
                            <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ink-faint" aria-hidden="true" />
                            <div className="min-w-0">
                              <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">{label}</dt>
                              <dd className="truncate text-[13px] font-medium text-ink-muted" title={value}>{value}</dd>
                            </div>
                          </div>
                        ))}
                      </dl>
                      {sel.remarks && sel.status !== "Rejected" && (
                        <p className="mt-4 rounded-[10px] border border-canvas-border bg-canvas-sunken p-3 text-[13px] text-ink-muted">
                          <span className="font-semibold text-ink">Remarks: </span>{sel.remarks}
                        </p>
                      )}
                    </header>

                    <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_260px]">
                      <div>
                        <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">Journey</h3>
                        {detailLoading ? (
                          <div className="space-y-4">{[0, 1, 2, 3].map((i) => <div key={i} className="flex gap-3"><Skeleton w={28} h={28} r={14} /><div className="flex-1 space-y-2"><Skeleton h={13} w="60%" /><Skeleton h={10} w="30%" /></div></div>)}</div>
                        ) : (
                          <StatusTracker status={sel.status} rejectedStage={sel.rejected_stage} remarks={sel.remarks} history={history} />
                        )}
                      </div>
                      {detail && !detailLoading && (
                        <aside className="space-y-4">
                          {detail.latitude != null && detail.longitude != null && (
                            <div>
                              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">On the map</h3>
                              <MiniMap lat={Number(detail.latitude)} lng={Number(detail.longitude)} />
                            </div>
                          )}
                          <dl className="space-y-3 text-[13px]">
                            <div><dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">Street</dt><dd className="text-ink-muted">{detail.street_name}</dd></div>
                            <div><dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">Specific location</dt><dd className="text-ink-muted">{detail.specific_location || "—"}</dd></div>
                            <div className="flex gap-6">
                              <div><dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">Ward</dt><dd className="font-mono text-ink-muted">{detail.ward_number}</dd></div>
                              <div><dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">Anonymous</dt><dd className="text-ink-muted">{detail.is_anonymous ? "Yes" : "No"}</dd></div>
                            </div>
                            <div><dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">Description</dt><dd className="leading-relaxed text-ink-muted">{detail.description}</dd></div>
                          </dl>
                          {detail.media_path && (
                            /\.(png|jpe?g|webp|gif)$/i.test(detail.media_path) ? (
                              <button type="button" onClick={() => setPhoto(detail.media_path)} className="block overflow-hidden rounded-[10px] border border-canvas-border transition hover:border-navy-300" aria-label="View the attached photo">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={detail.media_path} alt="Attached photo" className="aspect-[4/3] w-full object-cover" />
                              </button>
                            ) : (
                              <a href={detail.media_path} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-600 hover:underline">
                                <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />View attached photo/video
                              </a>
                            )
                          )}
                        </aside>
                      )}
                    </div>
                  </motion.article>
                ) : (
                  !loading && complaints.length > 0 && (
                    <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card grid min-h-[320px] place-items-center">
                      <EmptyState icon={<FileSearch />}>Choose a complaint to see its journey.</EmptyState>
                    </motion.div>
                  )
                )}
              </AnimatePresence>
            </section>
          </div>
        </main>
        <Footer />

        {/* photo lightbox */}
        <AnimatePresence>
          {photo && (
            <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setPhoto(null)} role="dialog" aria-label="Attached photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <motion.img src={photo} alt="Attached photo" className="max-h-full max-w-full rounded-[12px] shadow-lift" initial={{ scale: 0.94 }} animate={{ scale: 1 }} transition={spring.soft} />
              <button type="button" className="ui-iconbtn absolute right-5 top-5" aria-label="Close" onClick={() => setPhoto(null)}><X aria-hidden="true" /></button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
