/**
 * Ask the Map's follow-up words: the sentences that edit the answer on the map ("only severe", "make it 500 m", "why these?", "plan my
 * visits", "send these to SWD") and the distance a sentence says. Moved here from route.ts (v10, docs/jarvis/v10-research/50-askmap-anatomy.md
 * 3.2) so the server's rules (route.ts) and Jarvis's browser lanes (lib/thunai/v10/map10.ts) read them the same way: route.ts reaches the
 * gazetteer and the store, which the browser must never import. Pure: no imports.
 */

/** A distance in metres said in the question: "300 m", "300 meters", "1.5 km", "half a km", "300 மீட்டர்", "அரை கிலோமீட்டர்". */
export function distanceOf(text: string): number | null {
  const t = text.toLowerCase();
  if (/\bhalf\s+(a\s+)?(km|kilomet(er|re))\b|அரை\s*(கி\.?\s*மீ|கிலோ)/.test(t)) return 500;
  if (/\bquarter\s+(of\s+)?(a\s+)?(km|kilomet(er|re))\b/.test(t)) return 250;
  if (/\b(a|one)\s+(km|kilomet(er|re))\b|ஒரு\s*(கி\.?\s*மீ|கிலோமீட்டர்)/.test(t)) return 1000;
  const km = t.match(/(\d+(?:\.\d+)?)\s*(km|kms|kilomet(?:er|re)s?|கி\.?\s*மீ|கிலோமீட்டர்)/);
  if (km) return Math.round(Number(km[1]) * 1000);
  const m = t.match(/(\d+(?:\.\d+)?)\s*(m|mtr|mtrs|meters?|metres?|மீட்டர்|மீ)(?![a-z஀-௿])/);
  if (m) return Math.round(Number(m[1]));
  return null;
}

export const COUNT_BY: [RegExp, "ward" | "zone" | "taluk"][] = [
  [/\b(by|per|each|every|across)\s+wards?\b|\bward[- ]?wise\b|வார்டு\s*வாரி|வார்டுவாரி|ward\s*wise/i, "ward"],
  [/\b(by|per|each|every|across)\s+zones?\b|\bzone[- ]?wise\b|மண்டல\s*வாரி|zone\s*wise/i, "zone"],
  [/\b(by|per|each|every|across)\s+taluks?\b|\btaluk[- ]?wise\b|வட்ட\s*வாரி/i, "taluk"]
];

