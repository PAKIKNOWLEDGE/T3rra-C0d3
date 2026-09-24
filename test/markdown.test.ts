import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../app/src/ui/markdown.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
const doc = dom.window.document;

const html = (source: string): string => {
  const host = doc.createElement("div");
  host.append(renderMarkdown(source, doc));
  return host.innerHTML;
};

const text = (source: string): string => {
  const host = doc.createElement("div");
  host.append(renderMarkdown(source, doc));
  return host.textContent ?? "";
};

describe("safe markdown", () => {
  it("renders paragraphs and never injects HTML", () => {
    const host = doc.createElement("div");
    host.append(renderMarkdown("<img src=x onerror=alert(1)> and **bold**", doc));
    // Safe: no element nodes were created from the input tags — only text + strong.
    const tags = [...host.querySelectorAll("*")].map((el) => el.tagName.toLowerCase());
    expect(tags).not.toContain("img");
    expect(tags).toContain("strong");
    expect(host.querySelector("strong")?.textContent).toBe("bold");
    expect(host.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(host.innerHTML).toContain("&lt;img");
  });

  it("keeps code fences as text", () => {
    const out = html("```js\n<script>alert(1)</script>\n```");
    expect(out).toContain("<pre");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("renders headings, lists, italic and inline code", () => {
    const out = html("# Title\n- one\n- two\n\nrun `npm` with *care*");
    expect(out).toContain("<h1>Title</h1>");
    expect(out).toContain("<li>one</li>");
    expect(out).toContain("<li>two</li>");
    expect(out).toContain('<code class="md-inline">npm</code>');
    expect(out).toContain("<em>care</em>");
  });

  it("does not turn bare URLs into anchors", () => {
    const out = html("see https://example.com/x");
    expect(out).not.toContain("<a");
    expect(text("see https://example.com/x")).toContain("https://example.com/x");
  });

  it("handles empty input without throwing", () => {
    expect(text("")).toBe("");
  });
});
