import { describe, expect, it } from "vitest";
import { checkHost } from "./fetchurl";

// FINAL TEST L3 (SSRF): a pasted link may never reach this machine, a private network or the cloud metadata service
describe("Studio links refuse internal addresses (L3 SSRF)", () => {
  it.each([
    "http://127.0.0.1:3005/api/collector/overview", "http://localhost/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/",
    "http://10.0.0.5/data.csv", "http://192.168.1.10/data.csv", "http://172.16.0.1/", "http://0.0.0.0:3005/", "http://2130706433/"
  ])("%s is refused", async (u) => {
    await expect(checkHost(new URL(u))).rejects.toThrow(/private network|cannot be read|not/i);
  });
  it.each(["file:///C:/Windows/win.ini", "ftp://example.com/x.csv", "gopher://example.com/"])("%s is refused (scheme)", async (u) => {
    await expect(checkHost(new URL(u))).rejects.toThrow(/Only http and https/);
  });
  it("a user name in the link is refused", async () => {
    await expect(checkHost(new URL("https://admin:pw@data.gov.in/x.csv"))).rejects.toThrow(/sign-in fields/);
  });
});
