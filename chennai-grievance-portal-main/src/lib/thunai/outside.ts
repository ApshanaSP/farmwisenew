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
  "tirupati", "nellore", "vijayawada", "mangalore", "mangaluru"];
const TWO = ["tamil nadu", "andhra pradesh", "uttar pradesh", "madhya pradesh", "west bengal", "new delhi", "himachal pradesh"];

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
  for (const w of ws) for (const o of ONE) if (w === o || (o.length >= 7 && w.length >= 7 && near1(w, o))) return o;
  return null;
}
