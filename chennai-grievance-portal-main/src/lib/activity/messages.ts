/**
 * What the site tells the officer or citizen it is doing, for every request a click can start: the wording of one notice, in the plain
 * and formal voice of a government office. The notice itself is drawn by install.ts. Pure, so every route's wording is tested.
 */

export interface Notice {
  /** what is happening now, without "Please wait." */
  doing: string;
  /** what has been done, once it succeeds. Only for something that changed a record; a mere reading says nothing when it is over. */
  done?: string;
  /** stays up after the answer, until the next page has arrived (signing out) */
  hold?: boolean;
  /** covers the page: nothing else can be done meanwhile */
  full?: boolean;
  /** the screen reports a failure itself in its own words (a wrong password) */
  quietFailure?: boolean;
  /** the main thing a click asked for: gives the notice its words when several requests share it */
  primary?: boolean;
  /** a panel filling in beside the main content: does not hold up a notice that is already showing */
  secondary?: boolean;
}

type Rule = [method: string, path: RegExp, notice: Notice | ((body: Record<string, unknown>) => Notice | null)];

const said = (doing: string, done?: string): Notice => ({ doing, done });

/** Requests the site makes by itself, or as someone types. Never announced. */
export const BACKGROUND: RegExp[] = [
  /^\/api\/auth\/(tab|me)$/, /^\/api\/i18n$/, /^\/api\/jarvis\//, /^\/api\/collector\/thunai\//, /^\/api\/dev\//,
  /^\/api\/collector\/assistant\/(insights|status|tools|sessions)$/, /^\/api\/collector\/(alerts|search|geo|conflicts|nearby)$/, /^\/api\/rehearsal\/state$/, /^\/api\/collector\/studio\/watch$/,
  /^\/api\/officer\/(geo|search)$/, /^\/api\/officer\/photos\//, /^\/api\/map\/suggest$/,
  /^\/api\/locations\/(areas|gcc-localities|gcc-streets|localities|streets|wards|zones)$/, /^\/api\/(complaint-taxonomy|complaint-types|departments)$/,
  /^\/api\/manu\/photos\//, /^\/api\/complaints\/media\/.+/, /^\/api\/rehearsal\/(photo|traffic\/\d)/
];

const manuAction = (b: Record<string, unknown>): Notice | null => {
  switch (b.action) {
    case "file": return said("Approving the petition and forwarding it to the department", "The petition has been approved and forwarded.");
    case "read": return said("Sending the petition to be read again", "The petition has been sent to be read again.");
    case "delete": return said("Deleting the petition", "The petition has been deleted.");
    case "delete_page": return said("Deleting the page", "The page has been deleted. The remaining pages are being read again.");
    case "repeats": return null; // follows the officer's typing
    default: return said("Processing the petition");
  }
};

