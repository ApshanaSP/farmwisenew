"use client";
/**
 * Today's briefing on the officer's page, the Collector's "Today at a glance" for the department (collector/app/BriefingBook.tsx): one
 * sentence, the last 7 days, what is happening, what needs the officer and what to do next. The figures are the Collector's own with
 * the department as the filter (lib/officer/insights.ts deptBriefing: the Collector's briefing book), and the sentences are made by
 * the same code (lib/collector/glance.ts composeGlance), in English and Tamil, so both consoles say the same thing the same way.
 *
 * What only the Collector does is left out (verifying finished work, instructing a department, asking a department to close or record
 * its cases): the officer's own next steps are said instead (approve, redo what the Collector reopened, finish what is due). The count
 * tiles are not repeated here: they are in the band above. Resolved is the officer's own count, as on its tile (officer-day-13).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { composeGlance, say, type GlanceIn, type GlanceOpen, type GlancePoint } from "@/lib/collector/glance";
import { useLang } from "@/lib/i18n/lang";
import { I } from "@/components/collector/app/icons";
import { fullTitle, rel, type Row } from "@/components/collector/app/lib";
import { Group, Week } from "@/components/collector/app/BriefingBook";
import { Sentence } from "@/components/collector/app/DeptSummary";
import { greeting } from "@/components/collector/app/Shell";
import { canSpeak, speak, stopSpeaking } from "@/components/collector/app/assistant/speech";
import type { DeptBriefing } from "@/lib/officer/insights";
import type { Ctx } from "./OfficerApp";

const STATUS = { normal: "Normal", watchful: "Watchful", alert: "Alert" } as const;
/** the greeting in Tamil, for the card's own தமிழ் switch (the card's sentences are written in both languages, never machine-translated) */
const GREET_TA: Record<string, string> = { "Good morning": "காலை வணக்கம்", "Good afternoon": "மதிய வணக்கம்", "Good evening": "மாலை வணக்கம்" };
const shortName = (n: string) => String(n ?? "").replace(/\s*\(.*\)\s*$/, "");

/** What the glance is made from: the Collector's figures for the department and area, with the officer's own Resolved and news. */
export function officerGlanceInput(b: DeptBriefing, c: Pick<Ctx, "ov" | "dept" | "zoneName" | "talukName">): GlanceIn {
  const t = b.today;
  const words = [shortName(c.dept.name), c.zoneName, c.talukName ? `${c.talukName} taluk` : null].filter(Boolean).join(" · ");
  // the department's news story most outlets carried, linked to one of its incidents
  const top = [...(c.ov.news as Row[])].sort((x, y) => (y.outletNames?.length ?? 0) - (x.outletNames?.length ?? 0))[0] ?? null;
  return {
    scope: { zone: c.zoneName, taluk: c.talukName, dept: c.dept.name, cat: null, words },
    period: c.ov.period, now: b.now,
    cur: { ...t.kpi.cur, resolved: c.ov.resolved.cur }, prev: { ...t.kpi.prev, resolved: c.ov.resolved.prev },
    overdue: t.overdue, deaths: t.deaths, injured: t.injured,
    // the Collector's own list of finished work to check, and "not yet checked on the ground", are the Collector's: not the officer's
    awaiting: 0, unchecked: null,
    kinds: t.kinds, zones: t.zones,
    // no department names: "Instruct the department", "Ask the department to close..." are the Collector's steps
    depts: [], cases: t.cases.map((x) => ({ ...x, dept: null, deptName: null, next: null, acted: true })), fatal: t.fatal,
    news: top ? { title: fullTitle(top), ta: null, outlets: top.outletNames?.length ?? 0, act: false, key: String(top.id), incident: String(top.id) } : null,
    story: null, differ: null,
    newsOnly: b.gapsTotal ? { n: b.gapsTotal, deptName: null, deptN: 0 } : null,
    // the department's own share of a rise: never "times the usual" (that is the whole zone's)
    rise: b.rise ? { ...b.rise, times: null } : null,
    warning: null, env: null
  };
}

