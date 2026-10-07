"use client";

import { useEffect, useState } from "react";
import type { IncidentDetail, Plain } from "@/lib/collector/intel";
import type { Analysis } from "@/lib/collector/analysis";
import { I } from "./icons";
import { OfficerCard } from "./Overview";
import { MEDIA_KIND, SOURCE_KIND, deptIcon, fmtDay, fmtShort, fmtTime, fullTitle, ms, plural, rel, sourceItems, type Row } from "./lib";
import type { Console } from "./CollectorApp";
import { SentNote, TakeAction } from "./TakeAction";

const CHANNEL: Record<string, string> = {
  citizen_app: "Citizen app", citizen_grievance: "Grievance portal", control_room_112: "Control room 112", fir_walk_in: "Police station",
  patrol: "Police patrol", field_staff: "Field staff", collector_office: "Collector's office", hospital_mis: "Hospital MIS",
  control_room: "Control room"
};
const SEV_COL: Record<string, string> = { Severe: "#C21F2A", High: "#C9600A", Medium: "#8A6700", Low: "#0E7C50" };

/** What the AI read in one news article: who, which bodies, casualties, where it stands, the exact place. */
export function NewsDetails({ ai }: { ai: Record<string, string | number> }) {
  const hurt = [ai.dead ? plural(Number(ai.dead), "death") : null, ai.injured ? `${ai.injured} injured` : null].filter(Boolean).join(", ");
  const items: [string, string | number | undefined][] = [
    ["Place", ai.place], ["People", ai.people], ["Bodies named", ai.organisations], ["Casualties", hurt || undefined], ["Status", ai.status]
  ];
  return (
    <dl className="ev-ai" title="Read from the article by AI; check the article before acting">
      {items.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v).replace(/_/g, " ").replace(/\|/g, ", ")}</dd></div>)}
    </dl>
  );
}

/** The AI analysis of an incident or a story, fetched once the pop-up is open (null until it arrives or when no model answered). */
export function useAnalysis(url: string | null, key: unknown) {
  const [a, setA] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!url) return;
    let live = true;
    setA(null);
    setBusy(true);
    fetch(url).then((r) => r.json()).then((j) => live && setA(j.analysis ?? null)).catch(() => undefined).finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [url, key]);
  return { a, busy };
}

/**
 * "What happened" and "Why it needs you": the AI's analysis of every report when it is ready (checked against the
 * facts on the server), the rules' wording until then or when no model answered.
 */
export function Explained({ a, busy, rules, open, deptName, needLabel = "Why it needs you" }: {
  a: Analysis | null; busy: boolean; rules: Plain | null; open: boolean; deptName: string; needLabel?: string;
}) {
  const what = a?.what ?? rules?.summary ?? "";
  const reasons = a ? a.why : (rules?.needsYou ? rules.attention.map((t) => ({ title: t, detail: "" })) : []);
  const next = a ? a.next : rules?.next ?? null;
  return (
    <>
      <div>
        <div className="iv-t"><I n="alert" />What happened{busy && !a ? <span className="ai-busy"><I n="spark" />Analysing the reports…</span> : null}</div>
        <p className="iv-sum iv-analysis">{what}</p>
        {!a && rules && rules.facts.length > 0 && <ul className="iv-facts">{rules.facts.map((f) => <li key={f}>{f}</li>)}</ul>}
      </div>
      {reasons.length > 0 ? (
        <div className="iv-need">
          <div className="iv-t"><I n="bell" />{needLabel}</div>
          <ol className="iv-why">
            {reasons.map((w) => <li key={w.title}>{w.detail ? <><b>{w.title}.</b> {w.detail}</> : w.title}</li>)}
          </ol>
          {next && !/^no action needed\.?$/i.test(next) && <p className="iv-next"><b>Next step:</b> {next}</p>}
          {a ? <p className="iv-ai"><I n="spark" />Analysed by AI ({a.model}) from these records; every figure is checked against them. Read before acting.</p>
            : rules?.ai ? <p className="iv-ai">Written by AI from this incident&apos;s records; check before acting.</p> : null}
        </div>
      ) : open ? (
        <div className="iv-ok"><I n="checkc" /><span><b>No action needed from you.</b> {a?.handled || `${deptName} is handling it; nothing about it is unusual.`}</span></div>
      ) : null}
    </>
  );
}