export const EDIT_SEVERE = /^\s*(only|just)\s+(severe|serious|critical)(\s+ones?)?\s*$|^\s*(severe|serious)\s+only\s*$|கடுமையான(வை|வற்றை)?\s*மட்டும்|severe mattum|severe-a mattum/i;
export const EDIT_ALL_SEV = /^\s*(all|any)\s+severit(y|ies)\s*$|^\s*(include|with)\s+(all|every)\s+severit/i;
export const EDIT_RADIUS = /^\s*(make it|change (it )?to|increase (it )?to|reduce (it )?to|within|expand to|widen to|narrow to|use|try|set)?\s*(\d+(\.\d+)?\s*(m|km|meters?|metres?|kms?|மீட்டர்|கி\.?\s*மீ)|half a km|a km|one km)\s*(instead|radius|please|only)?\s*$|(\d+)\s*(மீட்டர்|கி\.?மீ)\s*(ஆக|க்குள்)?\s*(மாற்று|வை)?\s*$/i;
export const EDIT_ADD = /^\s*(add|also|plus|and|include|with)\s+(.+)$|(.+?)(களையும்|யும்)\s*சேர்/i;
export const EDIT_REMOVE = /^\s*(remove|drop|without|exclude|not)\s+(.+)$|(.+?)\s*நீக்கு/i;
export const EDIT_COMPARE = /^\s*(compare|vs\.?|versus)\s+(it\s+)?(with|to|against)?\s*(.+)$|(.+?)\s*(உடன்|ஓடு)\s*ஒப்பிடு/i;
export const EDIT_TRACE = /^\s*(why( these| this| those)?|how (did you|was this) (get|work|worked) (this|that|it)( out)?|show (the )?(method|working|steps)|explain( this)?)\s*\??\s*$|ஏன் இவை|எப்படி கணக்கிட/i;
export const EDIT_SEND = /\b(send|forward|assign|escalate)\b.*\b(to|these|them|this)\b|அனுப்பு/i;
export const EDIT_CLEAR = /^\s*(start over|clear( it| all| the map)?|reset|new question|forget (it|that)|clear map)\s*$|மீண்டும் தொடங்கு|அழி/i;
/** "plan my visits today", "visit order", "route my visits": the officer's visit order for the current answer */
export const VISITS = /\b(plan|order|route|sequence)\s+(my|the|today'?s)?\s*(site\s+)?visits?\b|\bvisit\s+(order|plan|route)\b|என் வருகை|visit plan pannu/i;
export const EDIT_EXPORT = /^\s*(export|download)(\s+(these|them|this|it|csv|geojson|the list))*\s*$|பதிவிறக்கு/i;
export const EDIT_NEWS = /^\s*(only|just)?\s*(the\s+)?(ones\s+)?(that\s+were\s+)?((in|from)\s+(the\s+)?)?(news|newspapers?|papers?|press|media)(\s+(ones|only|reports?))?\s*$|^\s*(only|just)?\s*(news|media)[- ]reported(\s+ones)?\s*$|செய்தி(களில்|யில்)?\s*(வந்த(வை)?)?\s*மட்டும்|^\s*news\s*(la)?\s*(vandhadhu|vandhathu)?\s*mattum\s*$/i;
export const EDIT_NOT_NEWS = /^\s*(all|any)\s+sources?\s*$|^\s*(not only|not just)\s+(the\s+)?news\s*$|^\s*include\s+(all|everything|non-news)\s*$/i;
export const EDIT_OPEN = /^\s*(only )?open( ones| only)?\s*$|^\s*include closed\s*$|^\s*(all|any) status(es)?\s*$|^\s*closed( ones| only)?\s*$/i;
export const EDIT_OVERDUE = /^\s*(show\s+)?(me\s+)?(only\s+|just\s+)?(the\s+)?(overdue|past[- ]deadline|delayed|late|breached)(\s+(ones|cases|only|complaints|incidents))?\s*\??\s*$|^\s*how many (are|of them are|of these are)\s+(overdue|past[- ]deadline|late|delayed)\s*\??\s*$|காலக்கெடு\s*(தாண்டிய|கடந்த)(வை)?\s*(மட்டும்)?\s*$|overdue\s*(mattum)?\s*$/i;
export const EDIT_DEPTS = /^\s*(which|what)\s+(department|dept|departments|office)s?\b|\b(by|per)\s+department\b|\bdepartment[- ]?wise\b|^\s*(who|which team)\s+(has|holds|handles|owns)\b|எந்த\s*துறை|துறை\s*வாரி|endha department/i;
export const EDIT_WHICH_AREA = /^\s*(which|what)\s+(zone|ward|taluk)s?\b|எந்த\s*(மண்டல|வார்டு|வட்ட)/i;

/** Words that make a short question lean on the last answer ("and thefts?", "what about Velachery", "same for flooding"). */
export const FOLLOW = /^\s*(and|also|plus|now|then|so|what about|how about|same|for|in|at|on|near|around|only|just|but|make it|change (it )?to|instead|அப்போ|அதே)\b|\b(there|same|instead|too|as well|those|them|these)\b|அங்கே|அங்கு|அதே|அவற்றில்/i;
export const THERE = /\b(there|same area|same place|that area|in it|nearby there)\b|அங்கே|அங்கு|அதே இடத்தில்|anga\b/i;
