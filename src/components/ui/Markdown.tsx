// src/components/ui/Markdown.tsx
//
// Renders the block list from lib/markdown.ts.
//
// Split from the scanner because exporting plain functions beside a
// component breaks Fast Refresh -- and because scanning text and drawing
// it are two different jobs.

import { type ReactNode } from "react";
import { parseInline, toBlocks } from "../../lib/markdown";

function renderInline(line: string, keyPrefix: string): ReactNode[] {
  return parseInline(line).map((run, i) => {
    const key = `${keyPrefix}-${i}`;
    if (run.mark === "code") {
      return (
        <code
          key={key}
          className="rounded-sm bg-surface-sunken px-1 py-0.5 font-mono text-2xs text-primary"
        >
          {run.text}
        </code>
      );
    }
    if (run.mark === "strong") {
      return (
        <strong key={key} className="font-semibold text-primary">
          {run.text}
        </strong>
      );
    }
    if (run.mark === "em") {
      return (
        <em key={key} className="italic">
          {run.text}
        </em>
      );
    }
    return <span key={key}>{run.text}</span>;
  });
}

/**
 * Renders a subset of markdown: `###`/`####` headings, bullet and numbered
 * lists, `**bold**`, `*italic*` and `` `code` ``. Anything else is shown as
 * the plain text it is -- which is the right failure for a changelog.
 */
export default function Markdown({ source }: { source: string }) {
  const blocks = toBlocks(source);

  return (
    <div className="flex flex-col gap-3 text-sm text-secondary">
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          const Tag = block.level === 3 ? "h3" : "h4";
          return (
            <Tag
              key={i}
              className={
                block.level === 3
                  ? "mt-2 text-2xs font-semibold uppercase tracking-wide text-muted"
                  : "mt-1 text-sm font-semibold text-primary"
              }
            >
              {renderInline(block.text, `h${i}`)}
            </Tag>
          );
        }
        if (block.kind === "list") {
          return (
            <ul key={i} className="flex list-disc flex-col gap-1.5 pl-5">
              {block.items.map((item, j) => (
                <li key={j} className="leading-relaxed">
                  {renderInline(item, `l${i}-${j}`)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="leading-relaxed">
            {renderInline(block.text, `p${i}`)}
          </p>
        );
      })}
    </div>
  );
}
