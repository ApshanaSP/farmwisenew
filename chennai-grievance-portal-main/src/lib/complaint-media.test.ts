import { describe, expect, it } from "vitest";
import { MEDIA_NAME_RE, isComplaintMediaPath, newMediaName, privateMediaName, sniffMedia } from "./complaint-media";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypisom"), Buffer.alloc(8)]);

describe("complaint media (SEC-002)", () => {
  it("recognises JPEG, PNG and MP4 by their first bytes", () => {
    expect(sniffMedia(JPEG)).toBe("jpg");
    expect(sniffMedia(PNG)).toBe("png");
    expect(sniffMedia(MP4)).toBe("mp4");
  });
  it("rejects text renamed to .jpg, HTML, SVG, GIF and empty files", () => {
    expect(sniffMedia(Buffer.from("just some text pretending to be a photo"))).toBeNull();
    expect(sniffMedia(Buffer.from("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(sniffMedia(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffMedia(Buffer.from("GIF89a\x01\x00\x01\x00"))).toBeNull();
    expect(sniffMedia(Buffer.alloc(0))).toBeNull();
  });
  it("names files so they match the route's pattern", () => {
    const n = newMediaName("png", new Date(2026, 9, 12));
    expect(n).toMatch(/^c-20261012-[a-f0-9]{16}\.png$/);
    expect(MEDIA_NAME_RE.test(n)).toBe(true);
  });
  it("accepts only upload-route paths for a complaint", () => {
    expect(isComplaintMediaPath("/api/complaints/media/c-20261012-0123456789abcdef.jpg")).toBe(true);
    expect(isComplaintMediaPath("/uploads/complaints/complaint-1759912345678-k3j9x2.png")).toBe(true);
    for (const bad of [
      "https://evil.example/x.jpg", "//evil.example/x.jpg", "/uploads/complaints/../../.env", "/api/complaints/media/../../.env",
      "/api/complaints/media/c-20261012-0123456789abcdef.html", "/uploads/profile/u1.jpg", "javascript:alert(1)", "C:\\Windows\\win.ini",
      "/api/complaints/media/c-20261012-0123456789abcdef.jpg?x=1", ""
    ]) expect(isComplaintMediaPath(bad)).toBe(false);
  });
  it("finds the stored name only behind a private URL", () => {
    expect(privateMediaName("/api/complaints/media/c-20261012-0123456789abcdef.mp4")).toBe("c-20261012-0123456789abcdef.mp4");
    expect(privateMediaName("/uploads/complaints/complaint-1759912345678-k3j9x2.png")).toBeNull();
    expect(privateMediaName(null)).toBeNull();
  });
});
