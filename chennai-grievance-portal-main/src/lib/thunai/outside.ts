/**
 * Places that are not Greater Chennai: the other police commissionerates around it (Tambaram and Avadi, separate since 2022, and
 * the localities they police that the console's data does not cover), Tamil Nadu's other districts and commissionerates, the
 * states, and the large cities of India. A body named with one of these is that place's body, never ours. Reference data, checked
 * by spelling (one edit on long names); the district's own zones, wards and localities are never in it.
 */
const ONE = ["tambaram", "avadi", "pallavaram", "chromepet", "selaiyur", "medavakkam", "poonamallee", "tiruvallur", "thiruvallur", "chengalpattu", "chengai", "kanchipuram", "kancheepuram",
  "ariyalur", "coimbatore", "kovai", "cuddalore", "dharmapuri", "dindigul", "erode", "kallakurichi", "kanyakumari", "karur", "krishnagiri", "madurai", "mayiladuthurai", "nagapattinam",
  "namakkal", "nilgiris", "ooty", "perambalur", "pudukkottai", "ramanathapuram", "ranipet", "salem", "sivaganga", "tenkasi", "thanjavur", "theni", "thoothukudi", "tuticorin",
  "tiruchirappalli", "trichy", "tirunelveli", "tirupathur", "tiruppur", "tirupur", "tiruvannamalai", "tiruvarur", "vellore", "viluppuram", "villupuram", "virudhunagar", "hosur",
  "kerala", "karnataka", "andhra", "telangana", "maharashtra", "gujarat", "delhi", "punjab", "haryana", "bengal", "odisha", "orissa", "bihar", "rajasthan", "goa", "assam", "puducherry", "pondicherry",
  "mumbai", "bombay", "bangalore", "bengaluru", "hyderabad", "kolkata", "calcutta", "pune", "ahmedabad", "jaipur", "lucknow", "kochi", "cochin", "thiruvananthapuram", "trivandrum",
  "mysore", "mysuru", "visakhapatnam", "vizag", "nagpur", "patna", "bhopal", "indore", "thane", "surat", "noida", "gurgaon", "gurugram", "chandigarh", "kanpur", "varanasi", "agra",
  "tirupati", "nellore", "vijayawada", "mangalore", "mangaluru",
  "tiruchi", "thiruchi", "nellai", "thanjai",
  // other kinds of body, whatever the city: a word of theirs in front of "police" or "department" makes it theirs (BUG-030)
  "railway", "railways", "rpf", "grp", "cbi", "customs", "cisf", "crpf", "bsf", "nia", "army", "navy", "income"];
const TWO = ["tamil nadu", "andhra pradesh", "uttar pradesh", "madhya pradesh", "west bengal", "new delhi", "himachal pradesh"];
/** how a word is said back when the word alone does not name the body */
const SAID: Record<string, string> = { income: "income tax" };

/**
 * The same places in Tamil letters. By their whole name and its case endings, never a bare prefix: "சேலத்தில்" is Salem, "சேலை" (a saree) is not. Sound
 * alone does not reach the English list: திருச்சி reads as "tiruchchi" and பெங்களூரு as "pengalooru" (BUG-030).
 */
