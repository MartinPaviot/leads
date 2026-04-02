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
        return <EntityLink type={entity.type} id={entity.id} name={name} />;
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
        <div className="my-2 overflow-auto rounded-md" style={{ border: "0.5px solid var(--color-border-moderate)" }}>
          <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
            {children}
          </table>
        </div>
      );
    },
    thead({ children }) {
      return (
        <thead style={{ background: "var(--color-bg-muted)" }}>
          {children}
        </thead>
      );
    },
    th({ children }) {
      return (
        <th
          className="px-3 py-2 text-left text-[12px] font-medium"
          style={{ color: "var(--color-text-tertiary)", borderBottom: "0.5px solid var(--color-border-moderate)" }}
        >
          {children}
        </th>
      );
    },
    td({ children }) {
      return (
        <td
          className="px-3 py-2"
          style={{ color: "var(--color-text-primary)", borderBottom: "0.5px solid var(--color-border-default)" }}
        >
          {children}
        </td>
      );
    },
  };

  return (
    <ReactMarkdown components={components}>
      {children}
    </ReactMarkdown>
  );
}
