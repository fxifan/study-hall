import type { ReactNode } from "react";

/**
 * Renders the light markdown used in content/legal: "## " headings, "- " list items, and
 * blank-line-separated paragraphs. "[Owner to …]" notes are highlighted so drafts can't hide them.
 */
export function LegalBody({ body }: { body: string }) {
  const blocks = body.trim().split(/\n\s*\n/);
  return (
    <div className="flex flex-col gap-4 leading-relaxed">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines[0].startsWith("## ")) {
          return (
            <h2 key={i} className="mt-4 text-xl font-medium">
              {lines[0].slice(3)}
            </h2>
          );
        }
        if (lines.every((l) => l.startsWith("- "))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-6">
              {lines.map((l, j) => (
                <li key={j}>{highlightNotes(l.slice(2))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{highlightNotes(lines.join(" "))}</p>;
      })}
    </div>
  );
}

function highlightNotes(text: string): ReactNode {
  return text.split(/(\[Owner to [^\]]+\])/).map((part, i) =>
    part.startsWith("[Owner to ") ? (
      <mark key={i} className="rounded-sm border border-dashed border-pen bg-transparent px-1 font-mono text-sm text-pen">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
