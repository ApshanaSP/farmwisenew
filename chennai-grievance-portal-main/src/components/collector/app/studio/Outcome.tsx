"use client";

/**
 * What a link ended in, when it is not a dashboard: NO DATA, NOT RELEVANT, BLOCKED, ERROR or "you already have this"
 * (OutcomeView), and the picker when a link holds several datasets (Picker). Each says what happened, what was
 * checked and the best next step; nothing here ever shows a chart of data that did not earn one.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Outcome, OutcomeAction, PickCard, PickGroup, PickSet } from "@/lib/studio/types";
import { I, type IconName } from "../icons";
import { api } from "./client";
import "./studio-outcome.css";

export type Lang = "en" | "ta";
const LANG_KEY = "diq-studio-lang";

/** The page's language for these screens (a per-viewer convenience: remembered in this browser only). */
export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => { try { const v = localStorage.getItem(LANG_KEY); if (v === "ta" || v === "en") setLang(v); } catch { /* not kept */ } }, []);
  return [lang, (l: Lang) => { setLang(l); try { localStorage.setItem(LANG_KEY, l); } catch { /* not kept */ } }];
}

const T = {
  en: {
    nodata: "No data to chart here", notrelevant: "Real data, but not about Chennai", blocked: "The site does not let the Studio read this", error: "The link could not be read",
    duplicate: "You already have this", checked: "What was checked", next: "What to do", preview: "A few rows of what was found", lang: "Language",
    pickTitle: (n: number) => (n === 1 ? "We found one dataset on this site. How do you want it?" : `We found ${n} datasets on this site. Which ones do you want?`),
    seriesTitle: (files: number) => `This site publishes one dataset as ${files} dated files. How do you want it?`, pickTitleFile: (n: number) => `This file holds ${n} datasets. Which ones do you want?`,
    search: "Search the datasets", sortRec: "Recommended", sortNew: "Newest", sortRows: "Most rows", allTypes: "All types",
    selectRec: "Select recommended", add: (n: number) => (n === 1 ? "Add 1 dataset" : `Add ${n} datasets`), combine: "Combine into one", cancel: "Cancel",
    rows: "rows", cols: "columns", chennai: "Chennai rows", updated: "updated", from: "from", show: "Show 5 rows", hide: "Hide rows",
    latest: "Latest only", all: "Combine all into one dataset", keep: "Keep updating daily", files: "files", more: (n: number) => `Show ${n} more`,
    loading: "Loading rows…", combineNo: "These have different columns, so they cannot be combined.", none: "No dataset matches.",
    groups: { recommended: "Recommended for Chennai", series: "Series: the same file published by date", other: "Other datasets", notchennai: "Not Chennai's data", unreadable: "Could not read" } as Record<PickGroup, string>
  },
  ta: {
    nodata: "இங்கே வரைபடமாக்க தரவு இல்லை", notrelevant: "உண்மையான தரவு, ஆனால் சென்னையைப் பற்றியது அல்ல", blocked: "இதைப் படிக்க தளம் அனுமதிக்கவில்லை", error: "இணைப்பைப் படிக்க முடியவில்லை",
    duplicate: "இது ஏற்கனவே உங்களிடம் உள்ளது", checked: "சரிபார்த்தவை", next: "அடுத்து செய்ய வேண்டியது", preview: "கண்டறிந்தவற்றின் சில வரிசைகள்", lang: "மொழி",
    pickTitle: (n: number) => (n === 1 ? "இந்தத் தளத்தில் ஒரு தரவுத்தொகுப்பு கிடைத்தது. எப்படி வேண்டும்?" : `இந்தத் தளத்தில் ${n} தரவுத்தொகுப்புகள் கிடைத்தன. எவை வேண்டும்?`),
    seriesTitle: (files: number) => `இந்தத் தளம் ஒரே தரவை ${files} தேதிவாரிக் கோப்புகளாக வெளியிடுகிறது. எப்படி வேண்டும்?`, pickTitleFile: (n: number) => `இந்தக் கோப்பில் ${n} தரவுத்தொகுப்புகள் உள்ளன. எவை வேண்டும்?`,
    search: "தரவுத்தொகுப்புகளைத் தேடு", sortRec: "பரிந்துரை", sortNew: "புதியவை", sortRows: "அதிக வரிசைகள்", allTypes: "எல்லா வகைகளும்",
    selectRec: "பரிந்துரைத்தவற்றைத் தேர்வு செய்", add: (n: number) => `${n} தரவுத்தொகுப்புகளைச் சேர்`, combine: "ஒன்றாக இணை", cancel: "ரத்து",
    rows: "வரிசைகள்", cols: "நெடுவரிசைகள்", chennai: "சென்னை வரிசைகள்", updated: "புதுப்பிப்பு", from: "இருந்து", show: "5 வரிசைகளைக் காட்டு", hide: "மறை",
    latest: "சமீபத்தியது மட்டும்", all: "அனைத்தையும் ஒரே தொகுப்பாக இணை", keep: "தினமும் புதுப்பி", files: "கோப்புகள்", more: (n: number) => `மேலும் ${n} காட்டு`,
    loading: "வரிசைகள் ஏற்றப்படுகின்றன…", combineNo: "நெடுவரிசைகள் வேறுபடுவதால் இணைக்க முடியாது.", none: "எதுவும் பொருந்தவில்லை.",
    groups: { recommended: "சென்னைக்குப் பரிந்துரைக்கப்பட்டவை", series: "தேதிவாரியாக வெளியிடப்படும் கோப்புகள்", other: "பிற தரவுத்தொகுப்புகள்", notchennai: "சென்னையின் தரவு அல்ல", unreadable: "படிக்க முடியாதவை" } as Record<PickGroup, string>
  }
};

