// src/lib/markdown.test.ts
//
// The markdown subset used for the release notes. Only the two pure parts
// are tested here -- turning the blocks into elements is a direct mapping
// with nothing to get wrong, while the scanning is where a changelog line
// can quietly come out mangled.

import { describe, it, expect } from "vitest";
import { parseInline, toBlocks } from "./markdown";
import { RELEASE_NOTES } from "./releaseNotes.generated";

describe("parseInline", () => {
  it("reads bold, italic and code", () => {
    expect(parseInline("a **b** c *d* e `f`")).toEqual([
      { text: "a " },
      { text: "b", mark: "strong" },
      { text: " c " },
      { text: "d", mark: "em" },
      { text: " e " },
      { text: "f", mark: "code" },
    ]);
  });

  it("leaves markup inside code alone", () => {
    // The notes quote code, and `**ptr` is a pointer, not bold.
    expect(parseInline("`a **b** c`")).toEqual([{ text: "a **b** c", mark: "code" }]);
  });

  it("passes plain text through untouched", () => {
    expect(parseInline("nothing to mark")).toEqual([{ text: "nothing to mark" }]);
  });

  it("keeps a lone asterisk as text", () => {
    expect(parseInline("2 * 3")).toEqual([{ text: "2 * 3" }]);
  });
});

describe("toBlocks", () => {
  it("separates headings, lists and paragraphs", () => {
    const blocks = toBlocks("### Titel\n\n- eins\n- zwei\n\nEin Absatz.");
    expect(blocks).toEqual([
      { kind: "heading", level: 3, text: "Titel" },
      { kind: "list", items: ["eins", "zwei"] },
      { kind: "paragraph", text: "Ein Absatz." },
    ]);
  });

  it("joins a list item that wraps across lines", () => {
    // The changelog is hard-wrapped at 78 columns, so most items do. A
    // continuation rendered as its own bullet is the visible failure.
    const blocks = toBlocks("- ein Punkt, der\n  über zwei Zeilen geht\n- der nächste");
    expect(blocks).toEqual([
      { kind: "list", items: ["ein Punkt, der über zwei Zeilen geht", "der nächste"] },
    ]);
  });

  it("joins a paragraph that wraps across lines", () => {
    expect(toBlocks("erste Zeile\nzweite Zeile")).toEqual([
      { kind: "paragraph", text: "erste Zeile zweite Zeile" },
    ]);
  });

  it("reads numbered items as list items", () => {
    expect(toBlocks("1. eins\n2. zwei")).toEqual([
      { kind: "list", items: ["eins", "zwei"] },
    ]);
  });

  it("renders every shipped release note without losing content", () => {
    // The real input, not a constructed one: if a changelog entry uses
    // something the scanner drops, this is where it shows.
    for (const note of RELEASE_NOTES) {
      const blocks = toBlocks(note.de);
      expect(blocks.length, `${note.version} produced no blocks`).toBeGreaterThan(0);

      const rendered = blocks
        .flatMap((b) =>
          b.kind === "list" ? b.items : [b.kind === "heading" ? b.text : b.text],
        )
        .join(" ");
      // Every non-markup word of the source has to survive somewhere.
      const words = note.de
        .replace(/[*`#>]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3);
      const missing = words.filter((w) => !rendered.includes(w));
      expect(missing, `${note.version} dropped: ${missing.slice(0, 5).join(", ")}`).toHaveLength(0);
    }
  });
});
