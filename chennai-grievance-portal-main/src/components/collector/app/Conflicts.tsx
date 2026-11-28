"use client";

import { useEffect, useState } from "react";
import { I } from "./icons";
import { Empty, fmtShort, plural, rel } from "./lib";
import { labelLower } from "@/lib/period/day";
import type { Console } from "./CollectorApp";
import type { Difference, StoryConflicts } from "@/lib/collector/conflicts";

/** "Deaths, Place": the facts a story's outlets disagree on. */
export const diffFields = (s: StoryConflicts) => [...new Set(s.items.map((d) => d.field))].join(", ");
/** some of them still stand (the settled ones stay listed, "resolved at 2:20 PM: the reports now agree") */
export const hasConflict = (s: StoryConflicts) => s.items.some((d) => !d.resolved);

/** The badge on a news story whose outlets disagree. */
export function DiffBadge({ s }: { s: StoryConflicts }) {
  return (
    <span className="routed diff" title="The outlets report this differently: confirm before quoting a figure">
      <I n="compare" />Reports differ: {diffFields(s)}
    </span>
  );
}

/**
 * One disagreement: the fact, one sentence saying exactly what differs, what each outlet says side by side, the likely
 * reason and whom to confirm it with.
 */
/** a single news report, opened in full in the news preview (CollectorApp listens for "diq:open-doc") */
export const openDoc = (x: { docId: string; publisher?: string | null; t?: string | null; title?: string | null; url?: string | null }) =>
  window.dispatchEvent(new CustomEvent("diq:open-doc", { detail: x }));

function DiffCard({ d, compact }: { d: Difference; compact?: boolean }) {
  return (
    <li className={`dx${compact ? " sm" : ""}`}>
      <div className="dx-h">
        <b>{d.field}</b>
        {d.by === "ai" && <em className="dx-ai" title="AI read the reports side by side; every figure was checked against its report"><I n="ai" />AI-checked</em>}
        {d.resolved && <em className="dx-done" title="The difference stays on the list until the day is over"><I n="checkc" />{d.resolved}</em>}
      </div>
      <p className="dx-what">{d.what}</p>
      <div className="dx-vs" style={{ gridTemplateColumns: `repeat(${Math.min(d.claims.length, 3)},minmax(0,1fr))` }}>
        {d.claims.map((c) => (
          <div key={c.docId} className="dx-c">
            <small><b>{c.publisher}</b> · {fmtShort(c.t)}</small>
            <span>{c.says}</span>
            {/* 29 Nov (the owner: "in Differ I can't see the two articles it was taken from"): each outlet's own article, in full */}
            <button type="button" className="dx-open" onClick={() => openDoc({ docId: c.docId, publisher: c.publisher, t: c.t, title: `${c.publisher}: ${d.field}` })}><I n="news" />Read this article</button>
          </div>
        ))}
      </div>
      {(d.reason || d.check) && (
        <dl className="dx-meta">
          {d.reason && <><dt>Likely reason</dt><dd>{d.reason}</dd></>}
          {d.check && <><dt>Confirm with</dt><dd>{d.check}</dd></>}
        </dl>
      )}
    </li>
  );
}

/** The disagreements of one story, inside the incident and news pop-ups. */
export function ConflictBox({ items }: { items: Difference[] }) {
  if (!items.length) return null;
  return (
    <div className="dx-box">
      <div className="iv-t"><I n="compare" />{items.some((d) => !d.resolved) ? <>Reports differ<span>confirm before quoting</span></> : "Reports differed"}</div>
      <ul className="dx-list">{items.map((d, k) => <DiffCard key={k} d={d} compact />)}</ul>
    </div>
  );
}

/** "Reports differ" pop-up: what differs in one story, and the way to its incident or reports. */
export function ConflictView({ s, c }: { s: StoryConflicts; c: Console }) {
  return (
    <div className="dx-view">
      <div className="dx-top">
        <h3>{s.title}</h3>
        <span>{plural(s.outlets, "outlet")} compared · {plural(s.items.length, "difference")}</span>
      </div>
      <ul className="dx-list">{s.items.map((d, k) => <DiffCard key={k} d={d} />)}</ul>
      <div className="dx-foot">
        <button className="btn" onClick={() => c.openConflictStory(s)}><I n="news" />Read the reports</button>
      </div>
    </div>
  );
}