/** The officer's own next steps, first in "What to do next": each opens where it is done. */
export function officerSteps(k: Ctx["ov"]["counts"]): GlancePoint[] {
  const out: GlancePoint[] = [];
  const s = (n: number, one: string, many: string) => (n === 1 ? one : many);
  if (k.new) out.push({ key: "approve", icon: "tasks", tone: k.newSerious ? "sev" : "high",
    en: say`Approve the ${k.new} new ${s(k.new, "grievance", "grievances")}${k.newSerious ? say`; the ${k.newSerious} severe or high first` : ""}.`,
    ta: say`${k.new} புதிய புகார்களை அங்கீகரியுங்கள்${k.newSerious ? say`; முதலில் கடுமையான அல்லது அதிக தீவிரமான ${k.newSerious}` : ""}.`,
    open: { k: "list", preset: { status: "approve" }, title: "New grievances: waiting for your approval" }, act: "Open My work" });
  if (k.returned) out.push({ key: "redo", icon: "refresh", tone: "high",
    en: say`Redo the ${k.returned} ${s(k.returned, "case", "cases")} the Collector reopened, and send a fresh report.`,
    ta: say`ஆட்சியர் மீண்டும் திறந்த ${k.returned} வழக்குகளைச் சரிசெய்து, புதிய அறிக்கையை அனுப்புங்கள்.`,
    open: { k: "list", preset: { status: "reopened" }, title: "Reopened by the Collector" }, act: "Open My work" });
  if (k.due) out.push({ key: "due", icon: "timer", tone: "high",
    en: say`Finish the ${k.due} ${s(k.due, "case", "cases")} due within 24 hours.`, ta: say`24 மணி நேரத்தில் காலக்கெடு முடியும் ${k.due} வழக்குகளை முடியுங்கள்.`,
    open: { k: "list", preset: { status: "due" }, title: "Due within 24 hours" }, act: "Open the list" });
  return out;
}

