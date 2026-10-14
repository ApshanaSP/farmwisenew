import { describe, expect, it } from "vitest";
import { mdToHtml } from "./markdown";

describe("mdToHtml", () => {
  it("leaves underscores inside words alone", () => {
    expect(mdToHtml("Filtered on is_open and zone_no")).toBe("<p>Filtered on is_open and zone_no</p>");
    expect(mdToHtml("see INC_2026_A and file_name_here")).toBe("<p>see INC_2026_A and file_name_here</p>");
  });
  it("still renders _italics_, **bold** and `code`", () => {
    expect(mdToHtml("an _unconfirmed_ report, **95** deaths in `news`")).toBe("<p>an <i>unconfirmed</i> report, <b>95</b> deaths in <code>news</code></p>");
    expect(mdToHtml("_whole line_")).toBe("<p><i>whole line</i></p>");
  });
  it("escapes HTML before formatting", () => {
    expect(mdToHtml("<img src=x onerror=alert(1)> _x_")).toBe("<p>&lt;img src=x onerror=alert(1)&gt; <i>x</i></p>");
  });
  it("renders headings and lists", () => {
    expect(mdToHtml("# Title\n- a\n- b\n1. c")).toBe("<h3>Title</h3><ul><li>a</li><li>b</li></ul><ol><li>c</li></ol>");
  });
});
