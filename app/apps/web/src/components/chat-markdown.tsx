"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import { EntityLink, parseEntityHref } from "./entity-link";

interface ChatMarkdownProps {
  children: string;
}

/** Custom markdown renderer that converts CRM entity links into styled EntityLink badges */
export function ChatMarkdown({ children }: ChatMarkdownProps) {
  const components: Components = {
    a({ href, children: linkChildren }) {
      if (!href) return <span>{linkChildren}</span>;

      const entity = parseEntityHref(href);
      if (entity) {
        const name = typeof linkChildren === "string"
          ? linkChildren
          : Array.isArray(linkChildren)
            ? linkChildren.map(c => (typeof c === "string" ? c : "")).join("")
            : String(linkChildren ?? "");
        return <EntityLink type={entity.type} id={entity.id} name={name} domain={entity.domain} />;
      }

      // Non-entity links: render as regular links
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--color-accent)", textDecoration: "underline" }}
        >
          {linkChildren}
        </a>
      );
    },
    table({ children }) {
      return (
        <div
          className="my-3 overflow-auto rounded-lg"
          style={{
            border: "0.667px solid oklch(0 0 0 / 0.10)",
            background: "var(--color-bg-card)",
          }}
        >
          <table className="w-full text-[14px]" style={{ borderCollapse: "collapse" }}>
            {children}
          </table>
        </div>
      );
    },
    thead({ children }) {
      return <thead>{children}</thead>;
    },
    th({ children }) {
      return (
        <th
          className="px-4 py-2.5 text-left text-[13px]"
          style={{
            color: "oklch(0 0 0 / 0.45)",
            fontWeight: 450,
            borderBottom: "0.667px solid oklch(0 0 0 / 0.08)",
          }}
        >
          {children}
        </th>
      );
    },
    td({ children }) {
      return (
        <td
          className="px-4 py-2.5"
          style={{
            color: "var(--color-text-primary)",
            fontWeight: 425,
            borderBottom: "0.667px solid oklch(0 0 0 / 0.05)",
          }}
        >
          {children}
        </td>
      );
    },
    tr({ children }) {
      return (
        <tr
          className="transition-colors"
          style={{ cursor: "default" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "oklch(0 0 0 / 0.02)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          {children}
        </tr>
      );
    },
  };

  return (
    <ReactMarkdown components={components}>
      {children}
    </ReactMarkdown>
  );
}
