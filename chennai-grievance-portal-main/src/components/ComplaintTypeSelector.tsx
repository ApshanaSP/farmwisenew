"use client";

/**
 * Complaint type in two steps: pick a category from a visual grid, then a subtype within it.
 *
 * Choosing a different category clears the subtype, so the pair is never
 * inconsistent. The "Other" category has no fixed department — selecting it
 * reveals a description box, and the department is decided at submit time by
 * the classifier in src/lib/ai-classifier.ts from what the citizen writes.
 */

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle, Building, Building2, CheckCircle2, ChevronRight, CloudFog, Construction, Droplets, HeartPulse, IdCard, Info, Lightbulb, MoreHorizontal,
  ReceiptIndianRupee, Search, Send, Sparkles, Trash2, Trees, Waves, Wind, X, type LucideIcon
} from "lucide-react";
import { Skeleton } from "@/components/ui";
import { EASE_OUT, spring } from "@/components/ui/motion";

export interface Subcomplaint {
  id: number;
  gccId: number;
  label: string;
  categoryId: number;
  departmentId: number | null;
  departmentName: string | null;
  mappingStatus: "mapped" | "assumed" | "unmapped";
}

export interface ComplaintCategory {
  id: number;
  name: string;
  sortOrder: number;
  subcomplaints: Subcomplaint[];
}

export interface TaxonomySource {
  url: string;
  label: string;
  fetchedAt: string;
  notes?: string;
}

interface Props {
  categories: ComplaintCategory[];
  selectedCategoryId: number | null;
  onSelectCategory: (categoryId: number | null) => void;
  selectedId: number | null;
  onSelect: (subcomplaint: Subcomplaint | null) => void;
  /** Free text for the "Other" category. */
  otherDescription: string;
  onOtherDescriptionChange: (value: string) => void;
  source?: TaxonomySource | null;
  loading?: boolean;
}

/** A category with no fixed department is routed from the description. */
const isOtherCategory = (name: string) => name.trim().toLowerCase() === "other";

/** One icon per category, by what it is about. */
function catIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (n.includes("light")) return Lightbulb;
  if (n.includes("park")) return Trees;
  if (n.includes("toilet")) return Building;
  if (n.includes("building") || n.includes("plan")) return Building2;
  if (n.includes("tax") || n.includes("licen")) return ReceiptIndianRupee;
  if (n.includes("voter")) return IdCard;
  if (n.includes("garbage")) return Trash2;
  if (n.includes("health")) return HeartPulse;
  if (n.includes("road") || n.includes("street")) return Construction;
  if (n.includes("stagnation") || n.includes("drain")) return Droplets;
  if (n.includes("air")) return Wind;
  if (n.includes("flood")) return Waves;
  if (n.includes("general")) return CloudFog;
  return MoreHorizontal;
}
const title = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|\s|-)\w/g, (m) => m.toUpperCase()) : s);

