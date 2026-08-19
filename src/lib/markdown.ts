// src/lib/markdown.ts
//
// Just enough markdown to render the release notes.
//
// The changelog is the one place in this application where formatted
// prose arrives as text. A library would be 40 KB for headings, lists,
// bold and code -- the four things these notes actually use.
//
// This module only scans; src/components/ui/Markdown.tsx turns the result
// into elements. Nothing here produces HTML, so a stray angle bracket in a
// changelog entry stays a stray angle bracket.

/** One inline run: plain text, or text with one mark applied. */
export type Inline = { text: string; mark?: "strong" | "em" | "code" };

/**
 * Splits a line into runs of `**bold**`, `*italic*` and `` `code` ``.
 *
 * Code wins over the others, so a `**` inside backticks stays literal --
 * which matters here, where the notes quote code.
 */
export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(line)) !== null) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ text: m[1], mark: "code" });
    else if (m[2] !== undefined) out.push({ text: m[2], mark: "strong" });
    else out.push({ text: m[3], mark: "em" });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

/** A block as the line scanner sees it, before it becomes an element. */
export type Block =
  | { kind: "heading"; level: 3 | 4; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "paragraph"; text: string };

/**
 * Groups lines into blocks.
 *
 * A list item may wrap over several lines -- the changelog is hard-wrapped
 * at 78 columns, so most of them do. A continuation line is one that is
 * indented and does not itself start a new item.
 */
export function toBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split("\n");
  let paragraph: string[] = [];
  let list: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ kind: "list", items: list });
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{3,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        kind: "heading",
        level: heading[1].length === 3 ? 3 : 4,
        text: heading[2],
      });
      continue;
    }

    const item = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
    if (item) {
      flushParagraph();
      if (!list) list = [];
      list.push(item[1]);
      continue;
    }

    // Indented and inside a list: the wrapped remainder of the last item.
    if (list && /^\s+\S/.test(raw)) {
      list[list.length - 1] += ` ${line.trim()}`;
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return blocks;
}