/** "Today at a glance" for the department. `b`: undefined while it loads, null when the store has no briefing for it. */
export function OfficerBriefing({ c, b, failed, retry }: { c: Ctx; b: DeptBriefing | null | undefined; failed: boolean; retry: () => void }) {
  const [uiLang] = useLang();
  const [lang, setLang] = useState<"en" | "ta">("en");
  useEffect(() => { setLang(uiLang === "ta" ? "ta" : "en"); }, [uiLang]);
  const ta = lang === "ta";
  const g = useMemo(() => (b ? composeGlance(officerGlanceInput(b, c)) : null), [b, c.ov, c.zoneName, c.talukName]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = useMemo(() => (g ? [...officerSteps(c.ov.counts), ...g.next].slice(0, 4) : []), [g, c.ov.counts]);
  const box = useRef<HTMLElement>(null);
  const [talking, setTalking] = useState(false);
  const [voice, setVoice] = useState(false);
  useEffect(() => { setVoice(canSpeak()); return () => stopSpeaking(); }, []);
  const listen = () => {
    if (talking) { stopSpeaking(); setTalking(false); return; }
    const said = [...(box.current?.querySelectorAll<HTMLElement>("[data-say]") ?? [])].map((x) => x.textContent ?? "").filter(Boolean).join(" ");
    setTalking(speak(said, ta ? "ta-IN" : "en-IN", () => setTalking(false)));
  };
  const pick = (l: "en" | "ta") => { stopSpeaking(); setTalking(false); setLang(l); };

  /** what a click on a point does, on the officer's own screens */
  const open = (o: GlanceOpen) => {
    switch (o.k) {
      case "inc": case "act": return c.openGrievance(o.id);
      case "news": return c.openGrievance(o.key, "news");
      case "zone": return c.setZone(o.zone);
      case "gaps": return c.openNews("gaps");
      case "rise": return c.openList(o.cat, b?.rise?.label ?? "Rising");
      case "list": {
        const p = o.preset;
        if (p.status === "approve") return c.openWork("new");
        if (p.status === "reopened") return c.openWork("returned");
        if (p.status === "due") return c.openList(null, o.title, "due");
        if (p.status === "overdue") return c.openList(null, o.title, "overdue");
        if (p.status === "open") return c.openList(p.cat ?? null, o.title, "open", { sev: p.sev ?? null });
        if (p.status === "Resolved") return c.openList(null, o.title, undefined, { tab: "verified" });
        return c.openList(p.cat ?? null, o.title, undefined, { sev: p.sev ?? null, tab: "all" });
      }
      default: return undefined;
    }
  };

  const name = c.ov.period === "daily" ? "Today at a glance" : `${c.ov.periodInfo.label} at a glance`;
  const head = (
    <header className="bb-h">
      <I n="scroll" />
      <h3>{name}</h3>
      <span className="gl-scope on"><I n="sliders" />{[c.dept.short, c.areaName].filter(Boolean).join(" · ")}</span>
      {b && (
        <span className={`bb-status lv-${b.status.level}`} title="Status of your department's view, by fixed rules: its deaths and severe incidents"
          data-tip={b.status.reasons.join(" · ") || undefined}>
          <i /><b>{STATUS[b.status.level as keyof typeof STATUS] ?? b.status.level}</b>{b.status.reasons.length > 0 && <span>{b.status.reasons.join(" · ")}</span>}
        </span>
      )}
      <span className="bb-tools">
        <span className="bb-lang" role="group" aria-label="Language">
          <button className={ta ? "" : "on"} aria-pressed={!ta} onClick={() => pick("en")}>EN</button>
          <button className={ta ? "on" : ""} aria-pressed={ta} onClick={() => pick("ta")}>தமிழ்</button>
        </span>
        {voice && g && <button className={`bb-btn${talking ? " talking" : ""}`} onClick={listen} title={talking ? "Stop" : "Read the key points aloud"} aria-pressed={talking}>
          {talking ? <span className="bb-bars" aria-hidden="true"><i /><i /><i /><i /></span> : <I n="volume" />}{talking ? "Stop" : "Listen"}</button>}
      </span>
    </header>
  );
  if (!b || !g) {
    return (
      <section className="bb-card bb-brief gl ofc-gl" ref={box} aria-busy={b === undefined && !failed}>
        {head}
        {failed ? <p className="bb-calm" role="alert"><I n="alert" />Today&apos;s briefing could not be loaded.
          <button className="lnk" onClick={retry}>Try again</button></p>
          : b === null ? <p className="bb-calm"><I n="checkc" />No briefing for {c.dept.short} in this view.</p>
            : <div className="ofc-gl-wait" role="status"><span /><span /><span /></div>}
      </section>
    );
  }
  return (
    <section className="bb-card bb-brief gl ofc-gl" ref={box}>
      {head}
      <p className="gl-say" lang={ta ? "ta" : "en"}>
        <span className="gl-hi" data-say="" data-no-i18n="">{ta ? `${GREET_TA[greeting(b.now)] ?? greeting(b.now)}, ${c.dept.short} அலுவலர்` : `${greeting(b.now)}, ${c.dept.short} officer`}</span>
        <span data-say=""><Sentence s={ta ? g.situation.ta : g.situation.en} /></span>
      </p>
      <div className="gl-grid ofc-gl-grid">
        <div className="gl-nums"><Week days={b.today.days} now={b.now} /></div>
        <Group title="What is happening" icon="pulse" points={g.happening} ta={ta} open={open}
          none={g.empty ? "Nothing was reported or resolved in this view." : "Nothing stands out in this view."} />
        <Group title="What needs you" icon="alert" points={g.needs} ta={ta} open={open} none="Nothing waits for you in this view.">
          {g.needs.length < 4 && b.oldest && (
            <button className="bb-fact" onClick={() => c.openGrievance(b.oldest!.id)} title="Open the oldest open complaint of this period">
              <I n="clock" /><b>Oldest open complaint</b><span>{rel(b.oldest.t, b.now)}</span><span className="ttl">{b.oldest.title}</span><I n="chevr" />
            </button>
          )}
        </Group>
        <Group title="What to do next" icon="tasks" points={next} ta={ta} open={open} none="No step is needed from you in this view." />
      </div>
    </section>
  );
}

