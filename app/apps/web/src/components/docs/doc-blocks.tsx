import type { CSSProperties } from "react";
import type { DocBlock } from "@/lib/docs/types";
import { parseInline } from "@/lib/docs/inline";

/**
 * Renders doc content blocks on both surfaces:
 *
 * - tone="marketing": fixed light palette (gray-* classes) matching the
 *   landing page. Immune to the app's `.dark` class, which a signed-in
 *   user can carry onto the public site.
 * - tone="app": CSS-variable tokens, so the settings page follows the
 *   app theme (light and dark).
 *
 * Server component, no client JS. Inline emphasis is `**bold**` only,
 * parsed by lib/docs/inline.ts (text segments, never HTML).
 */

export type DocTone = "marketing" | "app";

interface ToneKit {
  h2: { className: string; style?: CSSProperties };
  h3: { className: string; style?: CSSProperties };
  p: { className: string; style?: CSSProperties };
  li: { className: string; style?: CSSProperties };
  strong: { style?: CSSProperties };
  marker: { style?: CSSProperties };
  callout: { className: string; style?: CSSProperties };
  calloutTitle: { className: string; style?: CSSProperties };
  example: { className: string; style?: CSSProperties };
  exampleTitle: { className: string; style?: CSSProperties };
  tableWrap: { className: string; style?: CSSProperties };
  th: { className: string; style?: CSSProperties };
  td: { className: string; style?: CSSProperties };
}

const TONES: Record<DocTone, ToneKit> = {
  marketing: {
    h2: { className: "mt-10 mb-3 text-[21px] font-semibold tracking-[-0.3px] text-gray-900" },
    h3: { className: "mt-7 mb-2 text-[16px] font-semibold text-gray-900" },
    p: { className: "mb-4 text-[15px] leading-[1.75] text-gray-600" },
    li: { className: "text-[15px] leading-[1.7] text-gray-600" },
    strong: { style: { color: "#111827", fontWeight: 600 } },
    marker: { style: { color: "#9CA3AF" } },
    callout: { className: "my-6 rounded-xl border border-gray-200 bg-gray-50 px-5 py-4" },
    calloutTitle: { className: "mb-1 text-[13px] font-semibold uppercase tracking-wide text-gray-700" },
    example: {
      className: "my-6 rounded-xl px-5 py-4",
      style: { background: "#F5F8FF", borderLeft: "3px solid #2C6BED" },
    },
    exampleTitle: { className: "mb-2 text-[13px] font-semibold uppercase tracking-wide", style: { color: "#2C6BED" } },
    tableWrap: { className: "my-5 overflow-x-auto rounded-xl border border-gray-200" },
    th: { className: "border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-left text-[12.5px] font-semibold text-gray-700" },
    td: { className: "border-b border-gray-100 px-4 py-2.5 align-top text-[13.5px] leading-[1.6] text-gray-600" },
  },
  app: {
    h2: {
      className: "mt-9 mb-3 text-[19px] font-semibold tracking-[-0.2px]",
      style: { color: "var(--color-text-primary)" },
    },
    h3: {
      className: "mt-6 mb-2 text-[15px] font-semibold",
      style: { color: "var(--color-text-primary)" },
    },
    p: {
      className: "mb-3.5 text-[13.5px] leading-[1.75]",
      style: { color: "var(--color-text-secondary)" },
    },
    li: {
      className: "text-[13.5px] leading-[1.7]",
      style: { color: "var(--color-text-secondary)" },
    },
    strong: { style: { color: "var(--color-text-primary)", fontWeight: 600 } },
    marker: { style: { color: "var(--color-text-tertiary)" } },
    callout: {
      className: "my-5 rounded-lg px-4 py-3.5",
      style: {
        background: "var(--color-bg-muted)",
        border: "1px solid var(--color-border-default)",
      },
    },
    calloutTitle: {
      className: "mb-1 text-[11px] font-semibold uppercase tracking-wider",
      style: { color: "var(--color-text-tertiary)" },
    },
    example: {
      className: "my-5 rounded-lg px-4 py-3.5",
      style: {
        background: "var(--color-accent-soft)",
        borderLeft: "3px solid var(--color-accent)",
      },
    },
    exampleTitle: {
      className: "mb-2 text-[11px] font-semibold uppercase tracking-wider",
      style: { color: "var(--color-accent)" },
    },
    tableWrap: {
      className: "my-4 overflow-x-auto rounded-lg",
      style: { border: "1px solid var(--color-border-default)" },
    },
    th: {
      className: "px-3.5 py-2 text-left text-[11.5px] font-semibold",
      style: {
        color: "var(--color-text-primary)",
        background: "var(--color-bg-muted)",
        borderBottom: "1px solid var(--color-border-default)",
      },
    },
    td: {
      className: "px-3.5 py-2 align-top text-[12.5px] leading-[1.6]",
      style: {
        color: "var(--color-text-secondary)",
        borderBottom: "1px solid var(--color-border-default)",
      },
    },
  },
};

