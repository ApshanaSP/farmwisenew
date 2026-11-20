"use client";

import { useEffect, useState } from "react";
import { I } from "./icons";
import { Empty, fmtShort, type Row } from "./lib";
import type { Console } from "./CollectorApp";

type Tab = "sources" | "add" | "audit" | "mine";
const KIND: Record<string, string> = { pipeline: "Pipeline feed", agmarknet: "Public API", rss: "RSS / Atom feed", html: "Web page", json: "JSON API" };
const STATUS: Record<string, [string, string]> = {
  ok: ["Healthy", "st-resolved"], test: ["Test data", "st-review"], partial: ["Partial", "st-review"], stale: ["Stale", "st-progress"], failing: ["Failing", "st-progress"], login_failed: ["Login failed", "st-progress"], new: ["Not run yet", "st-review"]
};

/**
 * Data sources: "Your links" (the feeds and pages the Collector added: add one by pasting its link, pause it, run it, remove it; what it
 * brings shows under Latest news, Added), every connected source, and the audit log.
 */
export function SourcesBody({ c, initial = "sources", url }: { c: Console; initial?: Tab; url?: string }) {
  const [tab, setTab] = useState<Tab>(initial === "add" ? "mine" : initial);
  return (
    <>
      <div className="tabs2">
        {([["mine", "Your links"], ["sources", "All sources"], ["audit", "Audit log"]] as const).map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "mine" ? <MyLinks c={c} initialUrl={url} /> : tab === "sources" ? <SourceList c={c} /> : <AuditLog />}
    </>
  );
}

const ADDED_KINDS = ["rss", "html", "json"];
const EVERY: [number, string][] = [[10, "Every 10 minutes"], [30, "Every 30 minutes"], [60, "Every hour"], [360, "Every 6 hours"], [1440, "Once a day"]];
const SKIP_PART = /^(index|default|feed|rss|feeder|rssfeed|api|v\d+)(\.\w+)?$/i;
/** a name for a pasted link, from its address ("https://www.dtnext.in/news/chennai" -> "dtnext.in · chennai") */
export function linkName(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const part = u.pathname.split("/").filter((x) => x && !SKIP_PART.test(x)).pop();
    const tail = part ? decodeURIComponent(part).replace(/\.(html?|php|aspx?|cms|xml|rss|json)$/i, "").replace(/[-_]+/g, " ").slice(0, 40).trim() : "";
    return tail && !/^\d+$/.test(tail) ? `${host} · ${tail}` : host;
  } catch { return url.slice(0, 60); }
}
const LINK = /^https?:\/\/[^\s/]+\.[^\s]+$/i;

/**
 * The Collector's own links: paste a link to add it (its type is worked out, it is read at once and then on its schedule), and every
 * added one with how much it brought, Run, Pause / Resume and Remove. Removing takes its items out of Latest news and the map at once;
 * pausing stops the reading and keeps what it brought. Pausing and removing ask "Confirm it's you" (the server's rule).
 */
