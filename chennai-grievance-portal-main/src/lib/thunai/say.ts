/**
 * Everything Thunai says, English and Tamil, comes from these templates filled with numbers the console computed. The
 * number guard refuses any line with a number that was not handed to it, so no model and no template slip can put an
 * invented figure in the Collector's ear.
 */
import type { Lang } from "./types";

type Fields = Record<string, string | number | null | undefined>;

const T: Record<string, { en: string; ta: string }> = {
  greet: { en: "Good morning. {severe} severe incidents open, {alerts} alerts. Say \"brief me\" for the brief.",
    ta: "காலை வணக்கம். {severe} கடுமையான நிகழ்வுகள் திறந்துள்ளன, {alerts} எச்சரிக்கைகள். சுருக்கத்துக்கு \"brief me\" என்று சொல்லுங்கள்." },
  zone: { en: "Zone {n}, {name}.", ta: "மண்டலம் {n}, {name}." },
  reservoir: { en: "{name} is {pct} percent full, as of {asOf}.", ta: "{name} {pct} சதவீதம் நிரம்பியுள்ளது, {asOf} நிலவரப்படி." },
  reservoirs: { en: "Reservoirs: {list}. As of {asOf}.", ta: "ஏரிகள்: {list}. {asOf} நிலவரப்படி." },
  rain: { en: "{name}: {mm} millimetres of rain in the latest reading, {asOf}.", ta: "{name}: சமீபத்திய அளவில் {mm} மில்லிமீட்டர் மழை, {asOf}." },
  air: { en: "Air quality at {name}: index {aqi}, {asOf}.", ta: "{name} காற்றின் தரக் குறியீடு {aqi}, {asOf}." },
  noData: { en: "That reading is not in the console's data.", ta: "அந்த அளவு தரவில் இல்லை." },
  worstZone: { en: "{name} has the most: {severe} severe and {open} open incidents.", ta: "{name} மண்டலத்தில் அதிகம்: {severe} கடுமையான, {open} திறந்த நிகழ்வுகள்." },
  item: { en: "{title}.", ta: "{title}." },
  noItem: { en: "There is no list on screen to pick from.", ta: "தேர்வு செய்யத் திரையில் பட்டியல் இல்லை." },
  noIncident: { en: "No incident is open.", ta: "எந்த நிகழ்வும் திறக்கப்படவில்லை." },
  draft: { en: "The draft is open. Nothing is sent until you confirm.", ta: "வரைவு திறந்துள்ளது. நீங்கள் உறுதி செய்யும் வரை எதுவும் அனுப்பப்படாது." },
  undone: { en: "Undone: {what}.", ta: "திரும்பப் பெற்றேன்: {what}." },
  nothingToUndo: { en: "Nothing to undo.", ta: "திரும்பப் பெற எதுவும் இல்லை." },
  notUnderstood: { en: "I heard \"{heard}\" but did not understand. Try: {examples}.", ta: "\"{heard}\" என்று கேட்டேன், புரியவில்லை. இப்படிச் சொல்லுங்கள்: {examples}." },
  refused: { en: "{why}", ta: "{why}" },
  askOnce: { en: "{question}", ta: "{question}" },
  sendGate: { en: "{n} drafts ready. Say confirm {n}.", ta: "{n} வரைவுகள் தயார். உறுதி {n} என்று சொல்லுங்கள்." },
  confirmCount: { en: "Say confirm and the number: confirm {n}.", ta: "எண்ணுடன் சொல்லுங்கள்: உறுதி {n}." },
  confirmMismatch: { en: "There are {n} in the tray, not {said}. Say confirm {n}.", ta: "தட்டில் {n} உள்ளன, {said} அல்ல. உறுதி {n} என்று சொல்லுங்கள்." },
  confirmEarly: { en: "Please read the drafts first, then say confirm {n}.", ta: "முதலில் வரைவுகளைப் படியுங்கள், பிறகு உறுதி {n} என்று சொல்லுங்கள்." },
  trayEmpty: { en: "Nothing is waiting for approval.", ta: "ஒப்புதலுக்கு எதுவும் காத்திருக்கவில்லை." },
  sent: { en: "Sent {n} through the test channel.", ta: "சோதனை வழியில் {n} அனுப்பப்பட்டது." },
  approvedOnly: { en: "Approved. Send it from the incident panel.", ta: "ஒப்புதல் அளிக்கப்பட்டது. நிகழ்வுப் பலகையிலிருந்து அனுப்புங்கள்." },
  saved: { en: "Saved as {name}.", ta: "{name} என்று சேமித்தேன்." },
  remembered: { en: "I'll remember that.", ta: "நினைவில் வைத்துக்கொண்டேன்." },
  forgotten: { en: "Forgotten.", ta: "மறந்துவிட்டேன்." },
  forgottenAll: { en: "Everything I remembered is forgotten. The audit trail stays.", ta: "நினைவில் இருந்த அனைத்தும் மறக்கப்பட்டது. தணிக்கைப் பதிவு மட்டும் இருக்கும்." },
  reminder: { en: "Reminder set for {when}.", ta: "{when} நினைவூட்டல் வைத்தேன்." },
  reminderDue: { en: "Reminder: {text}.", ta: "நினைவூட்டல்: {text}." },
  where: { en: "{page}. {scope}. {period}.", ta: "{page}. {scope}. {period}." },
  explainChart: { en: "{title}: highest {hiLabel} at {hi}, lowest {loLabel} at {lo}.", ta: "{title}: அதிகம் {hiLabel} {hi}, குறைவு {loLabel} {lo}." },
  noChart: { en: "Point at a chart, or open one, then say explain.", ta: "ஒரு வரைபடத்தைத் திறந்து, பிறகு \"விளக்கு\" என்று சொல்லுங்கள்." },
  didNothing: { en: "I haven't done anything yet.", ta: "நான் இன்னும் எதுவும் செய்யவில்லை." },
  did: { en: "I did: {what}.", ta: "நான் செய்தது: {what}." },
  briefPoint: { en: "{text}", ta: "{text}" },
  briefNone: { en: "The day's brief is not ready yet.", ta: "இன்றைய சுருக்கம் இன்னும் தயாராகவில்லை." },
  missionStopped: { en: "Stopped.", ta: "நிறுத்தினேன்." },
  noWorkspace: { en: "No saved view is called {name}.", ta: "{name} என்ற சேமித்த பார்வை இல்லை." },
  openedWorkspace: { en: "Opened {name}.", ta: "{name} திறந்தேன்." },
  saveAsk: { en: "Save this view as {name}?", ta: "இந்தப் பார்வையை {name} என்று சேமிக்கவா?" },
  rememberAsk: { en: "Remember: {text}?", ta: "நினைவில் வைக்கவா: {text}?" },
  forgetAsk: { en: "Forget {what}?", ta: "{what} மறக்கவா?" },
  remindAsk: { en: "Remind you {when}: {text}?", ta: "{when} நினைவூட்டவா: {text}?" },
  lowConfidence: { en: "Did you mean {what}?", ta: "{what} என்று சொன்னீர்களா?" },
  draftsMaking: { en: "Preparing {n} drafts.", ta: "{n} வரைவுகள் தயாராகின்றன." },
  noDraft: { en: "No incident to draft for on screen.", ta: "வரைவு செய்யத் திரையில் நிகழ்வு இல்லை." },
  onLine: { en: "Thunai is on. Hold Alt and Space, or the orb, to talk.", ta: "துணை இயக்கத்தில் உள்ளது. பேச Alt + Space அல்லது வட்டத்தை அழுத்திப் பிடியுங்கள்." },
  offLine: { en: "Thunai is off.", ta: "துணை அணைக்கப்பட்டது." },
  aiThinking: { en: "Thinking…", ta: "யோசிக்கிறேன்…" },
  memoryFail: { en: "I could not save that to memory. Nothing was changed.", ta: "நினைவில் சேமிக்க முடியவில்லை. எதுவும் மாறவில்லை." },
  offline: { en: "Speech recognition needs the network. Type instead.", ta: "குரல் அறிதலுக்கு இணையம் தேவை. தட்டச்சு செய்யுங்கள்." },
  noMic: { en: "This browser cannot listen. Type the command instead.", ta: "இந்த உலாவி கேட்க முடியாது. கட்டளையைத் தட்டச்சு செய்யுங்கள்." },
  staleData: { en: "{what} data is {age} old.", ta: "{what} தரவு {age} பழையது." },
  alert: { en: "{text}", ta: "{text}" },
  help: { en: "Try: zone 7, only this week, show the worst flooding, show numbers, go back.", ta: "இப்படிச் சொல்லுங்கள்: ஏழாவது மண்டலம், இந்த வாரம், மோசமான வெள்ளம் காட்டு, எண்களைக் காட்டு, பழையபடி மாத்து." }
};