function Inline({ text, tone }: { text: string; tone: DocTone }) {
  const kit = TONES[tone];
  return (
    <>
      {parseInline(text).map((seg, i) =>
        seg.bold ? (
          <strong key={i} style={kit.strong.style}>
            {seg.text}
          </strong>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}

export function DocBlocks({ blocks, tone }: { blocks: DocBlock[]; tone: DocTone }) {
  const kit = TONES[tone];
  return (
    <div>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "h2":
            return (
              <h2 key={i} className={kit.h2.className} style={kit.h2.style}>
                <Inline text={block.text} tone={tone} />
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} className={kit.h3.className} style={kit.h3.style}>
                <Inline text={block.text} tone={tone} />
              </h3>
            );
          case "p":
            return (
              <p key={i} className={kit.p.className} style={kit.p.style}>
                <Inline text={block.text} tone={tone} />
              </p>
            );
          case "ul":
          case "ol": {
            const ListTag = block.type === "ul" ? "ul" : "ol";
            return (
              <ListTag
                key={i}
                className={`mb-4 space-y-2 pl-5 ${block.type === "ul" ? "list-disc" : "list-decimal"}`}
              >
                {block.items.map((item, j) => (
                  <li key={j} className={kit.li.className} style={kit.li.style}>
                    <Inline text={item} tone={tone} />
                  </li>
                ))}
              </ListTag>
            );
          }
          case "callout":
            return (
              <div key={i} className={kit.callout.className} style={kit.callout.style}>
                {block.title && (
                  <div className={kit.calloutTitle.className} style={kit.calloutTitle.style}>
                    {block.title}
                  </div>
                )}
                <p className={`${kit.p.className} mb-0`} style={kit.p.style}>
                  <Inline text={block.text} tone={tone} />
                </p>
              </div>
            );
          case "example":
            return (
              <div key={i} className={kit.example.className} style={kit.example.style}>
                <div className={kit.exampleTitle.className} style={kit.exampleTitle.style}>
                  {block.title || "Example"}
                </div>
                {block.lines.map((line, j) => (
                  <p
                    key={j}
                    className={`${kit.p.className} ${j === block.lines.length - 1 ? "mb-0" : "mb-2"}`}
                    style={kit.p.style}
                  >
                    <Inline text={line} tone={tone} />
                  </p>
                ))}
              </div>
            );
          case "table":
            return (
              <div key={i} className={kit.tableWrap.className} style={kit.tableWrap.style}>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {block.headers.map((h, j) => (
                        <th key={j} className={kit.th.className} style={kit.th.style}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={j}>
                        {row.map((cell, k) => (
                          <td
                            key={k}
                            className={kit.td.className}
                            style={
                              j === block.rows.length - 1
                                ? { ...kit.td.style, borderBottom: "none" }
                                : kit.td.style
                            }
                          >
                            <Inline text={cell} tone={tone} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
