"use client";

/**
 * Structured answers: incident cards, one incident's story, news stories, actions, evidence and KPI tiles. Each draws
 * the records the server sent (lib/assistant/fastpath.ts); nothing here computes a figure.
 */
import { useState } from "react";
import { fmtValue } from "@/lib/assistant/chartspec";
import type { ActionGroup, EvidenceItem, IncidentDetail, IncidentItem, Kpi, NewsStory } from "@/lib/assistant/answer";
import { I, type IconName } from "../icons";

const SEV_CLASS: Record<string, string> = { Severe: "sev", High: "high", Medium: "med", Low: "low" };
const SOURCE_ICON: Record<string, IconName> = { news: "news", police: "shield", grievance: "user", pwd: "cone", hospital: "health" };

/** "3 Oct, 9:59 PM" from "2026-10-03 21:59:45". */
export function when(t: string | null | undefined): string {
  if (!t) return "";
  const d = new Date(t.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return t;
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

export function SevBadge({ s }: { s: string }) {
  return <span className={`aq-sev ${SEV_CLASS[s] ?? "low"}`}><i />{s || "Unrated"}</span>;
}

// ------------------------------------------------------------------ incidents --

export function IncidentListResponse({ items, onOpen, onAsk }: { items: IncidentItem[]; onOpen: (id: string) => void; onAsk: (q: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="aq-incs">
      <ol>{items.map((x, k) => <IncidentCard key={x.incidentId} x={x} rank={k + 1} onOpen={onOpen} onAsk={onAsk} />)}</ol>
      <div className="aq-incs-tools">
        <button onClick={() => onAsk("make that a map")}><I n="map" />On the map</button>
        <button onClick={() => onAsk("as a table")}><I n="table" />As a table</button>
      </div>
    </div>
  );
}

const ORD = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

export function IncidentCard({ x, rank, onOpen, onAsk }: { x: IncidentItem; rank: number; onOpen: (id: string) => void; onAsk: (q: string) => void }) {
  const [ev, setEv] = useState(false);
  const where = [x.location, x.zone && x.zone !== x.location ? x.zone : null].filter(Boolean).join(", ");
  return (
    <li className={`aq-inc ${SEV_CLASS[x.severity] ?? ""}`}>
      <header>
        <b className="aq-rank">{rank}</b>
        <SevBadge s={x.severity} />
        {x.dead > 0 && <span className="aq-tag sev">{x.dead} dead</span>}
        <span className="aq-tag">{x.status}</span>
      </header>
      <button className="aq-inc-t" onClick={() => onAsk(`Tell me more about the ${ORD[rank - 1] ?? `number ${rank}`} one`)}>{x.title}</button>
      <p className="aq-inc-s">{x.summary}</p>
      <div className="aq-inc-m">
        {where && <span><I n="pin" />{where}</span>}
        {x.occurredAt && <span><I n="clock" />{when(x.occurredAt)}</span>}
        {x.department && <span><I n="gov" />{x.department}</span>}
      </div>
      {x.priorityReasons.length > 0 && (
        <div className="aq-why"><small>Why it matters</small>{x.priorityReasons.slice(0, 3).map((r) => <span key={r}>{r}</span>)}</div>
      )}
      <footer>
        <button onClick={() => onAsk(`Tell me more about the ${ORD[rank - 1] ?? `number ${rank}`} one`)}><I n="doc" />Details</button>
        <button onClick={() => onOpen(x.incidentId)}><I n="ext" />Open in console</button>
        {x.evidence.length > 0 && <button className={ev ? "on" : ""} onClick={() => setEv(!ev)} aria-expanded={ev}><I n="layers" />Evidence · {x.evidence.length}</button>}
        <code>{x.incidentId}</code>
      </footer>
      {ev && <EvidenceList items={x.evidence} />}
    </li>
  );
}

export function IncidentDetailResponse({ x, onOpen }: { x: IncidentDetail; onOpen: (id: string) => void }) {
  const where = [x.location, x.ward != null ? `Ward ${x.ward}` : null, x.zone ? `${x.zone} zone` : null, x.taluk ? `${x.taluk} taluk` : null].filter(Boolean).join(" · ");
  return (
    <div className={`aq-det ${SEV_CLASS[x.severity] ?? ""}`}>
      <header className="aq-det-h">
        <SevBadge s={x.severity} />
        <span className="aq-tag">{x.status}{x.deadlineMissed ? " · past deadline" : ""}</span>
        <span className="aq-tag">{x.category}</span>
        <code>{x.incidentId}</code>
      </header>
      <section className={x.focus === "all" ? "" : "dim"}><h5>What happened</h5><p>{x.whatHappened}</p>
        {x.facts.length > 0 && <div className="aq-facts">{x.facts.map((f) => <span key={f}>{f}</span>)}</div>}</section>
      <div className="aq-det-grid">
        <section className={x.focus === "where" ? "hl" : ""}><h5><I n="pin" />Where</h5><p>{where || "Not recorded"}</p></section>
        <section className={x.focus === "when" ? "hl" : ""}><h5><I n="clock" />When</h5><p>{when(x.occurredAt) || "Not recorded"}{x.closedAt ? ` · closed ${when(x.closedAt)}` : ""}</p></section>
        <section className={x.focus === "status" ? "hl" : ""}><h5><I n="timer" />Status</h5><p>{x.status}{x.deadline ? ` · deadline ${when(x.deadline)}${x.deadlineMissed ? " (missed)" : ""}` : ""}</p></section>
        <section className={x.focus === "who" ? "hl" : ""}><h5><I n="gov" />Responsible</h5><p>{x.department ?? "Not assigned"}
          {x.officials.length > 0 && <small>{x.officials.map((o) => `${o.name}${o.designation ? `, ${o.designation}` : ""}`).join(" · ")}</small>}</p></section>
      </div>
      {(x.attention.length > 0 || x.priorityReasons.length > 0) && (
        <section><h5><I n="alert" />Why it needs attention</h5>
          <ul className="aq-reasons">{(x.attention.length ? x.attention : x.priorityReasons).map((r) => <li key={r}>{r}</li>)}</ul></section>
      )}
      {x.timeline.length > 0 && (
        <section><h5><I n="clock" />How it unfolded</h5>
          <ol className="aq-tl">{x.timeline.map((s, k) => (
            <li key={k}><time>{when(s.t)}</time><b>{s.step}</b>{s.actor && <span>{s.actor}</span>}{s.note && <p>{s.note}</p>}</li>
          ))}</ol></section>
      )}
      {x.evidence.length > 0 && <section><h5><I n="layers" />Sources · {x.evidence.length}</h5><EvidenceList items={x.evidence} /></section>}
      <div className="aq-det-f"><button onClick={() => onOpen(x.incidentId)}><I n="ext" />Open in console</button></div>
    </div>
  );
}

export function EvidenceList({ items }: { items: EvidenceItem[] }) {
  return (
    <ul className="aq-ev">
      {items.map((e, k) => (
        <li key={k}>
          <I n={SOURCE_ICON[e.kind] ?? "doc"} />
          <div>
            {e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.title ?? e.label}</a> : <b>{e.title ?? e.label}</b>}
            <small>{[e.publisher ?? e.label, when(e.t)].filter(Boolean).join(" · ")}</small>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ----------------------------------------------------------------------- news --

export function NewsListResponse({ stories, detail, onOpen, onAsk }: { stories: NewsStory[]; detail?: boolean; onOpen: (id: string) => void; onAsk: (q: string) => void }) {
  if (!stories.length) return null;
  return <ol className="aq-news">{stories.map((s, k) => <NewsStoryCard key={s.storyId} s={s} rank={k + 1} open={!!detail} onOpen={onOpen} onAsk={onAsk} />)}</ol>;
}

export function NewsStoryCard({ s, rank, open, onOpen, onAsk }: { s: NewsStory; rank: number; open: boolean; onOpen: (id: string) => void; onAsk: (q: string) => void }) {
  const [src, setSrc] = useState(open);
  return (
    <li className="aq-story">
      <header>
        {!open && <b className="aq-rank">{rank}</b>}
        <span className={`aq-tag ${s.departmentRecordFound ? "ok" : s.matchedIncidentId ? "warn" : ""}`}>
          {s.departmentRecordFound ? "Department record found" : s.matchedIncidentId ? "News only · no department record" : "Not linked to an incident"}</span>
        <span className="aq-tag">{s.sourceCount} {s.sourceCount === 1 ? "outlet" : "independent outlets"}</span>
      </header>
      {open ? <h4>{s.headline}</h4> : <button className="aq-inc-t" onClick={() => onAsk(`tell me more about the ${ORD[rank - 1] ?? `number ${rank}`} story`)}>{s.headline}</button>}
      <p className="aq-inc-s">{s.summary}</p>
      <div className="aq-inc-m">
        {s.location && <span><I n="pin" />{s.location}</span>}
        {s.publishedAt && <span><I n="clock" />{when(s.publishedAt)}</span>}
        {s.category && <span><I n="layers" />{s.category}</span>}
        {s.department && <span><I n="gov" />{s.department}</span>}
      </div>
      {s.whyRelevant.length > 0 && <div className="aq-why"><small>Why it matters</small>{s.whyRelevant.map((w) => <span key={w}>{w}</span>)}</div>}
      <footer>
        <button className={src ? "on" : ""} onClick={() => setSrc(!src)} aria-expanded={src}><I n="news" />Sources · {s.sources.length}</button>
        {s.matchedIncidentId && <button onClick={() => onOpen(s.matchedIncidentId!)}><I n="ext" />Incident {s.matchedIncidentId}</button>}
      </footer>
      {src && <EvidenceList items={s.sources.map((x) => ({ kind: "news", label: "News report", title: x.title, publisher: x.publisher, url: x.url, t: x.t }))} />}
    </li>
  );
}

// -------------------------------------------------------------------- actions --

export function ActionsResponse({ groups, onOpen }: { groups: ActionGroup[]; onOpen: (id: string) => void }) {
  if (!groups.length) return null;
  return (
    <div className="aq-acts2">
      {groups.map((g) => (
        <section key={g.incidentId ?? g.title}>
          <h5>{g.incidentId ? <button className="aq-inc-t" onClick={() => onOpen(g.incidentId!)}>{g.title}</button> : g.title}</h5>
          <ol>{g.items.map((a, k) => (
            <li key={k}><b>{a.text}</b><small>{[a.owner, a.due ? `due ${when(a.due)}` : null, a.from].filter(Boolean).join(" · ")}</small></li>
          ))}</ol>
        </section>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------ KPI --

export function KpiResponse({ kpis, t }: { kpis: Kpi[]; t: { prev: string; vsPrev: string } }) {
  if (!kpis.length) return null;
  return (
    <div className="aq-kpis">
      {kpis.map((k, i) => {
        const d = k.prev != null && k.prev !== 0 ? Math.round(((k.value - k.prev) / k.prev) * 100) : null;
        return (
          <div key={i} className={`aq-kpi ${k.tone ?? ""}`}>
            <small>{k.label}</small>
            <b>{fmtValue(k.value, k.format ?? (Number.isInteger(k.value) ? "integer" : "decimal1"), k.unit ?? null)}</b>
            {k.prev != null && <span>{d == null ? `${t.prev} ${fmtValue(k.prev, k.format ?? "integer")}` : `${d > 0 ? "▲" : d < 0 ? "▼" : "•"} ${Math.abs(d)}% ${t.vsPrev}`}</span>}
          </div>
        );
      })}
    </div>
  );
}
