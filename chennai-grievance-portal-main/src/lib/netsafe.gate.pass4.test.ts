// QA4 gate fix: redteam-final-8. IPv6 forms that carry an IPv4 address are judged by that address.
import { describe, expect, it } from "vitest";
import { isPrivateIp } from "./netsafe";

describe("isPrivateIp on IPv6 forms that carry an IPv4 address", () => {
  it("redteam-final-8: SIIT, local-use NAT64, 6to4 and Teredo forms of private addresses are private", () => {
    expect(["::ffff:0:7f00:1", "::ffff:0:a00:1", "64:ff9b:1::7f00:1", "2002:7f00:1::", "2002:a00:1::", "2002:c0a8:101::", "2001:0:4136:e378:8000:63bf:3fff:fdd2"].map(isPrivateIp)).toEqual(Array(7).fill(true));
  });
  it("public addresses in the same forms stay public", () => {
    expect(["2002:808:808::", "::ffff:808:808", "64:ff9b::808:808", "2606:4700:4700::1111", "2001:4860:4860::8888"].map(isPrivateIp)).toEqual(Array(5).fill(false));
  });
});