/** Highlight the matched part of a label. */
function Mark({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded-[3px] bg-navy-100 px-0.5 text-navy-800">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export default function ComplaintTypeSelector({
  categories,
  selectedCategoryId,
  onSelectCategory,
  selectedId,
  onSelect,
  otherDescription,
  onOtherDescriptionChange,
  source,
  loading
}: Props) {
  const [q, setQ] = useState("");
  const [sq, setSq] = useState("");
  const category = categories.find((c) => c.id === selectedCategoryId) ?? null;
  const subtypes = category?.subcomplaints ?? [];
  const selected = subtypes.find((s) => s.id === selectedId) ?? null;
  const otherSelected = Boolean(category && isOtherCategory(category.name));

  // searching matches category names and their sub-types, so "pothole" finds Road and Footpath
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(t) || c.subcomplaints.some((s) => s.label.toLowerCase().includes(t)));
  }, [categories, q]);
  const subShown = useMemo(() => {
    const t = (sq || q).trim().toLowerCase();
    return t ? subtypes.filter((s) => s.label.toLowerCase().includes(t)) : subtypes;
  }, [subtypes, sq, q]);

  const pickCategory = (id: number | null) => {
    onSelectCategory(id);
    // The old subtype belongs to the old category.
    onSelect(null);
    setSq("");
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} h={92} r={12} />)}
      </div>
    );
  }

  return (
    <div>
      {/* breadcrumb: Complaint type › Category › Sub type */}
      <nav aria-label="Complaint type" className="mb-4 flex min-h-[28px] flex-wrap items-center gap-1.5 text-[13px]">
        <button type="button" onClick={() => pickCategory(null)} className={`rounded-md px-1.5 py-0.5 font-semibold ${category ? "text-navy-600 hover:bg-navy-50" : "text-ink"}`}>
          All types
        </button>
        {category && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-ink-faint" aria-hidden="true" />
            <span className={`px-1 font-semibold ${selected ? "text-ink-muted" : "text-ink"}`}>{title(category.name)}</span>
          </>
        )}
        {selected && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-ink-faint" aria-hidden="true" />
            <span className="truncate px-1 font-semibold text-ink">{selected.label}</span>
          </>
        )}
      </nav>

      <AnimatePresence mode="wait" initial={false}>
        {!category ? (
          <motion.div key="grid" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22, ease: EASE_OUT }}>
            <div className="relative mb-4">
              <span className="input-affix"><Search className="h-[18px] w-[18px]" aria-hidden="true" /></span>
              <input type="search" className="form-input pl-10" placeholder="Search complaint types — e.g. pothole, garbage, street light"
                aria-label="Search complaint types" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <motion.ul layout className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4" aria-label="Complaint types">
              <AnimatePresence initial={false}>
                {shown.map((c) => {
                  const Icon = catIcon(c.name);
                  const other = isOtherCategory(c.name);
                  return (
                    <motion.li key={c.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={spring.snappy}>
                      <button type="button" id={c.id === categories[0]?.id ? "complaintCategory" : undefined} onClick={() => pickCategory(c.id)}
                        className="group flex h-full min-h-[96px] w-full flex-col justify-between gap-3 rounded-[12px] border border-canvas-border bg-canvas-sunken/60 p-3.5 text-left transition duration-150 hover:-translate-y-0.5 hover:border-navy-300 hover:bg-canvas-raised active:scale-[.98]">
                        <span className={`flex h-9 w-9 items-center justify-center rounded-[10px] ring-1 ring-inset transition group-hover:scale-105 ${other ? "bg-violet-50 text-violet-700 ring-violet-200" : "bg-navy-50 text-navy-700 ring-navy-200"}`}>
                          {other ? <Sparkles className="h-[18px] w-[18px]" aria-hidden="true" /> : <Icon className="h-[18px] w-[18px]" aria-hidden="true" />}
                        </span>
                        <span>
                          <b className="block text-[13.5px] font-semibold leading-snug text-ink"><Mark text={title(c.name)} q={q} /></b>
                          <span className="text-[11.5px] text-ink-subtle">{other ? "Describe it; we route it" : `${c.subcomplaints.length} sub type${c.subcomplaints.length === 1 ? "" : "s"}`}</span>
                        </span>
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </motion.ul>
            {shown.length === 0 && (
              <p className="mt-6 text-center text-sm text-ink-muted">No type matches “{q}”. Try another word, or choose <b className="text-ink">Other</b>.</p>
            )}
          </motion.div>
        ) : (
          <motion.div key={`sub-${category.id}`} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.22, ease: EASE_OUT }}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <label className="form-label mb-0" htmlFor="complaintSubtypeSearch">
                Sub type <span className="text-red-600">*</span> <span className="normal-case tracking-normal text-ink-faint">· {subtypes.length} under {title(category.name)}</span>
              </label>
              {subtypes.length > 6 && (
                <div className="relative w-full sm:w-64">
                  <span className="input-affix"><Search className="h-4 w-4" aria-hidden="true" /></span>
                  <input id="complaintSubtypeSearch" type="search" className="form-input h-9 py-1.5 pl-9 text-[13.5px]" placeholder="Filter sub types" value={sq} onChange={(e) => setSq(e.target.value)} />
                </div>
              )}
            </div>
            <ul id="complaintSubtype" role="listbox" aria-label="Complaint sub type" className="max-h-[340px] space-y-1.5 overflow-y-auto pr-1">
              {subShown.map((s) => {
                const on = s.id === selectedId;
                return (
                  <li key={s.id} role="option" aria-selected={on}>
                    <button type="button" onClick={() => onSelect(on ? null : s)}
                      className={`flex w-full items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-left text-[14px] transition duration-150 ${
                        on ? "border-navy-400 bg-navy-50 text-ink shadow-glow" : "border-canvas-border bg-canvas-raised text-ink-muted hover:border-navy-200 hover:text-ink"}`}>
                      <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 transition ${on ? "border-navy-500 bg-navy-500" : "border-slate-300"}`}>
                        {on && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </span>
                      <span className="min-w-0 flex-1"><Mark text={s.label} q={sq || q} /></span>
                      {s.departmentName && <span className="hidden flex-none text-[11.5px] text-ink-subtle sm:inline">{s.departmentName}</span>}
                    </button>
                  </li>
                );
              })}
              {subShown.length === 0 && <li className="py-4 text-center text-sm text-ink-muted">No sub type matches. Clear the filter to see all {subtypes.length}.</li>}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* "Other": the citizen describes it, the classifier routes it */}
      <AnimatePresence>
        {otherSelected && selected && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-5 rounded-[12px] border border-violet-200 bg-violet-50/60 p-4">
              <label className="form-label" htmlFor="otherDescription">Describe the complaint <span className="text-red-600">*</span></label>
              <textarea id="otherDescription" rows={3} maxLength={400} required className="form-input bg-canvas-raised"
                placeholder="e.g. A transformer near the park has been sparking for two days."
                value={otherDescription} onChange={(e) => onOtherDescriptionChange(e.target.value)} />
              <p className="mt-2 flex items-start gap-1.5 text-xs text-violet-700">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                Your description is read automatically and the complaint is routed to the department that handles it. An officer confirms the routing before work begins.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Current selection: where it goes (this is what auto-routing decided) */}
      <div className="mt-5 min-h-[44px]">
        <AnimatePresence mode="wait" initial={false}>
          {selected ? (
            <motion.div key={selected.id} initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={spring.snappy}
              className="flex flex-wrap items-start gap-3 rounded-[12px] border border-emerald-200 bg-emerald-50 p-3.5">
              <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 text-emerald-600" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{title(category?.name ?? "")} › {selected.label}</p>
                {selected.departmentName ? (
                  <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-canvas-raised px-2.5 py-1 text-[12.5px] text-ink-muted ring-1 ring-inset ring-emerald-200">
                    <Send className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    We&apos;ll send this to: <b className="font-semibold text-ink">{selected.departmentName}</b>
                    {selected.mappingStatus === "assumed" && " (confirmed by an officer)"}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-ink-muted">The department is chosen from your description when you submit.</p>
                )}
                {selected.mappingStatus === "assumed" && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                    The Corporation does not publish a department for this type, so this routing is our best match and an officer will confirm it.
                  </p>
                )}
              </div>
              <button type="button" onClick={() => { onSelect(null); onSelectCategory(null); }}
                className="flex-shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100" aria-label="Clear the complaint type">
                <X className="inline h-3.5 w-3.5" aria-hidden="true" /> Clear
              </button>
            </motion.div>
          ) : (
            <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-start gap-1.5 text-sm text-ink-muted">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-faint" aria-hidden="true" />
              {category ? "Choose the sub type that fits best." : <>Choose a complaint type, then the sub type that fits best. If nothing matches, pick <span className="font-semibold text-ink">Other</span> and describe it.</>}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {source && (
        <p className="mt-4 border-t border-canvas-border pt-3 text-[11px] leading-relaxed text-ink-faint">
          Complaint types imported from the Greater Chennai Corporation grievance portal (
          <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-navy-600">source</a>
          ) on {new Date(source.fetchedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.
        </p>
      )}
    </div>
  );
}