/** The reason in Tamil, by its code (the details below stay as the server wrote them). */
const TA_WHY: Record<string, string> = {
  news: "இது ஒரு செய்தி அல்லது கட்டுரை, தரவு அட்டவணை அல்ல.", menu: "இந்தப் பக்கத்தின் அட்டவணைகள் மெனுக்கள் மட்டுமே, தரவு அல்ல.", page: "இங்கே வரைபடமாக்கத் தக்க அட்டவணை, தரவுக் கோப்பு எதுவும் இல்லை.",
  jsapp: "இந்தப் பக்கம் தரவு எதையும் ஏற்றவில்லை.", thin: "சில வரிசைகள் மட்டுமே உள்ளன: வரைபடத்துக்குப் போதாது.", empty: "கோப்பில் தரவு வரிசைகள் இல்லை.",
  video: "இது ஒரு காணொளி; அதில் அட்டவணை இல்லை.", social: "இது ஒரு சமூக ஊடகப் பதிவு, தரவு அட்டவணை அல்ல.", search: "இது தேடல் முடிவுப் பக்கம், தரவு மூலம் அல்ல.",
  unrelated: "இது உண்மையான தரவு, ஆனால் சென்னையைப் பற்றியது அல்ல.", login: "இந்தத் தளம் உள்நுழைவைக் கேட்கிறது.", captcha: "இந்தத் தளம் CAPTCHA கேட்கிறது; ஸ்டுடியோ அதற்குப் பதில் அளிக்காது.",
  robots: "இந்தத் தளத்தின் robots.txt தானியங்கி வாசிப்பை மறுக்கிறது.", key: "இந்தத் தரவுக்கு data.gov.in API சாவி தேவை.", tableau: "Tableau டாஷ்போர்டின் தரவைப் பதிவிறக்க முடியாது.",
  powerbi: "Power BI அறிக்கையின் தரவைப் பதிவிறக்க முடியாது.", forbidden: "தளம் அணுகலை மறுத்தது.", "404": "அந்த முகவரியில் எதுவும் இல்லை (404).", "500": "தளத்தில் இப்போது பிழை உள்ளது (500).",
  loop: "இணைப்பு சுற்றிச் சுற்றித் திருப்பி விடுகிறது.", timeout: "தளம் உரிய நேரத்தில் பதில் அளிக்கவில்லை.", size: "கோப்பு 15 MB-ஐ விடப் பெரியது.", corrupt: "கோப்பு சேதமடைந்துள்ளது.",
  private: "அந்த முகவரி இந்தக் கணினி அல்லது தனியார் வலையமைப்பில் உள்ளது; பாதுகாப்புக்காகப் படிக்கப்படாது.", invalid: "இது http அல்லது https இணைப்பு அல்ல.",
  network: "தளத்தை அடைய முடியவில்லை.", duplicate: "இந்தத் தரவு ஏற்கனவே ஸ்டுடியோவில் உள்ளது."
};
const TA_ACT: Record<OutcomeAction["act"], string> = { retry: "மீண்டும் முயல்", vault: "உள்நுழைவு விவரங்களைச் சேர்", news: "செய்திகளில் சேர்", useAnyway: "எப்படியும் பயன்படுத்து", open: "அதைத் திற",
  refresh: "அதைப் புதுப்பி", file: "கோப்பைச் சேர்", link: "வேறு இணைப்பு", close: "மூடு" };