function MyLinks({ c, initialUrl = "" }: { c: Console; initialUrl?: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [url, setUrl] = useState(initialUrl);
  const [name, setName] = useState("");
  const [every, setEvery] = useState(60);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => call("/api/collector/sources").then((j) => setRows((j.sources as Row[]).filter((s) => ADDED_KINDS.includes(s.kind))))
    .catch((e) => { setRows([]); c.toast(e.message, "alert"); });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const link = url.trim();
  const valid = LINK.test(link);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !ok) return;
    setBusy("add");
    try {
      const r = await call("/api/collector/sources", "POST", { name: (name.trim() || linkName(link)).slice(0, 128), url: link, kind: "auto", refreshMinutes: every, authorized: true });
      c.toast(r.run?.ok ? `Added (${KIND[r.kind] ?? r.kind}): ${r.run.items_new} items read. They show under Latest news, Added.`
        : `Added, but the first reading failed: ${r.run?.error ?? "no reason given"}. It tries again on its schedule.`, r.run?.ok ? "ok" : "alert");
      setUrl(""); setName(""); setOk(false);
      c.markChanged?.();
      await load();
    } catch (err) { c.toast((err as Error).message, "alert"); } finally { setBusy(null); }
  };
  const act = async (s: Row, what: "run" | "pause" | "resume" | "remove") => {
    setBusy(`${what}:${s.id}`);
    try {
      if (what === "remove") { await call(`/api/collector/sources/${s.id}`, "DELETE"); c.toast(`Removed ${s.name}: its items are gone from Latest news and the map.`); }
      else if (what === "run") { const r = await call(`/api/collector/sources/${s.id}`, "POST"); c.toast(r.ok ? `${s.name}: ${r.items_new} new of ${r.seen} read.` : `${s.name}: ${r.error}`, r.ok ? "ok" : "alert"); }
      else { await call(`/api/collector/sources/${s.id}`, "PATCH", { enabled: what === "resume" }); c.toast(what === "pause" ? `Paused ${s.name}: it is not read until you resume it.` : `Resumed ${s.name}.`); }
      c.markChanged?.();
      await load();
    } catch (err) {
      const m = (err as Error).message;
      // the Confirm box was cancelled: nothing was done, and nothing needs saying
      if (!/not confirmed/i.test(m)) c.toast(m, "alert");
    } finally { setBusy(null); }
  };
  return (
    <div className="mylinks">
      <form className="ml-add" onSubmit={add}>
        <div className="ml-row">
          <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link: a news feed, a page of headlines, or a JSON API" aria-label="Link to add" autoFocus />
          <select value={every} onChange={(e) => setEvery(Number(e.target.value))} aria-label="How often to read it">{EVERY.map(([m, l]) => <option key={m} value={m}>{l}</option>)}</select>
          <button className="btn" disabled={!valid || !ok || busy === "add"}>{busy === "add" ? <><I n="refresh" className="spin" />Reading…</> : <><I n="plus" />Add</>}</button>
        </div>
        {valid && <input className="ml-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Name: ${linkName(link)}`} aria-label="Name (optional)" maxLength={128} />}
        <label className="chk"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />This site is public and may be read automatically (no login, paywall or CAPTCHA is bypassed).</label>
        <small className="dim">For a one-off table or file, use <b>Add data</b> in the Data Studio instead.</small>
      </form>
      {!rows ? <div className="empty">Loading your links…</div> : !rows.length ? (
        <div className="empty">No links added yet. Paste one above: what it brings shows under <b>Latest news, Added</b> and on the map.</div>
      ) : (
        <ul className="ml-list">
          {rows.map((s) => {
            const [st, cls] = STATUS[s.status] ?? [s.status, "st-review"];
            const spin = busy === `run:${s.id}`;
            const often = EVERY.find(([m]) => m === Number(s.refresh_minutes))?.[1] ?? `Every ${s.refresh_minutes} minutes`;
            return (
              <li key={s.id} className={s.enabled ? "" : "off"}>
                <span className={`ml-ic k-${s.kind}`}><I n={s.kind === "rss" ? "news" : s.kind === "json" ? "table" : "ext"} /></span>
                <div className="ml-t">
                  <b>{s.name}</b>
                  <small>{/^https?:/.test(s.url) ? <a href={s.url} target="_blank" rel="noreferrer" className="lnk">{String(s.url).replace(/^https?:\/\//, "").slice(0, 56)}</a> : s.url}</small>
                  <small className="dim">{KIND[s.kind] ?? s.kind} · {Number(s.rows ?? 0).toLocaleString("en-IN")} items · {s.newest ? `newest ${fmtShort(s.newest)}` : "nothing dated yet"} · {s.enabled ? often.toLowerCase() : "paused"}</small>
                </div>
                <span className={`st ${s.enabled ? cls : "st-review"}`}>{s.enabled ? st : "Paused"}</span>
                <span className="ml-acts">
                  <button className="btn sm plain" disabled={!!busy || !s.enabled} onClick={() => act(s, "run")} title="Read it now"><I n="refresh" className={spin ? "spin" : ""} />Run</button>
                  <button className="btn sm plain" disabled={!!busy} onClick={() => act(s, s.enabled ? "pause" : "resume")}>{s.enabled ? "Pause" : "Resume"}</button>
                  <button className="btn sm plain ml-del" disabled={!!busy} onClick={() => act(s, "remove")} title="Remove this link and its items"><I n="x" />Remove</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

async function call(path: string, method = "GET", body?: unknown) {
  const r = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Request failed.");
  return j;
}

function SourceList({ c }: { c: Console }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [items, setItems] = useState<{ id: number; name: string; rows: Row[] } | null>(null);
  const load = () => call("/api/collector/sources").then((j) => setRows(j.sources)).catch((e) => c.toast(e.message, "alert"));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (s: Row) => {
    setBusy(s.id);
    try {
      const r = await call(`/api/collector/sources/${s.id}`, "POST");
      c.toast(s.kind === "pipeline" && r.ok ? "Data load started. The dashboard updates when it finishes (about 25 minutes)."
        : r.ok ? `${s.name}: ${r.items_new} new of ${r.seen} read${r.login !== "none" ? ` (login ${r.login})` : ""}.` : `${s.name}: ${r.error}`, r.ok ? "ok" : "alert");
      await load();
    } catch (e: any) { c.toast(e.message, "alert"); } finally { setBusy(null); }
  };
  const toggle = async (s: Row) => { await call(`/api/collector/sources/${s.id}`, "PATCH", { enabled: !s.enabled }).catch((e) => c.toast(e.message, "alert")); load(); };
  const remove = async (s: Row) => {
    if (!window.confirm(`Remove ${s.name}? Items already collected stay in the store.`)) return;
    await call(`/api/collector/sources/${s.id}`, "DELETE").catch((e) => c.toast(e.message, "alert"));
    load();
  };
  const show = async (s: Row) => setItems({ id: s.id, name: s.name, rows: (await call(`/api/collector/sources?items=${s.id}`)).items });

  if (!rows) return <div className="empty">Loading sources…</div>;
  if (items) return (
    <>
      <button className="lnk" onClick={() => setItems(null)}>‹ All sources</button>
      <h4 style={{ margin: "8px 0" }}>{items.name}: latest items</h4>
      <ItemTable rows={items.rows} />
    </>
  );
  // generated feeds are test data: not counted healthy, and not said to be collected
  const generated = rows.filter((r) => r.status === "test").length;
  const real = rows.length - generated;
  const ok = rows.filter((r) => r.status === "ok").length;
  return (
    <>
      <p className="sub">{ok} of {real} live sources healthy{generated ? `; ${generated} generated ${generated === 1 ? "feed is" : "feeds are"} test data and not counted` : ""}. Added sources refresh on their own interval (daily by default; the live news feeds every 10 minutes); real feeds from the district intelligence pipeline are refreshed hourly; generated ones are not collected at all.
        Every run is logged, and failures show the reason.</p>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Source</th><th>Type</th><th>Status</th><th>Newest data</th><th>Records</th><th>Last runs</th><th /></tr></thead>
          <tbody>
            {rows.map((s) => {
              const [st, cls] = STATUS[s.status] ?? [s.status, "st-review"];
              return (
                <tr key={s.id} style={{ cursor: "default", opacity: s.enabled ? 1 : 0.55 }}>
                  <td className="ev" style={{ whiteSpace: "normal", maxWidth: 300 }}>
                    {s.name}
                    <small className="dim" style={{ display: "block", fontWeight: 400 }}>{/^https?:/.test(s.url) ? <a href={s.url} target="_blank" rel="noreferrer" className="lnk" style={{ fontWeight: 500 }}>{s.url.replace(/^https?:\/\//, "").slice(0, 48)}</a> : s.url}</small>
                    {s.auth !== "none" && <small className="dim" style={{ display: "block" }}><I n="shield" /> Signs in as {s.username} ({s.auth}){s.session_expires_at ? ` · session until ${fmtShort(s.session_expires_at)}` : ""}</small>}
                  </td>
                  <td className="dim">{KIND[s.kind] ?? s.kind}{["rss", "html", "json"].includes(s.kind) && Number(s.refresh_minutes) > 0 && Number(s.refresh_minutes) < 60 &&
                    <small style={{ display: "block", color: "var(--accent-2)" }} title="Read on its own every few minutes, between the hourly builds"><I n="refresh" /> Live · every {Number(s.refresh_minutes)} min</small>}{s.mapped &&<small style={{ display: "block", color: "var(--accent-2)" }} title="Set up by the onboarding agent: runs with its saved field mapping, no AI calls"><I n="flow" /> Agent mapping</small>}</td>
                  <td><span className={`st ${cls}`}>{st}</span>{s.last_error && s.status !== "ok" && <small className="dim" title={s.error_detail ?? undefined} style={{ display: "block", whiteSpace: "normal", maxWidth: 220 }}>{s.last_error}</small>}</td>
                  <td className="dim">{s.newest ? fmtShort(s.newest) : "—"}</td>
                  <td className="num">{Number(s.rows ?? 0).toLocaleString("en-IN")}</td>
                  <td>
                    <span className="runs">{(s.runs as Row[]).map((r, k) => <i key={k} className={r.ok ? "ok" : "bad"} title={`${fmtShort(r.t)} · ${r.ok ? `${r.items_new} new` : r.error}${r.login && r.login !== "none" ? ` · login ${r.login}` : ""}`} />)}</span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span style={{ display: "inline-flex", gap: 6 }}>
                      <button className="btn sm plain" disabled={busy === s.id || !s.enabled} onClick={() => run(s)} data-jarvis-never>
                        <I n="refresh" className={busy === s.id ? "spin" : ""} />{s.kind === "pipeline" ? "Refresh" : "Run now"}</button>
                      {["rss", "html", "json"].includes(s.kind) && <button className="btn sm plain" onClick={() => show(s)}>Items</button>}
                      {s.kind !== "pipeline" && <button className="btn sm plain" onClick={() => toggle(s)} title={s.enabled ? "Pause" : "Resume"} data-jarvis-never>{s.enabled ? "Pause" : "Resume"}</button>}
                      {["rss", "html", "json"].includes(s.kind) && <button className="btn sm plain" onClick={() => remove(s)} title="Remove"><I n="x" /></button>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ItemTable({ rows }: { rows: Row[] }) {
  if (!rows.length) return <Empty>No items yet.</Empty>;
  return (
    <div className="tbl-wrap">
      <table>
        <thead><tr><th>Item</th><th>Category found</th><th>Place found</th><th>Date</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.item_id} style={{ cursor: "default" }}>
              <td style={{ whiteSpace: "normal", maxWidth: 420 }}>{r.url && /^https?:/.test(r.url) ? <a className="lnk" href={r.url} target="_blank" rel="noreferrer">{r.title}</a> : r.title}</td>
              <td style={{ whiteSpace: "normal" }}>{r.category_label ? <>{r.category_label}<small className="dim" style={{ display: "block" }}>matched: {r.matched_terms} · {Math.round(Number(r.category_conf) * 100)}%</small></> : <span className="dim">not an incident</span>}</td>
              <td>{r.place ? <>{r.place}<small className="dim" style={{ display: "block" }}>{[r.zone_name, r.ward_no ? `ward ${r.ward_no}` : null].filter(Boolean).join(", ") || r.taluk_code}</small></> : <span className="dim">not found</span>}</td>
              <td className="dim">{fmtShort(r.t)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditLog() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => { call("/api/collector/audit").then((j) => setRows(j.log)).catch(() => setRows([])); }, []);
  if (!rows) return <div className="empty">Loading…</div>;
  return (
    <>
      <p className="sub">Every decision, source change and saved workspace, newest first.</p>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Record</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ cursor: "default" }}>
                <td className="dim">{fmtShort(r.at)}</td><td>{r.actor}</td><td className="ev">{r.action.replace(":", " · ")}</td>
                <td className="dim">{r.table_name} {r.record_id}</td>
                <td className="dim" style={{ whiteSpace: "normal", maxWidth: 420, fontSize: 12.5 }}>{r.after_value}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5}><div className="empty">Nothing recorded yet.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
