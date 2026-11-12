// Is a mobile number registered to any account? citizenB asks the mobile-OTP route about citizenA's number and about a random one.
// Never prints a number: citizenA's is read in this script only.
import { call } from "../../lib/live.mjs";
const ref = { headers: { referer: "http://127.0.0.1:3106/profile" } };
const a = JSON.parse((await call(3106, "citizenA", "GET", "/api/profile", ref)).text).profile;
const theirs = String(a.mobileNumber).replace(/\D/g, "").slice(-10);
const random = "9" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
for (const [label, n] of [["citizenA's number", theirs], ["a random number", random]]) {
  const r = await call(3106, "citizenB", "POST", "/api/profile/mobile-otp/request", { ...ref, body: { mobileNumber: n } });
  console.log(label, "->", r.status, r.text.slice(0, 120));
}
