// citizenB sets a 1x1 PNG profile photo; then the photo URL is fetched with no sign-in. Prints the path shape only.
import { call, base } from "../../lib/live.mjs";
const ref = { headers: { referer: "http://127.0.0.1:3106/profile" } };
const before = JSON.parse((await call(3106, "citizenB", "GET", "/api/profile", ref)).text).profile?.profilePhoto ?? null;
console.log("photo before:", before ? before.replace(/\d{6,}/g, "<n>") : null);
const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
const fd = new FormData(); fd.append("photo", new Blob([png], { type: "image/png" }), "p.png");
const { signIn } = await import("../../lib/live.mjs");
const cookie = await signIn(3106, "citizenB");
const r = await fetch(base(3106) + "/api/profile/photo", { method: "POST", headers: { cookie, origin: base(3106), referer: base(3106) + "/profile" }, body: fd });
const j = await r.json(); console.log("upload", r.status, j.profilePhoto ? j.profilePhoto.replace(/-(\d+)-(\d+)\./, (m, u, t) => `-<user ${u}>-<ms ${t.slice(0, 4)}…>.`) : j);
if (j.profilePhoto) {
  const a = await fetch(base(3106) + j.profilePhoto, { redirect: "manual" });
  console.log("anonymous GET of the photo:", a.status, a.headers.get("content-type"), (await a.arrayBuffer()).byteLength, "bytes");
}