export type LineKey = keyof typeof T;

/** The numbers in a text (digits, with grouping commas and decimals). */
export function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => x.replace(/,/g, ""));
}

/** True when every number in the line was one of the given fields (or part of the template itself). */
export function numberGuard(line: string, fields: Fields, template: string): boolean {
  const allowed = new Set<string>([...numbersIn(template)]);
  for (const v of Object.values(fields)) if (v != null) for (const x of numbersIn(String(v))) allowed.add(x);
  return numbersIn(line).every((x) => allowed.has(x));
}

/** A spoken line. Throws if the number guard fails, so a bug can never be spoken. */
export function say(key: LineKey, lang: Lang, fields: Fields = {}): string {
  const tpl = T[key][lang] ?? T[key].en;
  const line = tpl.replace(/\{(\w+)\}/g, (_, k) => {
    const v = fields[k];
    return v == null ? "" : typeof v === "number" ? v.toLocaleString("en-IN") : String(v);
  }).replace(/\s+([.,])/g, "$1").replace(/\s{2,}/g, " ").trim()
    // "1 drafts ready" reads "1 draft ready"
    .replace(/(^|\s)1 (draft|case|incident|headline|day|hour|reminder)s\b/g, "$11 $2");
  if (!numberGuard(line, fields, tpl)) throw new Error(`number guard: ${key}`);
  return line;
}
