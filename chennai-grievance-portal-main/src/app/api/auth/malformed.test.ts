import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST as login } from "./login/route";
import { POST as register } from "./register/route";
import { POST as requestOtp } from "./forgot-password/request-otp/route";

// B-002 (FINAL TEST, 27 Oct 2026): an empty or broken JSON body made the sign-in API answer 500. It is a 400, before any
// database work, like any other invalid input.
const post = (body: string) => new NextRequest("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json" }, body });

describe("a malformed body is a 400, never a 500 (B-002)", () => {
  for (const [name, route] of [["login", login], ["register", register], ["forgot-password OTP", requestOtp]] as const)
    for (const body of ["", "{", "null"])
      it(`${name}: ${JSON.stringify(body)}`, async () => {
        const r = await route(post(body));
        expect(r.status).toBe(400);
        expect(await r.text()).not.toMatch(/SyntaxError|at \w+ \(/);
      });
});
