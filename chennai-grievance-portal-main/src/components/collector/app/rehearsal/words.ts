/** Rain Rehearsal's labels in English and Tamil (plain words; numbers are added by the caller). */
export type Lang = "en" | "ta";
const W = {
  title: ["Rain rehearsal", "மழை ஒத்திகை"],
  notForecast: ["Based on where it flooded in past rains. Not a forecast.", "கடந்த மழைகளில் வெள்ளம் வந்த இடங்களின் அடிப்படையில். இது முன்னறிவிப்பு அல்ல."],
  likely: ["Likely flood streets", "வெள்ளம் வரக்கூடிய தெருக்கள்"],
  possible: ["May flood", "வெள்ளம் வரலாம்"],
  chokes: ["Open drain complaints on them", "அவற்றில் திறந்த வடிகால் புகார்கள்"],
  reach: ["Hospitals losing reach", "சென்றடைவு குறையும் மருத்துவமனைகள்"],
  wards: ["Wards losing quick fire help", "விரைவு தீயணைப்பு உதவி இழக்கும் வார்டுகள்"],
  dry: ["Dry schools (possible relief centres)", "உலர்ந்த பள்ளிகள் (நிவாரண மையங்கள்)"],
  first: ["What to do first", "முதலில் செய்ய வேண்டியவை"],
  send: ["Send tasks", "பணிகளை அனுப்பு"],
  ready: ["Ready", "தயார்"],
  warn: ["Warn", "எச்சரிக்கை"],
  act: ["Act", "செயல்"],
  rain: ["Rain", "மழை"],
  check: ["Check", "சரிபார்"],
  learn: ["Learn", "கற்றல்"],
  method: ["How this was worked out", "இது எப்படிக் கணக்கிடப்பட்டது"],
  replay: ["Replay a rain", "ஒரு மழையை மீண்டும் காட்டு"],
  live: ["Now", "இப்போது"]
} as const;
export type Word = keyof typeof W;
export const w = (k: Word, lang: Lang) => W[k][lang === "ta" ? 1 : 0];
