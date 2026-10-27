import { describe, expect, it } from "vitest";
import { mdToHtml } from "./markdown";

// FINAL TEST L3: text from complaints, news and answers is shown through mdToHtml; markup in it must stay inert
describe("markdown output is safe (L3 XSS)", () => {
  for (const evil of ['<img src=x onerror=alert(1)>', '<script>alert(1)</script>', '[click](javascript:alert(1))', '**<svg onload=alert(1)>**',
    'அடையாறு <iframe src="https://evil.example"></iframe>', '<a href="javascript:alert(1)">x</a>'])
    it(evil, () => {
      const html = mdToHtml(evil);
      expect(html).not.toMatch(/<(img|script|svg|iframe)\b/i);
      // a real tag with an event handler, or a real link to javascript: (escaped text such as &lt;a href=… is inert)
      expect(html).not.toMatch(/<[a-z][^>]*\son\w+\s*=/i);
      expect(html).not.toMatch(/<a\b[^>]*href\s*=\s*["']?\s*javascript:/i);
    });
});