const TA: [string, string][] = [
  ["அரியலூர்", "ariyalur"], ["கடலூர்", "cuddalore"], ["தர்மபுரி", "dharmapuri"], ["திண்டுக்கல்", "dindigul"], ["ஈரோடு", "erode"], ["ஈரோட்டில்", "erode"], ["கள்ளக்குறிச்சி", "kallakurichi"],
  ["காஞ்சிபுரம்", "kanchipuram"], ["காஞ்சி", "kanchipuram"], ["கன்னியாகுமரி", "kanyakumari"], ["கரூர்", "karur"], ["கிருஷ்ணகிரி", "krishnagiri"], ["மதுரை", "madurai"], ["மயிலாடுதுறை", "mayiladuthurai"],
  ["நாகப்பட்டினம்", "nagapattinam"], ["நாகை", "nagapattinam"], ["நாமக்கல்", "namakkal"], ["நீலகிரி", "nilgiris"], ["ஊட்டி", "ooty"], ["பெரம்பலூர்", "perambalur"], ["புதுக்கோட்டை", "pudukkottai"],
  ["ராமநாதபுரம்", "ramanathapuram"], ["ராணிப்பேட்டை", "ranipet"], ["சேலம்", "salem"], ["சிவகங்கை", "sivaganga"], ["தென்காசி", "tenkasi"], ["தஞ்சாவூர்", "thanjavur"], ["தஞ்சை", "thanjavur"], ["தேனி", "theni"],
  ["தூத்துக்குடி", "thoothukudi"], ["திருச்சிராப்பள்ளி", "tiruchirappalli"], ["திருச்சி", "trichy"], ["திருநெல்வேலி", "tirunelveli"], ["நெல்லை", "tirunelveli"], ["திருப்பத்தூர்", "tirupathur"], ["திருப்பூர்", "tiruppur"],
  ["திருவண்ணாமலை", "tiruvannamalai"], ["திருவாரூர்", "tiruvarur"], ["வேலூர்", "vellore"], ["விழுப்புரம்", "viluppuram"], ["விருதுநகர்", "virudhunagar"], ["ஓசூர்", "hosur"], ["செங்கல்பட்டு", "chengalpattu"],
  ["திருவள்ளூர்", "tiruvallur"], ["பல்லாவரம்", "pallavaram"], ["குரோம்பேட்டை", "chromepet"], ["மேடவாக்கம்", "medavakkam"], ["பூந்தமல்லி", "poonamallee"], ["சேலையூர்", "selaiyur"],
  ["கேரளா", "kerala"], ["கர்நாடகா", "karnataka"], ["ஆந்திரா", "andhra"], ["தெலங்கானா", "telangana"], ["தெலுங்கானா", "telangana"], ["மகாராஷ்டிரா", "maharashtra"], ["குஜராத்", "gujarat"], ["டெல்லி", "delhi"], ["தில்லி", "delhi"],
  ["புதுச்சேரி", "puducherry"], ["பாண்டிச்சேரி", "pondicherry"], ["பம்பாய்", "bombay"], ["பெங்களூரு", "bengaluru"], ["பெங்களூர்", "bangalore"], ["ஹைதராபாத்", "hyderabad"], ["கொல்கத்தா", "kolkata"], ["புனே", "pune"],
  ["கொச்சி", "kochi"], ["திருவனந்தபுரம்", "thiruvananthapuram"], ["மைசூர்", "mysore"], ["தமிழ்நாடு", "tamil nadu"], ["தமிழ்நாட்டு", "tamil nadu"], ["தமிழக", "tamil nadu"],
  ["ரயில்வே", "railway"], ["இரயில்வே", "railway"], ["வருமான", "income"]
];
const TA_ENDS = /^(?:|ல|ல்|லே|லு|ில்|ில|ிலே|யில்|யில|யிலே|க்கு|கு|ுக்கு|யின்|ின்|யோட|ோட|ுடைய|யுடைய|யிலிருந்து|ிலிருந்து|லிருந்து|்|்ல|்ல்|ு|ம்|ம்ல|த்தில்|த்துல|த்து|த்தின்|த்துக்கு|த்தோட|த்திலிருந்து)$/;

/** A Tamil word that names a place or body outside Greater Chennai: its English name in the lists above, or null. */
export function taOutside(word: string): string | null {
  const w = word.replace(/[^\u0B80-\u0BFF]/g, "");
  for (const [ta, en] of TA) {
    const base = ta.replace(/ம்$/, "").replace(/்$/, "");
    if (w.startsWith(base) && TA_ENDS.test(w.slice(base.length))) return en;
  }
  return null;
}

const near1 = (a: string, b: string) => {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, e = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++e > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return e + (a.length - i) + (b.length - j) <= 1;
};

/** The first place outside Greater Chennai among these words, or null. */
export function outsideIn(ws: string[], twoOnly = false): string | null {
  const flat = ` ${ws.join(" ")} `;
  for (const t of TWO) if (flat.includes(` ${t} `)) return t;
  if (twoOnly) return null;
  for (const w of ws) for (const o of ONE) if (w === o || (o.length >= 7 && w.length >= 7 && near1(w, o))) return SAID[o] ?? o;
  return null;
}
