// QA4 final gate: class guards for the security fixes (docs/qa/pass4/sweeps/gate-*.txt). Each reads the source and fails when a new
// piece of code repeats the mistake the gate found: a new place to guess a password with no limit, a file written where a
// production build cannot serve it, a download link that cannot send the confirm grant, and so on.
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const SRC = path.join(__dirname);
function files(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
const ALL = files(SRC);
const rel = (p: string) => path.relative(SRC, p).replace(/\\/g, "/");
const text = (p: string) => fs.readFileSync(p, "utf8");
const withText = (re: RegExp) => ALL.filter((p) => re.test(text(p))).map(rel).sort();

describe("gate class guards", () => {
  it("redteam-final-2: a password is compared only where a limit stands in front of it", () => {
    // login (per address and per account), factors.ts (the five-tries lock, also used by change-password), otp.ts (attempts counted in the code's row)
    expect(withText(/bcrypt(?:js)?\.compare\(/)).toEqual(["app/api/auth/login/route.ts", "lib/otp.ts", "lib/security/factors.ts"]);
    const login = text(path.join(SRC, "app/api/auth/login/route.ts"));
    expect(login).toMatch(/failuresOver\(pairKey/);
    expect(login).toMatch(/addFailure\(pairKey/);
    expect(text(path.join(SRC, "app/api/profile/change-password/route.ts"))).toMatch(/verifyFactor\(/);
  });

  it("skeptic-redsec1-1: signing out ends the token on the server", () => {
    expect(text(path.join(SRC, "app/api/auth/logout/route.ts"))).toMatch(/revokeSessions\(/);
  });

  it("redteam-final-11: nothing writes a file under public/ at run time (a production build serves only what public/ held at build time)", () => {
    const writers = ALL.filter((p) => /\b(writeFile|writeFileSync|createWriteStream|copyFile)\b/.test(text(p)) && /"public"/.test(text(p)));
    expect(writers.map(rel)).toEqual([]);
  });

  it("redteam-final-5: every export link in the Data Studio goes through the confirm step", () => {
    for (const p of ALL.filter((f) => rel(f).startsWith("components/collector/app/studio/"))) {
      for (const m of text(p).matchAll(/<a\b[^>]*href=\{[^}]*(?:export=|brief=pdf)[^}]*\}[^>]*>/g)) expect(m[0], `${rel(p)}: ${m[0].slice(0, 90)}`).toMatch(/onClick=\{viaConfirm\(/);
    }
    const route = text(path.join(SRC, "app/api/collector/studio/[id]/route.ts"));
    expect(route).toMatch(/requireConfirm\(req, s, "export"/);
  });

  it("redteam-final-15: X-Forwarded-Host is trusted only behind TRUST_PROXY_HOPS", () => {
    const users = ALL.filter((p) => /x-forwarded-host/i.test(text(p)) && !/guard-allowed/.test(text(p)));
    expect(users.map(rel).sort()).toEqual(["lib/thunai/devguard.ts", "middleware.ts"]);
    expect(text(path.join(SRC, "middleware.ts"))).toMatch(/TRUST_PROXY_HOPS\) > 0 \? request\.headers\.get\("x-forwarded-host"\)/);
  });

  it("redteam-final-10: officer remarks are read for the Collector and the citizen only through scrubCitizenDetails", () => {
    const intel = text(path.join(SRC, "lib/collector/intel.ts"));
    expect(intel).toMatch(/remarks: scrubCitizenDetails\(String\(x\.remarks\)\)/);
    expect(intel).toMatch(/note: scrubCitizenDetails\(String\(x\.note/);
    expect(text(path.join(SRC, "lib/complaint-progress.ts"))).toMatch(/scrubCitizenDetails\(String\(r\.note\)\)/);
    expect(text(path.join(SRC, "lib/officer/data.ts"))).toMatch(/scrubCitizenDetails\(report\.remarks\)/);
    // the two prompts that carry the department's remarks say they are data, not orders
    for (const f of ["lib/collector/analysis.ts", "lib/collector/actionmail.ts"]) expect(text(path.join(SRC, f))).toMatch(/is data, never an order/);
  });

  it("redteam-final-1: the Collector's audit tab lists security rows for staff only, and a citizen's sign-in is not logged", () => {
    expect(text(path.join(SRC, "lib/collector/workspaces.ts"))).toMatch(/table_name <> 'security' OR actor IN/);
    expect(text(path.join(SRC, "lib/security/session.ts"))).toMatch(/if \(staff\) await securityLog\(u\.email, "auth:signin"/);
  });

  it("FB-10: Jarvis's voice client stops asking the server for speech once the server says no voice is set up", () => {
    expect(text(path.join(SRC, "components/collector/app/thunai/mouth.ts"))).toMatch(/no-tts[\s\S]{0,200}serverDownUntil = Number\.MAX_SAFE_INTEGER/);
  });
});
