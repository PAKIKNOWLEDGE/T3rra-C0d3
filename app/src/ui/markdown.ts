/**
 * Minimal safe markdown → DOM. Builds element nodes only; never sets innerHTML from input.
 * Allowed: paragraphs, ATX headings, ul/li, fenced code, inline bold/italic/code.
 * Everything else is plain text (including raw HTML and links — no href injection).
 */

export const renderMarkdown = (source: string, doc: Document = document): DocumentFragment => {
  const root = doc.createDocumentFragment();
  const lines = source.replace(/\r\n?/g, "\n").split("\n");

  let paragraph: string[] = [];
  let list: HTMLUListElement | null = null;
  let code: { lang: string; lines: string[] } | null = null;

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    const p = doc.createElement("p");
    p.append(...inlineNodes(paragraph.join("\n"), doc));
    root.append(p);
    paragraph = [];
  };

  const flushList = (): void => {
    if (list === null) return;
    root.append(list);
    list = null;
  };

  const flushCode = (): void => {
    if (code === null) return;
    const pre = doc.createElement("pre");
    pre.className = "md-code";
    const el = doc.createElement("code");
    el.textContent = code.lines.join("\n");
    pre.append(el);
    root.append(pre);
    code = null;
  };

  const flushAll = (): void => {
    flushParagraph();
    flushList();
    flushCode();
  };

  for (const line of lines) {
    const fence = /^```(\S*)\s*$/.exec(line);
    if (fence !== null) {
      if (code === null) {
        flushParagraph();
        flushList();
        code = { lang: fence[1] ?? "", lines: [] };
      } else {
        flushCode();
      }
      continue;
    }
    if (code !== null) {
      code.lines.push(line);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading !== null) {
      flushParagraph();
      flushList();
      const level = heading[1]?.length ?? 1;
      const el = doc.createElement(`h${level}`);
      el.append(...inlineNodes(heading[2] ?? "", doc));
      root.append(el);
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet !== null) {
      flushParagraph();
      if (list === null) list = doc.createElement("ul");
      const li = doc.createElement("li");
      li.append(...inlineNodes(bullet[1] ?? "", doc));
      list.append(li);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushAll();
  if (root.childNodes.length === 0) {
    const p = doc.createElement("p");
    p.append(...inlineNodes(source, doc));
    root.append(p);
  }
  return root;
};

const inlineNodes = (text: string, doc: Document): (Text | HTMLElement)[] => {
  const out: (Text | HTMLElement)[] = [];
  // Order: code spans first, then bold, then italic — single pass with sticky regex.
  const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)/g;
  let last = 0;
  let match = pattern.exec(text);
  while (match !== null) {
    if (match.index > last) out.push(doc.createTextNode(text.slice(last, match.index)));
    const token = match[0];
    if (token.startsWith("`")) {
      const code = doc.createElement("code");
      code.className = "md-inline";
      code.textContent = token.slice(1, -1);
      out.push(code);
    } else if (token.startsWith("**")) {
      const strong = doc.createElement("strong");
      strong.textContent = token.slice(2, -2);
      out.push(strong);
    } else {
      const em = doc.createElement("em");
      em.textContent = token.slice(1, -1);
      out.push(em);
    }
    last = match.index + token.length;
    match = pattern.exec(text);
  }
  if (last < text.length) out.push(doc.createTextNode(text.slice(last)));
  return out;
};
