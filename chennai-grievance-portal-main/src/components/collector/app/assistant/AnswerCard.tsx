"use client";

/**
 * One answer: headline and the short answer, then the component for its kind (AssistantResponse): incident cards,
 * one incident's story, news stories, actions, KPI tiles, or a chart / map / table; with the evidence underneath
 * (scope, as-of, sources, how it was calculated) and console actions. No follow-up questions are added: the
 * Collector asks what they want next.
 */
import { memo, useEffect, useState } from "react";
import { canSpeak, speak, stopSpeaking } from "./speech";
import type { AnswerCard as Card, ConsoleAction } from "@/lib/assistant/answer";
import type { Lang } from "@/lib/assistant/lang";
import type { MapGeo } from "@/lib/collector/geo";
import { I, type IconName } from "../icons";
import { mdToHtml } from "../Insights";
import { T, X } from "./text";
import { FigureResponse } from "./Figure";
import { ActionsResponse, IncidentDetailResponse, IncidentListResponse, KpiResponse, NewsListResponse } from "./Responses";

export default memo(AnswerCard);

function AnswerCard({ card, geo, onAsk, onAction, expanded, onExpand, onPin }: {
  card: Card; geo: MapGeo | null; onAsk: (q: string) => void; onAction: (a: ConsoleAction) => void; expanded: boolean; onExpand: () => void;
  /** pin this answer; resolves true when saved */
  onPin?: (messageId: string) => Promise<boolean>;
}) {
  const t = T[card.language as Lang] ?? T.en;
  const [vote, setVote] = useState<1 | -1 | null>(null);
  const [pinned, setPinned] = useState(false);
  // the question decides: a chart, map or table only when it asked for one (a list, a chart, a graph, a map); otherwise words only
  const open = card.visualAsked === true || card.display === "table";
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const x = X[card.language as Lang] ?? X.en;
  useEffect(() => () => { if (speaking) stopSpeaking(); }, [speaking]);
  const readAloud = () => {
    if (speaking) { stopSpeaking(); setSpeaking(false); return; }
    if (speak(card.voiceSummary || card.headline, card.voiceLang, () => setSpeaking(false))) setSpeaking(true);
  };
  const copy = async () => {
    const plain = card.answerMarkdown.replace(/\*\*/g, "").replace(/^\s*[-*]\s+/gm, "• ");
    const body = [card.headline, card.answerMarkdown !== card.headline ? plain : "", card.scopeLine, ...card.caveats.map((c) => `Note: ${c}`)].filter(Boolean).join("\n\n");
    try { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  };
  const feedback = async (rating: 1 | -1) => {
    setVote(rating);
    await fetch("/api/collector/assistant/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: card.id, insightKey: card.insightKey ?? null, rating }) }).catch(() => {});
  };
  const kind = card.kind;
  const rt = card.responseType;
  const openInc = (id: string) => onAction({ action: "open_incident", label: "", id });
  // no page redirects from the chat (answers saved before this rule may still carry them)
  const actions = card.consoleActions.filter((a) => a.action !== "open_briefing" && a.action !== "save_briefing");
  // the story components already show the full text: the short answer above them only when it adds something
  const showMd = !!card.answerMarkdown && card.answerMarkdown !== card.headline
    && !(rt === "incident_detail" && card.incident?.focus === "all") && rt !== "news_detail";

  return (
    <article className={`aq-card aq-${kind}${rt ? ` aq-rt-${rt}` : ""}`} aria-live="polite">
      <header className="aq-card-h">
        <h3>{card.headline}</h3>
        <div className="aq-badges">
          {card.testData && <span className="aq-badge test" title={t.testTip}><I n="alert" />{t.testData}</span>}
          {card.offline && <span className="aq-badge off" title={t.offlineTip}>{t.offline}</span>}
        </div>
      </header>
      {card.understood && <p className="aq-understood"><I n="info" />{t.understood}: <q>{card.understood}</q></p>}
      {showMd && <div className="aq-md md" dangerouslySetInnerHTML={{ __html: mdToHtml(card.answerMarkdown) }} />}
      {card.scopeLine && <p className="aq-scope"><I n="clock" />{card.scopeLine}</p>}

      {rt === "incident_list" && card.incidents && <IncidentListResponse items={card.incidents} onOpen={openInc} onAsk={onAsk} />}
      {rt === "incident_detail" && card.incident && <IncidentDetailResponse x={card.incident} onOpen={openInc} />}
      {(rt === "news_list" || rt === "news_detail") && card.stories && <NewsListResponse stories={card.stories} detail={rt === "news_detail"} onOpen={openInc} onAsk={onAsk} />}
      {rt === "actions" && card.actions && <ActionsResponse groups={card.actions} onOpen={openInc} />}

      {open && card.kpis.length > 0 && (card.display === "kpi" || !card.chart) && <KpiResponse kpis={card.kpis} t={t} />}
      {open && rt !== "incident_list" && <FigureResponse card={card} geo={geo} onAction={onAction} expanded={expanded} onExpand={onExpand} />}

      {card.download && <a className="aq-dl" href={card.download.href} download><I n="download" />{card.download.label}</a>}
      {card.caveats.length > 0 && <ul className="aq-cav">{card.caveats.map((c, i) => <li key={i}><I n="info" />{c}</li>)}</ul>}
      {card.chips.length > 0 && <div className="aq-chips">{card.chips.map((q) => <button key={q} onClick={() => onAsk(q)}>{q}</button>)}</div>}
      {actions.length > 0 && (
        <div className="aq-acts">{actions.map((a, i) => <button key={i} className="btn sm" onClick={() => onAction(a)}><I n={actionIcon(a)} />{a.label}</button>)}</div>
      )}
      {card.followUps.length > 0 && (
        <div className="aq-follow"><small>{t.next}</small>{card.followUps.map((q) => <button key={q} onClick={() => onAsk(q)}><I n="right" />{q}</button>)}</div>
      )}
      <EvidenceDrawer card={card} t={t} onOpen={openInc} />
      {(kind === "answer" || kind === "action") && (
        <footer className="aq-foot">
          {canSpeak() && (card.voiceSummary || card.headline) && (
            <button className={speaking ? "on" : ""} onClick={readAloud} title={speaking ? t.stopReading : t.readAloud} aria-label={speaking ? t.stopReading : t.readAloud} aria-pressed={speaking}>
              <I n={speaking ? "stop" : "volume"} /></button>
          )}
          <button className={copied ? "on" : ""} onClick={copy} title={copied ? t.copied : t.copy} aria-label={copied ? t.copied : t.copy}><I n={copied ? "check" : "copy"} /></button>
          <span className="sp" />
          <span>{t.helpful}</span>
          <button className={vote === 1 ? "on" : ""} onClick={() => feedback(1)} aria-pressed={vote === 1} aria-label={t.yes}><I n="thumbUp" /></button>
          <button className={vote === -1 ? "on" : ""} onClick={() => feedback(-1)} aria-pressed={vote === -1} aria-label={t.no}><I n="thumbDown" /></button>
          {onPin && kind === "answer" && card.datasets.length > 0 && (
            <button className={`aq-pin${pinned ? " on" : ""}`} disabled={pinned} title={pinned ? x.pinnedOk : x.pin} aria-label={pinned ? x.pinnedOk : x.pin}
              onClick={async () => setPinned(await onPin(card.id))}><I n="bookmark" />{pinned ? x.pinnedOk : ""}</button>
          )}
        </footer>
      )}
    </article>
  );
}

function actionIcon(a: ConsoleAction): IconName {
  return a.action === "open_incident" ? "ext" : a.action === "open_briefing" ? "doc" : a.action === "save_briefing" ? "bookmark" : a.action === "open_story" ? "news" : a.action === "show_on_map" ? "map"
    : a.action === "set_period" ? "clock" : "sliders";
}

/** How the answer was produced: scope, tools, data, SQL, records, models, the number check, assumptions. */
function EvidenceDrawer({ card, t, onOpen }: { card: Card; t: (typeof T)["en"]; onOpen: (id: string) => void }) {
  const s = card.sources;
  if (!s || (card.kind !== "answer" && card.kind !== "action")) return null;
  return (
    <details className="aq-src">
      <summary><I n="layers" />{t.sources}</summary>
      <dl>
        {card.asOf && <><dt>{t.asOf}</dt><dd>{card.asOf}{card.scopeLine ? ` · ${card.scopeLine}` : ""}</dd></>}
        {card.intent && <><dt>Intent</dt><dd>{card.intent.toLowerCase().replace(/_/g, " ")}</dd></>}
        {s.tools.length > 0 && <><dt>{t.tools}</dt><dd>{s.tools.map((x) => <code key={x.name + JSON.stringify(x.args)}>{x.name}({argText(x.args)}) {x.ms ? `${x.ms} ms` : ""}</code>)}</dd></>}
        {s.refs.length > 0 && <><dt>{t.data}</dt><dd>{[...new Set(s.refs.map((r) => r.name))].join(", ")}</dd></>}
        {s.sql.length > 0 && <><dt>SQL</dt><dd>{s.sql.map((q, i) => <pre key={i}>{q.text}{"\n-- "}{JSON.stringify(q.params)}</pre>)}</dd></>}
        {s.rows > 0 && <><dt>{t.rows}</dt><dd>{s.rows.toLocaleString("en-IN")}</dd></>}
        {s.incidentIds.length > 0 && <><dt>{t.incidents}</dt><dd className="ids">{s.incidentIds.slice(0, 12).map((id) => <button key={id} onClick={() => onOpen(id)}>{id}</button>)}
          {s.incidentIds.length > 12 ? ` +${s.incidentIds.length - 12}` : ""}</dd></>}
        <dt>{t.testData}</dt><dd>{card.testData ? t.testYes : t.testNo}</dd>
        {s.models.length > 0 && <><dt>{t.models}</dt><dd>{s.models.map((m) => `${m.step}: ${m.provider}/${m.model} (${m.ms} ms, ${m.inTokens != null ? `${m.inTokens} in + ${m.outTokens} out` : `${m.tokens}`} tokens)`).join(" · ")}</dd></>}
        <dt>{t.numbers}</dt><dd>{s.verifier.template ? t.template : s.verifier.checked ? t.verified(s.verifier.checked, s.verifier.regenerated) : t.noNumbers}</dd>
        {s.assumptions.length > 0 && <><dt>{t.assumptions}</dt><dd><ul>{s.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></dd></>}
        {s.limits.length > 0 && <><dt>{t.notes}</dt><dd><ul>{s.limits.map((a, i) => <li key={i}>{a}</li>)}</ul></dd></>}
      </dl>
    </details>
  );
}

const argText = (a: Record<string, unknown>) => Object.entries(a).map(([k, v]) => {
  if (k === "scope" && v && typeof v === "object") return Object.entries(v as Record<string, unknown>).filter(([, x]) => x != null).map(([kk, x]) => `${kk}=${x}`).join(", ");
  return v == null ? "" : `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`;
}).filter(Boolean).join(", ");