/**
 * The disagreements of one story's reports, for a pop-up: from the period's check when it covered the story, else
 * checked now (`/api/collector/conflicts?ids=`). Null while loading or when the outlets agree.
 */
export function useStoryConflicts(c: Console, ids: string[], title: string, id: string | null): Difference[] | null {
  const known = c.conflicts?.stories.find((s) => (id && s.id === id) || s.docIds.some((d) => ids.includes(d)));
  const [own, setOwn] = useState<{ key: string; items: Difference[] } | null>(null);
  const key = ids.join(",");
  useEffect(() => {
    if (known || ids.length < 2) return;
    let live = true;
    fetch(`/api/collector/conflicts?ids=${encodeURIComponent(key)}&title=${encodeURIComponent(title)}${id ? `&id=${encodeURIComponent(id)}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && setOwn({ key, items: j?.story?.items ?? [] }))
      .catch(() => live && setOwn({ key, items: [] }));
    return () => { live = false; };
  }, [key, title, id, known]); // eslint-disable-line react-hooks/exhaustive-deps
  return known ? known.items : own?.key === key ? own.items : null;
}

/** The stories the Differ tab shows: all of them, or under a filter those linked to an incident inside it and, apart, those no incident is on record for. */
export function differView(cf: Console["conflicts"]): { inside: StoryConflicts[]; wide: StoryConflicts[]; out: number } {
  if (!cf) return { inside: [], wide: [], out: 0 };
  if (!cf.scope) return { inside: cf.stories, wide: [], out: 0 };
  const inside = new Set(cf.scope.inside), wide = new Set(cf.scope.wide);
  return { inside: cf.stories.filter((s) => inside.has(s.id)), wide: cf.stories.filter((s) => wide.has(s.id)), out: cf.scope.out };
}

/** Latest news, "Reports differ" tab: each story whose outlets disagree, with what differs in one line. */
export function ConflictList({ c, now }: { c: Console; now: string }) {
  const cf = c.conflicts;
  if (!cf) return <Empty>Comparing the outlets&apos; reports…</Empty>;
  const v = differView(cf);
  if (!v.inside.length && !v.wide.length && v.out > 0) return <Empty>No story linked to an incident in {c.scopeName} differs. {plural(v.out, "story", "stories")} elsewhere in the district {v.out === 1 ? "does" : "do"}.</Empty>;
  if (!cf.stories.length) return <Empty>The outlets agree on every story {c.period === "daily" ? labelLower(c.periodLabel) : "in this period"} ({plural(cf.checked, "story", "stories")} with 2 or more outlets on the same incident checked).</Empty>;
  const row = (s: StoryConflicts) => (
    <button key={s.id} className="brief dx-row" onClick={() => c.openConflict(s)} title="See what each outlet says">
      <span className="bic t-high"><I n="compare" /></span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <b>{s.title}</b>
        <span className="dx-one"><em>{diffFields(s)}</em>{!hasConflict(s) && s.items[0].resolved ? `${s.items[0].resolved} · ` : ""}{s.items[0].what}</span>
        <span className="loc">{plural(s.outlets, "outlet")} · {rel(latest(s), now)}</span>
      </span>
    </button>
  );
  if (!cf.scope) return <>{v.inside.map(row)}</>;
  return (
    <>
      <p className="scope-note"><I n="pin" /><span>{v.inside.length ? "Linked to an incident in" : "No story differs that is linked to an incident in"} {c.scopeName}</span></p>
      {v.inside.map(row)}
      {v.wide.length > 0 && (
        <>
          <p className="scope-note wide" title="The filters follow a story's incident. These stories have none on record, so no zone, taluk, department or category."><I n="map" /><span>District-wide: no incident on record</span></p>
          {v.wide.map(row)}
        </>
      )}
    </>
  );
}
const latest = (s: StoryConflicts) => s.items.flatMap((d) => d.claims.map((c) => c.t)).sort().slice(-1)[0] ?? "";