const ICON: Record<Outcome["kind"], IconName> = { data: "checkc", choose: "layers", nodata: "doc", notrelevant: "globe", blocked: "lock", error: "alert", duplicate: "copy" };
const TYPE_IC: Record<PickCard["type"], IconName> = { csv: "table", xlsx: "table", pdf: "doc", json: "api", api: "api", map: "map", html: "globe", docx: "doc", xml: "api", zip: "layers", feed: "rss" };
const ACT_IC: Record<OutcomeAction["act"], IconName> = { retry: "refresh", vault: "lock", news: "news", useAnyway: "right", open: "right", refresh: "refresh", file: "download", link: "ext", close: "x" };

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const day = (d: string | null | undefined) => {
  const m = d?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])} ${MON[Number(m[2]) - 1]} ${m[1]}` : "";
};
const n = (x: number) => x.toLocaleString("en-IN");
/** A preview cell: numbers (written as text in a CSV too) in Indian grouping, long text cut at a word. */
const cell = (v: string | number | null, max: number) => {
  if (v == null) return "";
  if (typeof v === "number") return n(v);
  const s = String(v);
  if (/^-?\d{4,}(\.\d+)?$/.test(s.trim()) && !/^(19|20)\d{2}$/.test(s.trim()) && !/^0\d/.test(s.trim())) return n(Number(s));
  return s.length > max ? `${s.slice(0, max).replace(/\s+\S*$/, "")}…` : s;
};
const size = (b: number | null) => (b == null ? "" : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function LangSwitch({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="ds-seg ds-lang" role="group" aria-label={T[lang].lang}>
      <button type="button" className={lang === "en" ? "on" : ""} aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
      <button type="button" lang="ta" className={lang === "ta" ? "on" : ""} aria-pressed={lang === "ta"} onClick={() => setLang("ta")}>தமிழ்</button>
    </div>
  );
}

export function OutcomeView({ outcome, onAction, onBack }: { outcome: Outcome; onAction: (a: OutcomeAction, o: Outcome) => void; onBack: () => void }) {
  const [lang, setLang] = useLang();
  const t = T[lang];
  const title = outcome.kind === "data" || outcome.kind === "choose" ? "" : t[outcome.kind];
  const first = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLElement>(null);
  // on a phone the screen sits below the data list: brought into view, and its first step focused
  useEffect(() => { if (window.innerWidth < 900) box.current?.scrollIntoView({ block: "start" }); first.current?.focus({ preventScroll: true }); }, []);
  return (
    <section ref={box} className={`ds-out k-${outcome.kind}`} aria-labelledby="ds-out-t">
      <header className="ds-out-h">
        <span className="ds-out-ic"><I n={ICON[outcome.kind]} /></span>
        <div className="ds-out-ht">
          <h2 id="ds-out-t" lang={lang}>{title}</h2>
          {outcome.url && <small className="ds-out-url" title={outcome.url}>{outcome.url}</small>}
        </div>
        <LangSwitch lang={lang} setLang={setLang} />
      </header>
      <p className="ds-out-why" role="status" lang={lang === "ta" && TA_WHY[outcome.reason] ? "ta" : "en"}>{lang === "ta" && TA_WHY[outcome.reason] ? TA_WHY[outcome.reason] : outcome.why}</p>
      {lang === "ta" && TA_WHY[outcome.reason] && <p className="ds-muted" lang="en">{outcome.why}</p>}
      {outcome.preview && outcome.preview.rows.length > 0 && (
        <div className="ds-out-sec">
          <h3 lang={lang}>{t.preview}</h3>
          <div className="ds-out-prev" tabIndex={0} role="region" aria-label={t.preview}>
            <table><thead><tr>{outcome.preview.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
              <tbody>{outcome.preview.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{cell(c, 60)}</td>)}</tr>)}</tbody></table>
          </div>
        </div>
      )}
      {outcome.checked.length > 0 && (
        <div className="ds-out-sec">
          <h3 lang={lang}>{t.checked}</h3>
          <ul className="ds-out-checked">{outcome.checked.map((c, i) => <li key={i}><I n="check" />{c}</li>)}</ul>
        </div>
      )}
      <div className="ds-out-sec">
        <h3 lang={lang}>{t.next}</h3>
        <div className="ds-out-acts">
          {outcome.next.map((a, i) => (
            <button key={i} ref={i === 0 ? first : undefined} className={i === 0 ? "ds-btn" : "ds-ghost"} onClick={() => onAction(a, outcome)}>
              <I n={ACT_IC[a.act]} /><span lang={lang}>{lang === "ta" ? TA_ACT[a.act] : a.label}</span>
            </button>
          ))}
          <button className="ds-ghost" onClick={onBack}><I n="chevl" /><span lang={lang}>{lang === "ta" ? "பின்செல்" : "Back"}</span></button>
        </div>
      </div>
    </section>
  );
}

type Sort = "rec" | "new" | "rows";
const PAGE = 50;
const ORDER: PickGroup[] = ["recommended", "series", "other", "notchennai", "unreadable"];

export function Picker({ pick, onAdd, onCancel }: { pick: PickSet; onAdd: (ids: string[], mode: "each" | "combine" | "latest" | "all" | "connector") => void; onCancel: () => void }) {
  const [lang, setLang] = useLang();
  const t = T[lang];
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("rec");
  const [type, setType] = useState<string>("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Record<string, boolean>>({ notchennai: false, unreadable: false });
  const [shown, setShown] = useState(PAGE);
  const [prev, setPrev] = useState<Record<string, { headers: string[]; rows: (string | number | null)[][] } | "loading" | string>>({});
  const real = pick.cards.filter((c) => c.group !== "unreadable");
  const types = [...new Set(real.map((c) => c.type))];
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const x = pick.cards.filter((c) => (!type || c.type === type) && words.every((w) => `${c.name} ${c.headers.join(" ")} ${c.why}`.toLowerCase().includes(w)));
    const by = sort === "new" ? (a: PickCard, b: PickCard) => (b.updated ?? b.dateRange?.to ?? "").localeCompare(a.updated ?? a.dateRange?.to ?? "")
      : sort === "rows" ? (a: PickCard, b: PickCard) => b.rows - a.rows : () => 0;
    return [...x].sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group) || by(a, b));
  }, [pick.cards, q, sort, type]);
  const page = list.slice(0, shown);
  const chosen = real.filter((c) => sel.has(c.id));
  const series = chosen.find((c) => c.series);
  const sameCols = chosen.length >= 2 && chosen.every((c) => c.schema && c.schema === chosen[0].schema);
  const toggle = (id: string) => setSel((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const preview = async (c: PickCard) => {
    if (prev[c.id]) { setPrev((p) => { const x = { ...p }; delete x[c.id]; return x; }); return; }
    setPrev((p) => ({ ...p, [c.id]: "loading" }));
    try { const r = await api<{ headers: string[]; rows: (string | number | null)[][] }>(`/api/collector/studio/pick?token=${encodeURIComponent(pick.token)}&id=${encodeURIComponent(c.id)}`); setPrev((p) => ({ ...p, [c.id]: r })); }
    catch (e) { setPrev((p) => ({ ...p, [c.id]: (e as Error).message })); }
  };
  const box = useRef<HTMLElement>(null);
  useEffect(() => { if (window.innerWidth < 900) box.current?.scrollIntoView({ block: "start" }); }, []);
  const fileOnly = !/^https?:/.test(pick.cards[0]?.source ?? "") || pick.cards.every((c) => c.source === pick.url && c.url === pick.url);

  return (
    <section ref={box} className="ds-pick" aria-labelledby="ds-pick-t">
      <header className="ds-out-h">
        <span className="ds-out-ic k-choose"><I n="layers" /></span>
        <div className="ds-out-ht">
          <h2 id="ds-pick-t" lang={lang}>{real.length === 1 && real[0].series ? t.seriesTitle(real[0].series.files) : fileOnly ? t.pickTitleFile(real.length) : t.pickTitle(real.length)}</h2>
          <small className="ds-out-url" title={pick.url}>{pick.title} · {pick.url}</small>
        </div>
        <LangSwitch lang={lang} setLang={setLang} />
      </header>
      <div className="ds-pick-tools">
        <div className="ds-input"><I n="search" /><input value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder={t.search} aria-label={t.search} /></div>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="rec">{t.sortRec}</option><option value="new">{t.sortNew}</option><option value="rows">{t.sortRows}</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          <option value="">{t.allTypes}</option>{types.map((x) => <option key={x} value={x}>{x.toUpperCase()}</option>)}
        </select>
        <button className="ds-ghost" onClick={() => setSel(new Set(real.filter((c) => c.group === "recommended" || c.group === "series").map((c) => c.id)))}><I n="checkc" />{t.selectRec}</button>
      </div>
      <div className="ds-pick-l">
        {!page.length && <p className="ds-muted pad">{t.none}</p>}
        {ORDER.map((g) => {
          const cards = page.filter((c) => c.group === g);
          if (!cards.length) return null;
          const folded = (g === "notchennai" || g === "unreadable") && !open[g];
          return (
            <div key={g} className={`ds-pick-g g-${g}`}>
              <button className="ds-pick-gh" aria-expanded={!folded} onClick={() => setOpen((o) => ({ ...o, [g]: folded }))}>
                <I n={folded ? "chevr" : "chevd"} /><b lang={lang}>{t.groups[g]}</b><span className="cnt-b">{cards.length}</span>
              </button>
              {!folded && cards.map((c) => {
                const p = prev[c.id];
                const can = c.group !== "unreadable";
                return (
                  <article key={c.id} className={`ds-pcard${sel.has(c.id) ? " on" : ""}${can ? "" : " off"}`}>
                    <label className="ds-pcard-h">
                      {can ? <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Choose ${c.name}`} /> : <span className="ds-pcard-x"><I n="x" /></span>}
                      <span className={`ds-pcard-ic t-${c.type}`}><I n={TYPE_IC[c.type] ?? "table"} /><em>{c.type.toUpperCase()}</em></span>
                      <span className="ds-pcard-b">
                        <b>{c.series ? `${c.series.title} · ${n(c.series.files)} ${t.files} · ${day(c.series.from)} → ${day(c.series.to)}` : c.name}</b>
                        <small>{c.why}</small>
                      </span>
                    </label>
                    {can && (
                      <>
                        <div className="ds-pcard-m">
                          <span>{n(c.rows)} {t.rows} × {c.cols} {t.cols}</span>
                          {c.dateRange && !c.series && <span>{day(c.dateRange.from)} → {day(c.dateRange.to)}</span>}
                          {c.chennaiRows ? <span>{n(c.chennaiRows)} {t.chennai}</span> : null}
                          {c.updated && <span>{t.updated} {day(c.updated)}</span>}
                          {c.bytes ? <span>{size(c.bytes)}</span> : null}
                          {c.source && c.source !== pick.url && <span className="src" title={c.source}>{t.from} {c.source.replace(/^https?:\/\//, "").slice(0, 40)}</span>}
                        </div>
                        <div className="ds-pcard-cols">{c.headers.slice(0, 6).map((h, i) => <span key={i} className="ds-tag">{h}</span>)}{c.headers.length > 6 && <span className="ds-tag more">+{c.headers.length - 6}</span>}</div>
                        {c.series && sel.has(c.id) && (
                          <div className="ds-pcard-series" role="group" aria-label="Series">
                            <button className="ds-btn sm" onClick={() => onAdd([c.id], "latest")}>{t.latest}</button>
                            <button className="ds-ghost" onClick={() => onAdd([c.id], "all")}>{t.all}</button>
                            <button className="ds-ghost" onClick={() => onAdd([c.id], "connector")}><I n="refresh" />{t.keep}</button>
                          </div>
                        )}
                        <button className="ds-lnk" aria-expanded={!!p && p !== "loading"} onClick={() => preview(c)}>{p && p !== "loading" ? t.hide : t.show}</button>
                        {p === "loading" && <div className="ds-skel sm" aria-live="polite" aria-label={t.loading} />}
                        {p && typeof p === "string" && p !== "loading" && <p className="ds-muted">{p}</p>}
                        {p && typeof p === "object" && (
                          <div className="ds-out-prev" tabIndex={0} role="region" aria-label={`${c.name}: 5 rows`}>
                            <table><thead><tr>{p.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                              <tbody>{p.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{cell(v, 50)}</td>)}</tr>)}</tbody></table>
                          </div>
                        )}
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          );
        })}
        {list.length > shown && <button className="ds-ghost wide" onClick={() => setShown((s) => s + PAGE)}>{t.more(Math.min(PAGE, list.length - shown))}</button>}
      </div>
      <footer className="ds-pick-f">
        {chosen.length >= 2 && !sameCols && <small className="ds-muted" lang={lang}>{t.combineNo}</small>}
        <button className="ds-ghost" onClick={onCancel}>{t.cancel}</button>
        {sameCols && <button className="ds-ghost" onClick={() => onAdd(chosen.map((c) => c.id), "combine")}><I n="layers" />{t.combine}</button>}
        <button className="ds-btn" disabled={!chosen.length || (chosen.length === 1 && !!series)} onClick={() => onAdd(chosen.map((c) => c.id), "each")}>
          <I n="plus" />{t.add(chosen.length)}
        </button>
      </footer>
    </section>
  );
}