/**
 * The incident for the Collector: what happened and why it needs them (analysed by AI), the department's report and
 * any instruction sent, every report it unfolded from (including the incidents merged into it: the same problem in
 * the same area), and who is responsible. A severe open incident can be acted on here (Take action).
 */
export function IncidentView({ id, c, startAction }: { id: string; c: Console; startAction?: boolean }) {
  const [data, setData] = useState<IncidentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(!!startAction);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    setError(null);
    fetch(`/api/collector/incidents/${encodeURIComponent(id)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not load the incident.");
        if (live) setData(j);
      })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [id, c.reloadKey, reload]);
  const ana = useAnalysis(data ? `/api/collector/incidents/${encodeURIComponent(id)}/analysis` : null, `${reload}|${!!data}`);

  const i = data?.incident as Row | undefined;
  if (!data || !i || i.id !== id) {
    return (
      <div className="modal iv iv2" role="dialog" aria-label="Incident">
        <div className="iv-h"><button className="xbtn" onClick={c.closeAll} aria-label="Close"><I n="x" /></button><h2>{error ? "Incident" : "Loading…"}</h2></div>
        <div className="empty" style={{ color: error ? "var(--sev)" : undefined }}>{error ?? "Loading the incident…"}</div>
      </div>
    );
  }

  const open = Number(i.open) === 1;
  const severe = i.sev === "Severe";
  const reports = data.reports as Row[];
  const group = data.group as Row[];
  const emails = data.emails as Row[];
  const srcs = sourceItems(i);
  const dec = (data.decisions as Row[]).filter((x) => x.decision !== "note").slice(-1)[0];
  const deptContacts = (data.contacts as Row[]).filter((x) => x.dept_code === i.dept);
  const zoneContact = i.zone != null ? (data.contacts as Row[]).find((x) => x.zone_no != null && x.zone_no === i.zone) : undefined;
  const overdue = open && i.sla_due && ms(i.sla_due) < ms(c.now);
  const why = i.why as Plain;
  const newsOutlets = [...new Set(reports.filter((r) => r.source === "news" && r.publisher).map((r) => String(r.publisher)))];
  const grievances = reports.filter((r) => r.source === "grievance").length;
  const deptReports = data.deptReports as Row[];
  const byDept = dec?.decided_role === "department_officer";

  // the reports by day, oldest first
  const days: { day: string; items: Row[] }[] = [];
  for (const r of reports) {
    const day = String(r.t).slice(0, 10);
    const g = days[days.length - 1];
    if (g && g.day === day) g.items.push(r);
    else days.push({ day, items: [r] });
  }

  return (
    <div className="modal iv iv2" role="dialog" aria-label={fullTitle(i)}>
      <div className={`iv-h s-${String(i.sev).toLowerCase()}`}>
        <button className="xbtn" onClick={c.closeAll} aria-label="Close"><I n="x" /></button>
        <div className="iv-tags">
          <span className="tg solid" style={{ color: SEV_COL[i.sev as string] }}><I n="alert" />{i.sev} severity</span>
          <span className="tg">{i.status}</span>
          {emails.length > 0 && <span className="tg acted" title={emails[0].subject}><I n="checkc" />Action taken {rel(emails[0].t, c.now)}</span>}
          {dec?.decision === "verify" && <span className="tg"><I n="check" />Verified by you {rel(dec.t, c.now)}</span>}
          {dec?.decision === "resolve" && <span className="tg"><I n="check" />{byDept ? "Closed by the department" : "Resolved"} {rel(dec.t, c.now)}</span>}
          {data.assigned && <span className="tg"><I n="send" />Sent to {data.assigned.officer_designation ?? i.dept_name}</span>}
          {group.length > 0 && <span className="tg merged" title="The same problem reported in the same area, shown as one">
            <I n="layers" />{group.length + 1} incidents merged</span>}
          {newsOutlets.length > 0 && <span className="tg" title={newsOutlets.join(", ")}><I n="news" />In the news · {plural(newsOutlets.length, "outlet")}</span>}
          {grievances > 0 && <span className="tg"><I n="user" />{plural(grievances, "citizen complaint")}</span>}
        </div>
        <h2>{fullTitle(i)}</h2>
        <div className="iv-where">
          <span><I n="pin" />{[i.loc, i.zone_name, i.ward ? `Ward ${i.ward}` : null].filter(Boolean).join(" · ") || "Chennai"}</span>
          <span><I n={deptIcon(i.dept)} />{i.dept_name ?? i.dept}</span>
          <span><I n="clock" />First reported {fmtShort(i.t)} ({rel(i.t, c.now)})</span>
          {i.lat != null && <button className="iv-loc" onClick={() => c.locate(i)}><I n="target" />Show on map</button>}
          {severe && open && (
            <button className={`btn ta-go${emails.length ? " done" : ""}`} onClick={() => setActing(true)}
              title="The AI agent drafts an instruction to the department officer; you approve it">
              <I n={emails.length ? "checkc" : "send"} />{emails.length ? "Action taken · send again" : "Take action"}
            </button>
          )}
        </div>
      </div>

      <div className="iv-b">
        <section className="iv-col">
          <Explained a={ana.a} busy={ana.busy} rules={why} open={open} deptName={i.dept_name ?? "The department"} />
          {emails.length > 0 && <SentNote e={emails[0]} now={c.now} />}
          {deptReports.length > 0
            ? <DeptReport r={deptReports[0]} earlier={deptReports.length - 1} />
            : severe && open && Number(i.awaiting_collector) === 1 && (
              <div className="iv2-nophoto"><I n="photo" /><span><b>No completion report from the department yet.</b> The records say the work is done, but no remarks or site photos were sent. Take action to ask for them.</span></div>
            )}
          <div>
            <div className="iv-t"><I n="doc" />Key facts</div>
            <div className="facts">
              <div><small>{open ? "Open for" : "Closed"}</small><b>{open ? rel(i.t, c.now).replace(" ago", "") : i.closed_at ? fmtShort(i.closed_at) : i.status}</b></div>
              <div><small>Deadline</small><b style={{ color: overdue ? "var(--sev)" : undefined }}>{i.sla_due ? `${fmtShort(i.sla_due)}${overdue ? " · missed" : ""}` : "—"}</b></div>
              <div><small>Citizen complaints</small><b>{Number(i.complaints).toLocaleString("en-IN")}</b></div>
              <div><small>Field officer</small><b title={i.officer ?? undefined}>{i.officer || "—"}</b></div>
              <div><small>Taluk</small><b>{i.taluk_name ?? "Not resolved"}</b></div>
              <div title={confidenceNote(i)}><small>Confidence</small><b style={{ color: Number(i.confidence) < 0.7 ? "var(--high)" : undefined }}>
                {i.confidence == null ? "—" : `${Math.round(Number(i.confidence) * 100)}%`}{Number(i.needs_review) ? " · review" : ""}</b></div>
            </div>
          </div>
        </section>

        <section className="iv-col">
          <div className="iv-t"><I n="clock" />How it unfolded<span>{plural(reports.length, "report")} from {plural(srcs.length, "source")}{group.length ? `, ${group.length + 1} incidents merged` : ""}, in time order</span></div>
          <ul className="tl">
            {days.map((g) => (
              <li key={g.day} style={{ listStyle: "none" }}>
                <div className="tl-day">{fmtDay(g.day + " 00:00:00")}</div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {g.items.map((r, k) => {
                    const kind = SOURCE_KIND[r.source] ?? SOURCE_KIND.grievance;
                    return (
                      <li className="ev" key={k}>
                        <span className={`dotc ${kind.tone}`}><I n={kind.ic} /></span>
                        <div className="evb">
                          <div className="eh">
                            <b>{r.source === "news" && r.publisher ? r.publisher : r.what}</b>
                            <span>{r.source === "news" ? MEDIA_KIND[r.kind] ?? "News" : CHANNEL[r.channel] ?? ""}</span>
                            {r.first && r.inc === id && <span className="first">First</span>}
                            {r.inc && r.inc !== id && <span className="lk" title="Reported as another incident: the same problem in the same area">merged</span>}
                            {(!r.inc || r.inc === id) && !r.first && r.link != null && <span className="lk" title={`Merged by ${String(r.method ?? "matching").replace(/_/g, " ")}`}>linked {Math.round(r.link * 100)}%</span>}
                            <time>{fmtTime(r.t)}</time>
                          </div>
                          <p>{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.title} ↗</a> : (r.text || r.title)}</p>
                          {r.title_en && <p className="ev-en">{r.title_en}</p>}
                          {r.ai && <NewsDetails ai={r.ai} />}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </section>

        <section className="iv-col">
          <div>
            <div className="iv-t"><I n="layers" />Reported by</div>
            <div className="smix">
              {srcs.map((s) => {
                const kind = SOURCE_KIND[s.k];
                return (
                  <div key={s.k}>
                    <span className={`si ${kind.tone}`} style={{ width: 32, height: 32, borderRadius: 10, display: "grid", placeItems: "center" }}><I n={kind.ic} /></span>
                    <span style={{ minWidth: 0 }}>{kind.k === "News report" ? "News outlets" : kind.k + "s"}
                      {s.k === "news" && i.src?.outlets?.length ? <small>{i.src.outlets.join(", ")}</small> : null}
                    </span>
                    <b>{s.n}</b>
                  </div>
                );
              })}
            </div>
          </div>
          {group.length > 0 && (
            <div>
              <div className="iv-t"><I n="layers" />{group.length + 1} incidents merged into this one</div>
              <ul className="iv2-grp">
                <li className="on"><b>This incident</b><small>{[i.loc, fmtShort(i.t), i.status].filter(Boolean).join(" · ")}</small></li>
                {group.map((g) => (
                  <li key={g.id}><b title={g.title}>{g.title}</b><small>{[g.loc, fmtShort(g.t), g.status, g.complaints ? plural(Number(g.complaints), "complaint") : null].filter(Boolean).join(" · ")}</small></li>
                ))}
              </ul>
            </div>
          )}
          {data.assigned && (
            <div className="banner teal"><I n="send" />
              <span>Only in the news, so District IQ sent it to <b>{data.assigned.officer_name ?? data.assigned.officer_designation}</b>
                {data.assigned.officer_name ? `, ${data.assigned.officer_designation}` : ""} on {fmtShort(data.assigned.assigned_at)}.</span>
            </div>
          )}
          <div>
            <div className="iv-t"><I n="phone" />Who is responsible</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {deptContacts.slice(0, 2).map((o) => <OfficerCard key={o.contact_id} o={o} />)}
              {!deptContacts.length && (
                <div className="officer"><span className="avatar">{String(i.dept ?? "").slice(0, 2)}</span>
                  <span><b>{i.dept_head ?? "Department head"}</b><small>{i.dept_name} · {i.dept_org}. Not listed on the GCC website.</small></span></div>
              )}
              {zoneContact && <OfficerCard o={zoneContact} label="Zonal officer" />}
            </div>
            {(deptContacts[0] ?? zoneContact) && (
              <div className="src-note">Contacts from the <a href={(deptContacts[0] ?? zoneContact)!.source_url} target="_blank" rel="noreferrer">GCC Who&apos;s who page</a>, retrieved {(deptContacts[0] ?? zoneContact)!.retrieved_on}.</div>
            )}
          </div>
        </section>
      </div>

      {acting && <TakeAction id={id} c={c} onClose={() => setActing(false)} onSent={() => setReload((k) => k + 1)} />}
    </div>
  );
}

/** The department officer's completion report (remarks and site photos), sent from the officer console. */
function DeptReport({ r, earlier }: { r: Row; earlier: number }) {
  return (
    <div className="iv-rep">
      <div className="iv-t"><I n="photo" />Work reported by {r.dept}</div>
      <q>“{r.remarks}”</q>
      <small>{r.by} · {fmtShort(r.t)}{earlier > 0 ? ` · ${plural(earlier, "earlier report")}` : ""}</small>
      {(r.photos as string[]).length > 0 && (
        <div className="iv-ph">
          {(r.photos as string[]).map((p, k) => (
            <a key={p} href={p} target="_blank" rel="noreferrer" title="Open the full photo"><img src={p} alt={`Site photo ${k + 1}`} loading="lazy" /></a>
          ))}
        </div>
      )}
    </div>
  );
}

/** What the confidence figure means, for the tooltip. */
function confidenceNote(i: Row) {
  const parts = ["How sure District IQ is that these reports are one incident at this place (the weakest link or location match)."];
  if (Number(i.needs_review)) parts.push(`Flagged for review: ${i.review_reason || "low confidence"}.`);
  if (Number(i.spread_m) > 0) parts.push(`Reports are spread over ${Math.round(Number(i.spread_m))} m.`);
  return parts.join(" ");
}