const RULES: Rule[] = [
  // ---- signing in and out
  ["POST", /^\/api\/auth\/logout$/, { doing: "Signing you out securely", hold: true, full: true }],
  ["POST", /^\/api\/auth\/login$/, { doing: "Verifying your sign-in details", quietFailure: true }],
  ["POST", /^\/api\/auth\/register$/, { ...said("Submitting your registration", "Your registration has been submitted."), quietFailure: true }],
  ["POST", /^\/api\/auth\/confirm$/, { doing: "Verifying your password", quietFailure: true }],
  // the server answers the same words whether or not the email has an account, and sends nothing in its cooldown (QA pass 5, P5-017)
  ["POST", /^\/api\/auth\/forgot-password\/request-otp$/, { ...said("Sending the one-time password", "If that email has an account, the one-time password is on its way."), quietFailure: true }],
  ["POST", /^\/api\/auth\/forgot-password\/verify-otp$/, { ...said("Verifying the one-time password", "The one-time password has been verified."), quietFailure: true }],
  ["POST", /^\/api\/auth\/forgot-password\/reset-password$/, { ...said("Updating your password", "Your password has been updated."), quietFailure: true }],
  ["GET", /^\/api\/auth\/security$/, said("Retrieving your sign-in records")],
  ["POST", /^\/api\/auth\/security$/, said("Updating your session security", "Your session security has been updated.")],

  // ---- the Manu Desk
  ["POST", /^\/api\/manu\/petitions$/, said("Uploading the petition securely", "The petition has been received and is being read.")],
  ["GET", /^\/api\/manu\/petitions$/, { doing: "" }], // the desk's own polling: see isBackground
  ["GET", /^\/api\/manu\/petitions\/\d+$/, said("Retrieving the petition")],
  ["POST", /^\/api\/manu\/petitions\/\d+$/, manuAction],
  ["GET", /^\/api\/manu\/case\//, said("Retrieving the original petition")],

  // ---- the Collector's console
  ["GET", /^\/api\/collector\/overview$/, { ...said("Updating the dashboard"), primary: true }],
  ["GET", /^\/api\/collector\/brief$/, { ...said("Preparing the district briefing"), secondary: true }],
  ["GET", /^\/api\/collector\/insights$/, said("Compiling the analysis")],
  ["GET", /^\/api\/collector\/list$/, said("Retrieving the records")],
  ["GET", /^\/api\/collector\/incidents\/[^/]+$/, said("Retrieving the incident record")],
  ["GET", /^\/api\/collector\/incidents\/[^/]+\/analysis$/, said("Preparing the analysis of this incident")],
  ["GET", /^\/api\/collector\/incidents\/[^/]+\/action$/, said("Preparing the recommended action")],
  ["POST", /^\/api\/collector\/incidents\/[^/]+\/action$/, said("Recording the action and informing the department", "The action has been recorded and the department informed.")],
  ["POST", /^\/api\/collector\/decisions$/, said("Recording your decision", "Your decision has been recorded.")],
  ["POST", /^\/api\/collector\/actions$/, said("Recording the action", "The action has been recorded.")],
  ["GET", /^\/api\/collector\/news$/, said("Retrieving the news reports")],
  ["GET", /^\/api\/collector\/news\/article$/, said("Retrieving the news article")],
  ["GET", /^\/api\/collector\/news\/analysis$/, said("Preparing the analysis of this report")],
  ["GET", /^\/api\/collector\/stories$/, { ...said("Retrieving the developing stories"), secondary: true }],
  ["GET", /^\/api\/collector\/pattern$/, said("Retrieving the details of this pattern")],
  ["GET", /^\/api\/collector\/audit$/, said("Retrieving the audit log")],
  ["GET", /^\/api\/collector\/export$/, said("Preparing the export file", "The export file is ready.")],
  ["GET", /^\/api\/collector\/report$/, said("Generating the report", "The report is ready.")],
  ["POST", /^\/api\/collector\/jobs\/route-news$/, said("Routing the news reports to the departments", "The news reports have been routed.")],
  ["GET", /^\/api\/collector\/sources$/, said("Retrieving the data sources")],
  ["POST", /^\/api\/collector\/sources\/onboard/, { doing: "Examining the data source", quietFailure: true }],
  ["DELETE", /^\/api\/collector\/sources\//, said("Removing the data source", "The data source has been removed.")],
  ["*", /^\/api\/collector\/sources/, said("Updating the data sources", "The data sources have been updated.")],
  ["GET", /^\/api\/collector\/workspaces$/, said("Retrieving the saved workspaces")],
  ["POST", /^\/api\/collector\/workspaces$/, said("Saving the workspace", "The workspace has been saved.")],
  ["PATCH", /^\/api\/collector\/workspaces$/, said("Updating the workspace", "The workspace has been updated.")],
  ["DELETE", /^\/api\/collector\/workspaces$/, said("Removing the workspace", "The workspace has been removed.")],
  ["GET", /^\/api\/collector\/workspaces\/\d+$/, said("Opening the saved workspace")],
  ["GET", /^\/api\/collector\/studio$/, said("Retrieving your datasets")],
  ["POST", /^\/api\/collector\/studio$/, said("Uploading and processing your data", "Your data has been received.")],
  ["GET", /^\/api\/collector\/studio\/(connectors|pick)$/, said("Retrieving the available connections")],
  ["POST", /^\/api\/collector\/studio\/(connectors|pick)$/, said("Connecting to the data source", "The data source has been connected.")],
  ["GET", /^\/api\/collector\/studio\/[^/]+$/, said("Opening the dataset")],
  ["POST", /^\/api\/collector\/studio\/[^/]+$/, said("Processing your request on this dataset")],
  ["PATCH", /^\/api\/collector\/studio\/[^/]+$/, said("Updating the dataset", "The dataset has been updated.")],
  ["DELETE", /^\/api\/collector\/studio\/[^/]+$/, said("Removing the dataset", "The dataset has been removed.")],
  ["POST", /^\/api\/collector\/assistant\/chat$/, said("Preparing the response to your question")],
  ["POST", /^\/api\/collector\/assistant\/briefing$/, said("Preparing the briefing")],
  ["POST", /^\/api\/collector\/assistant\/feedback$/, said("Recording your feedback", "Your feedback has been recorded.")],
  ["GET", /^\/api\/collector\/assistant\/pins$/, said("Retrieving the saved answers")],
  ["POST", /^\/api\/collector\/assistant\/pins$/, said("Saving this answer", "The answer has been saved.")],
  ["DELETE", /^\/api\/collector\/assistant\/pins$/, said("Removing the saved answer", "The saved answer has been removed.")],
  ["GET", /^\/api\/collector\/assistant\/export$/, said("Preparing the export file", "The export file is ready.")],
  ["GET", /^\/api\/collector\/assistant\/sessions\//, said("Retrieving the earlier conversation")],

  // ---- the map and the rain plan
  ["POST", /^\/api\/map\/ask$/, said("Examining the map for your question")],
  ["POST", /^\/api\/map\/insight$/, said("Preparing the analysis of this area")],
  ["POST", /^\/api\/map\/export$/, said("Preparing the map export", "The map export is ready.")],
  ["POST", /^\/api\/map\/send$/, said("Forwarding the work to the departments", "The work has been forwarded to the departments.")],
  ["GET", /^\/api\/map\/layers\//, said("Loading the map layer")],
  ["GET", /^\/api\/rehearsal\/rains$/, said("Retrieving past rainfall records")],
  ["GET", /^\/api\/rehearsal\/impacts$/, said("Retrieving the flood impact records")],
  ["GET", /^\/api\/rehearsal\/reach$/, said("Calculating the areas affected")],
  ["GET", /^\/api\/rehearsal\/traffic\/live$/, said("Retrieving live traffic")],
  ["POST", /^\/api\/rehearsal\/plan$/, said("Preparing the rain response plan")],
  ["POST", /^\/api\/rehearsal\/route$/, said("Calculating the route")],
  ["GET", /^\/api\/rehearsal\/tasks$/, said("Retrieving the assigned tasks")],
  ["POST", /^\/api\/rehearsal\/tasks$/, said("Forwarding the tasks to the departments", "The tasks have been forwarded to the departments.")],

  // ---- the department officer's console
  ["GET", /^\/api\/officer\/overview$/, { ...said("Updating your department's dashboard"), primary: true }],
  ["GET", /^\/api\/officer\/insights$/, said("Compiling your department's analysis")],
  ["GET", /^\/api\/officer\/grievances$/, said("Retrieving the complaints")],
  ["GET", /^\/api\/officer\/grievances\/[^/]+$/, said("Retrieving the complaint record")],
  ["POST", /^\/api\/officer\/grievances\/[^/]+$/, said("Recording your update", "Your update has been recorded.")],
  ["POST", /^\/api\/officer\/grievances\/[^/]+\/report$/, said("Submitting the completion report", "The completion report has been submitted.")],

  // ---- citizens
  ["POST", /^\/api\/complaints$/, said("Submitting your complaint", "Your complaint has been registered.")],
  ["GET", /^\/api\/complaints$/, said("Retrieving your complaints")],
  ["GET", /^\/api\/complaints\/[^/]+$/, said("Retrieving the complaint details")],
  ["POST", /^\/api\/complaints\/media$/, said("Uploading the attachment", "The attachment has been uploaded.")],
  ["POST", /^\/api\/track$/, { doing: "Retrieving the status of your complaint", quietFailure: true }],
  ["GET", /^\/api\/locations\/resolve-ward$/, said("Identifying the ward for this location")],
  ["GET", /^\/api\/profile$/, said("Retrieving your profile")],
  ["PUT", /^\/api\/profile$/, said("Updating your profile", "Your profile has been updated.")],
  ["POST", /^\/api\/profile\/photo$/, said("Uploading your photograph", "Your photograph has been updated.")],
  ["POST", /^\/api\/profile\/change-password$/, { ...said("Updating your password", "Your password has been updated."), quietFailure: true }],
  ["POST", /^\/api\/profile\/mobile-otp\/request$/, { ...said("Sending the one-time password", "The one-time password has been sent."), quietFailure: true }],
  ["POST", /^\/api\/profile\/mobile-otp\/verify$/, { ...said("Verifying the one-time password", "The one-time password has been verified."), quietFailure: true }]
];

export const isBackground = (method: string, path: string): boolean =>
  BACKGROUND.some((r) => r.test(path)) || (method === "GET" && path === "/api/manu/petitions");

/** The notice for a request a click started; null when it is one that is never announced. */
export function noticeFor(method: string, path: string, body?: unknown): Notice | null {
  const m = method.toUpperCase();
  if (isBackground(m, path)) return null;
  let parsed: Record<string, unknown> = {};
  if (typeof body === "string") { try { parsed = JSON.parse(body) as Record<string, unknown>; } catch { /* not JSON */ } }
  for (const [rm, re, n] of RULES) {
    if ((rm === "*" || rm === m) && re.test(path)) return typeof n === "function" ? n(parsed) : n;
  }
  return m === "GET" ? said("Retrieving the requested information") : said("Processing your request", "Your request has been completed.");
}

export const SIGNING_OUT = RULES[0][2] as Notice;

/** What a link opens, by address, in English and Tamil. */
export const PAGE_NAMES: Record<string, [string, string]> = {
  "/": ["the home page", "முகப்புப் பக்கம்"],
  "/login": ["the sign-in page", "உள்நுழைவுப் பக்கம்"],
  "/register": ["the registration page", "பதிவுப் பக்கம்"],
  "/forgot-password": ["the password recovery page", "கடவுச்சொல் மீட்புப் பக்கம்"],
  "/track": ["the complaint tracking page", "புகார் கண்காணிப்புப் பக்கம்"],
  "/citizen": ["the Citizen Portal", "குடிமக்கள் தளம்"],
  "/citizen/file-complaint": ["the complaint form", "புகார் படிவம்"],
  "/citizen/track-complaints": ["your complaints", "உங்கள் புகார்கள்"],
  "/profile": ["your profile", "உங்கள் சுயவிவரம்"],
  "/collector": ["the Collector's console", "ஆட்சியர் பணியகம்"],
  "/officer": ["the Officer's console", "அலுவலர் பணியகம்"]
};
export const FAILED = "The request could not be completed. Please try again.";
export const SLOW = "This is taking longer than usual. Your request is still being processed.";
export const PLEASE_WAIT = "Please wait.";

/** Tamil for every notice above, checked by a test. */
export const NOTICE_TA: Record<string, string> = {
  "Please wait.": "தயவுசெய்து காத்திருக்கவும்.",
  [FAILED]: "கோரிக்கையை நிறைவேற்ற முடியவில்லை. மீண்டும் முயற்சிக்கவும்.",
  [SLOW]: "வழக்கத்தை விட அதிக நேரம் ஆகிறது. உங்கள் கோரிக்கை தொடர்ந்து செயலாக்கப்படுகிறது.",
  "Signing you out securely": "பாதுகாப்பாக வெளியேற்றப்படுகிறது",
  "Verifying your sign-in details": "உள்நுழைவு விவரங்கள் சரிபார்க்கப்படுகின்றன",
  "Submitting your registration": "உங்கள் பதிவு சமர்ப்பிக்கப்படுகிறது",
  "Your registration has been submitted.": "உங்கள் பதிவு சமர்ப்பிக்கப்பட்டது.",
  "Verifying your password": "கடவுச்சொல் சரிபார்க்கப்படுகிறது",
  "Sending the one-time password": "ஒருமுறை கடவுச்சொல் அனுப்பப்படுகிறது",
  "The one-time password has been sent.": "ஒருமுறை கடவுச்சொல் அனுப்பப்பட்டது.",
  "If that email has an account, the one-time password is on its way.": "அந்த மின்னஞ்சலுக்குக் கணக்கு இருந்தால், ஒருமுறை கடவுச்சொல் அனுப்பப்படுகிறது.",
  "Verifying the one-time password": "ஒருமுறை கடவுச்சொல் சரிபார்க்கப்படுகிறது",
  "The one-time password has been verified.": "ஒருமுறை கடவுச்சொல் சரிபார்க்கப்பட்டது.",
  "Updating your password": "கடவுச்சொல் புதுப்பிக்கப்படுகிறது",
  "Your password has been updated.": "கடவுச்சொல் புதுப்பிக்கப்பட்டது.",
  "Retrieving your sign-in records": "உள்நுழைவுப் பதிவுகள் பெறப்படுகின்றன",
  "Updating your session security": "அமர்வுப் பாதுகாப்பு புதுப்பிக்கப்படுகிறது",
  "Your session security has been updated.": "அமர்வுப் பாதுகாப்பு புதுப்பிக்கப்பட்டது.",
  "Approving the petition and forwarding it to the department": "மனு அங்கீகரிக்கப்பட்டு துறைக்கு அனுப்பப்படுகிறது",
  "The petition has been approved and forwarded.": "மனு அங்கீகரிக்கப்பட்டு அனுப்பப்பட்டது.",
  "Sending the petition to be read again": "மனு மீண்டும் படிக்க அனுப்பப்படுகிறது",
  "The petition has been sent to be read again.": "மனு மீண்டும் படிக்க அனுப்பப்பட்டது.",
  "Deleting the petition": "மனு நீக்கப்படுகிறது",
  "The petition has been deleted.": "மனு நீக்கப்பட்டது.",
  "Deleting the page": "பக்கம் நீக்கப்படுகிறது",
  "The page has been deleted. The remaining pages are being read again.": "பக்கம் நீக்கப்பட்டது. மீதமுள்ள பக்கங்கள் மீண்டும் படிக்கப்படுகின்றன.",
  "Processing the petition": "மனு செயலாக்கப்படுகிறது",
  "Uploading the petition securely": "மனு பாதுகாப்பாகப் பதிவேற்றப்படுகிறது",
  "The petition has been received and is being read.": "மனு பெறப்பட்டது; படிக்கப்படுகிறது.",
  "Retrieving the petition": "மனு பெறப்படுகிறது",
  "Retrieving the original petition": "அசல் மனு பெறப்படுகிறது",
  "Updating the dashboard": "டாஷ்போர்டு புதுப்பிக்கப்படுகிறது",
  "Preparing the district briefing": "மாவட்டச் சுருக்கம் தயாரிக்கப்படுகிறது",
  "Compiling the analysis": "பகுப்பாய்வு தொகுக்கப்படுகிறது",
  "Retrieving the records": "பதிவுகள் பெறப்படுகின்றன",
  "Retrieving the incident record": "நிகழ்வுப் பதிவு பெறப்படுகிறது",
  "Preparing the analysis of this incident": "இந்த நிகழ்வின் பகுப்பாய்வு தயாரிக்கப்படுகிறது",
  "Preparing the recommended action": "பரிந்துரைக்கப்பட்ட நடவடிக்கை தயாரிக்கப்படுகிறது",
  "Recording the action and informing the department": "நடவடிக்கை பதிவு செய்யப்பட்டு துறைக்குத் தெரிவிக்கப்படுகிறது",
  "The action has been recorded and the department informed.": "நடவடிக்கை பதிவு செய்யப்பட்டு துறைக்குத் தெரிவிக்கப்பட்டது.",
  "Recording your decision": "உங்கள் முடிவு பதிவு செய்யப்படுகிறது",
  "Your decision has been recorded.": "உங்கள் முடிவு பதிவு செய்யப்பட்டது.",
  "Recording the action": "நடவடிக்கை பதிவு செய்யப்படுகிறது",
  "The action has been recorded.": "நடவடிக்கை பதிவு செய்யப்பட்டது.",
  "Retrieving the news reports": "செய்தி அறிக்கைகள் பெறப்படுகின்றன",
  "Retrieving the news article": "செய்திக் கட்டுரை பெறப்படுகிறது",
  "Preparing the analysis of this report": "இந்த அறிக்கையின் பகுப்பாய்வு தயாரிக்கப்படுகிறது",
  "Retrieving the developing stories": "வளர்ந்து வரும் செய்திகள் பெறப்படுகின்றன",
  "Comparing the reports received": "பெறப்பட்ட அறிக்கைகள் ஒப்பிடப்படுகின்றன",
  "Retrieving reports from neighbouring districts": "அண்டை மாவட்டங்களின் அறிக்கைகள் பெறப்படுகின்றன",
  "Retrieving the details of this pattern": "இந்தப் போக்கின் விவரங்கள் பெறப்படுகின்றன",
  "Retrieving the audit log": "தணிக்கைப் பதிவு பெறப்படுகிறது",
  "Preparing the export file": "ஏற்றுமதிக் கோப்பு தயாரிக்கப்படுகிறது",
  "The export file is ready.": "ஏற்றுமதிக் கோப்பு தயார்.",
  "Generating the report": "அறிக்கை உருவாக்கப்படுகிறது",
  "The report is ready.": "அறிக்கை தயார்.",
  "Routing the news reports to the departments": "செய்தி அறிக்கைகள் துறைகளுக்கு அனுப்பப்படுகின்றன",
  "The news reports have been routed.": "செய்தி அறிக்கைகள் அனுப்பப்பட்டன.",
  "Retrieving the data sources": "தரவு மூலங்கள் பெறப்படுகின்றன",
  "Examining the data source": "தரவு மூலம் ஆய்வு செய்யப்படுகிறது",
  "Removing the data source": "தரவு மூலம் நீக்கப்படுகிறது",
  "The data source has been removed.": "தரவு மூலம் நீக்கப்பட்டது.",
  "Updating the data sources": "தரவு மூலங்கள் புதுப்பிக்கப்படுகின்றன",
  "The data sources have been updated.": "தரவு மூலங்கள் புதுப்பிக்கப்பட்டன.",
  "Retrieving the saved workspaces": "சேமித்த பணியிடங்கள் பெறப்படுகின்றன",
  "Saving the workspace": "பணியிடம் சேமிக்கப்படுகிறது",
  "The workspace has been saved.": "பணியிடம் சேமிக்கப்பட்டது.",
  "Updating the workspace": "பணியிடம் புதுப்பிக்கப்படுகிறது",
  "The workspace has been updated.": "பணியிடம் புதுப்பிக்கப்பட்டது.",
  "Removing the workspace": "பணியிடம் நீக்கப்படுகிறது",
  "The workspace has been removed.": "பணியிடம் நீக்கப்பட்டது.",
  "Opening the saved workspace": "சேமித்த பணியிடம் திறக்கப்படுகிறது",
  "Retrieving your datasets": "உங்கள் தரவுத்தொகுப்புகள் பெறப்படுகின்றன",
  "Uploading and processing your data": "உங்கள் தரவு பதிவேற்றப்பட்டு செயலாக்கப்படுகிறது",
  "Your data has been received.": "உங்கள் தரவு பெறப்பட்டது.",
  "Retrieving the available connections": "கிடைக்கும் இணைப்புகள் பெறப்படுகின்றன",
  "Connecting to the data source": "தரவு மூலத்துடன் இணைக்கப்படுகிறது",
  "The data source has been connected.": "தரவு மூலம் இணைக்கப்பட்டது.",
  "Opening the dataset": "தரவுத்தொகுப்பு திறக்கப்படுகிறது",
  "Processing your request on this dataset": "இந்தத் தரவுத்தொகுப்பில் உங்கள் கோரிக்கை செயலாக்கப்படுகிறது",
  "Updating the dataset": "தரவுத்தொகுப்பு புதுப்பிக்கப்படுகிறது",
  "The dataset has been updated.": "தரவுத்தொகுப்பு புதுப்பிக்கப்பட்டது.",
  "Removing the dataset": "தரவுத்தொகுப்பு நீக்கப்படுகிறது",
  "The dataset has been removed.": "தரவுத்தொகுப்பு நீக்கப்பட்டது.",
  "Preparing the response to your question": "உங்கள் கேள்விக்கான பதில் தயாரிக்கப்படுகிறது",
  "Preparing the briefing": "சுருக்கம் தயாரிக்கப்படுகிறது",
  "Recording your feedback": "உங்கள் கருத்து பதிவு செய்யப்படுகிறது",
  "Your feedback has been recorded.": "உங்கள் கருத்து பதிவு செய்யப்பட்டது.",
  "Retrieving the saved answers": "சேமித்த பதில்கள் பெறப்படுகின்றன",
  "Saving this answer": "இந்தப் பதில் சேமிக்கப்படுகிறது",
  "The answer has been saved.": "பதில் சேமிக்கப்பட்டது.",
  "Removing the saved answer": "சேமித்த பதில் நீக்கப்படுகிறது",
  "The saved answer has been removed.": "சேமித்த பதில் நீக்கப்பட்டது.",
  "Retrieving the earlier conversation": "முந்தைய உரையாடல் பெறப்படுகிறது",
  "Examining the map for your question": "உங்கள் கேள்விக்காக வரைபடம் ஆய்வு செய்யப்படுகிறது",
  "Preparing the analysis of this area": "இந்தப் பகுதியின் பகுப்பாய்வு தயாரிக்கப்படுகிறது",
  "Preparing the map export": "வரைபட ஏற்றுமதி தயாரிக்கப்படுகிறது",
  "The map export is ready.": "வரைபட ஏற்றுமதி தயார்.",
  "Forwarding the work to the departments": "பணி துறைகளுக்கு அனுப்பப்படுகிறது",
  "The work has been forwarded to the departments.": "பணி துறைகளுக்கு அனுப்பப்பட்டது.",
  "Loading the map layer": "வரைபட அடுக்கு ஏற்றப்படுகிறது",
  "Retrieving past rainfall records": "கடந்த மழைப் பதிவுகள் பெறப்படுகின்றன",
  "Retrieving the flood impact records": "வெள்ளப் பாதிப்புப் பதிவுகள் பெறப்படுகின்றன",
  "Calculating the areas affected": "பாதிக்கப்படும் பகுதிகள் கணக்கிடப்படுகின்றன",
  "Retrieving the rain and flood status": "மழை, வெள்ள நிலவரம் பெறப்படுகிறது",
  "Retrieving live traffic": "நேரடிப் போக்குவரத்து நிலவரம் பெறப்படுகிறது",
  "Preparing the rain response plan": "மழைக்கால நடவடிக்கைத் திட்டம் தயாரிக்கப்படுகிறது",
  "Calculating the route": "பாதை கணக்கிடப்படுகிறது",
  "Retrieving the assigned tasks": "ஒதுக்கப்பட்ட பணிகள் பெறப்படுகின்றன",
  "Forwarding the tasks to the departments": "பணிகள் துறைகளுக்கு அனுப்பப்படுகின்றன",
  "The tasks have been forwarded to the departments.": "பணிகள் துறைகளுக்கு அனுப்பப்பட்டன.",
  "Updating your department's dashboard": "உங்கள் துறையின் டாஷ்போர்டு புதுப்பிக்கப்படுகிறது",
  "Compiling your department's analysis": "உங்கள் துறையின் பகுப்பாய்வு தொகுக்கப்படுகிறது",
  "Retrieving the complaints": "புகார்கள் பெறப்படுகின்றன",
  "Retrieving the complaint record": "புகார் பதிவு பெறப்படுகிறது",
  "Recording your update": "உங்கள் தகவல் பதிவு செய்யப்படுகிறது",
  "Your update has been recorded.": "உங்கள் தகவல் பதிவு செய்யப்பட்டது.",
  "Submitting the completion report": "பணி நிறைவு அறிக்கை சமர்ப்பிக்கப்படுகிறது",
  "The completion report has been submitted.": "பணி நிறைவு அறிக்கை சமர்ப்பிக்கப்பட்டது.",
  "Submitting your complaint": "உங்கள் புகார் சமர்ப்பிக்கப்படுகிறது",
  "Your complaint has been registered.": "உங்கள் புகார் பதிவு செய்யப்பட்டது.",
  "Retrieving your complaints": "உங்கள் புகார்கள் பெறப்படுகின்றன",
  "Retrieving the complaint details": "புகார் விவரங்கள் பெறப்படுகின்றன",
  "Uploading the attachment": "இணைப்பு பதிவேற்றப்படுகிறது",
  "The attachment has been uploaded.": "இணைப்பு பதிவேற்றப்பட்டது.",
  "Retrieving the status of your complaint": "உங்கள் புகாரின் நிலை பெறப்படுகிறது",
  "Identifying the ward for this location": "இந்த இடத்திற்கான வார்டு கண்டறியப்படுகிறது",
  "Retrieving your profile": "உங்கள் சுயவிவரம் பெறப்படுகிறது",
  "Updating your profile": "உங்கள் சுயவிவரம் புதுப்பிக்கப்படுகிறது",
  "Your profile has been updated.": "உங்கள் சுயவிவரம் புதுப்பிக்கப்பட்டது.",
  "Uploading your photograph": "உங்கள் புகைப்படம் பதிவேற்றப்படுகிறது",
  "Your photograph has been updated.": "உங்கள் புகைப்படம் புதுப்பிக்கப்பட்டது.",
  "Retrieving the requested information": "கோரிய தகவல் பெறப்படுகிறது",
  "Processing your request": "உங்கள் கோரிக்கை செயலாக்கப்படுகிறது",
  "Your request has been completed.": "உங்கள் கோரிக்கை நிறைவேற்றப்பட்டது."
};

/** Every notice's words, for the test that nothing is left without Tamil. */
export function allNoticeTexts(): string[] {
  const out = new Set<string>();
  const add = (n: Notice | null) => { if (n?.doing) out.add(n.doing); if (n?.done) out.add(n.done); };
  for (const [, , n] of RULES) {
    if (typeof n === "function") for (const action of ["file", "read", "delete", "delete_page", "other"]) add(n({ action }));
    else add(n);
  }
  return [...out];
}
