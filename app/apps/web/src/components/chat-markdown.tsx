"use client";

import { useMemo, memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { EntityLink, parseEntityHref } from "./entity-link";
import { CopyButton } from "./chat/copy-button";

interface ChatMarkdownProps {
  children: string;
}

/** Custom markdown renderer with rich entity links, polished typography, and copy support */
export const ChatMarkdown = memo(function ChatMarkdown({ children }: ChatMarkdownProps) {
  const components: Components = useMemo(() => ({
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

      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--color-accent)", textDecoration: "underline", textUnderlineOffset: "3px" }}
        >
          {linkChildren}
        </a>
      );
    },

    // ── Headers with proper hierarchy ──
    h2({ children }) {
      return (
        <h2
          className="mt-5 mb-2 text-[16px]"
          style={{ fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}
        >
          {children}
        </h2>
      );
    },
    h3({ children }) {
      return (
        <h3
          className="mt-4 mb-1.5 text-[14px]"
          style={{ fontWeight: 550, color: "var(--color-text-primary)" }}
        >
          {children}
        </h3>
      );
    },

    // ── Blockquotes as citation callouts ──
    blockquote({ children }) {
      return (
        <blockquote
          className="my-3 rounded-r-lg py-2 pl-4 pr-3"
          style={{
            borderLeft: "3px solid var(--color-accent)",
            background: "var(--color-accent-soft)",
            color: "var(--color-text-secondary)",
            fontSize: "14px",
          }}
        >
          {children}
        </blockquote>
      );
    },

    // ── Horizontal rules as subtle dividers ──
    hr() {
      return (
        <hr
          className="my-4"
          style={{
            border: "none",
            height: "1px",
            background: "linear-gradient(to right, transparent, var(--color-border-default), transparent)",
          }}
        />
      );
    },

    // ── Code blocks with copy button ──
    pre({ children }) {
      const codeText = extractCodeText(children);
      return (
        <div className="group relative my-3">
          <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
            <CopyButton text={codeText} />
          </div>
          <pre
            className="overflow-x-auto rounded-lg px-4 py-3 text-[13px] leading-[20px]"
            style={{
              background: "var(--color-bg-muted)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            {children}
          </pre>
        </div>
      );
    },
    code({ children, className }) {
      // Inline code (no className = no language = inline)
      if (!className) {
        return (
          <code
            className="rounded px-1.5 py-0.5 text-[13px]"
            style={{
              background: "var(--color-bg-muted)",
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            {children}
          </code>
        );
      }
      // Block code (inside pre, just pass through)
      return <code className={className}>{children}</code>;
    },

    // ── Bold with proper weight ──
    strong({ children }) {
      return <strong style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{children}</strong>;
    },

    // ── Tables (existing, polished) ──
    table({ children }) {
      return (
        <div
          className="my-3 max-w-full overflow-x-auto rounded-lg"
          style={{
            border: "0.667px solid var(--color-border-default)",
            background: "var(--color-bg-card)",
          }}
        >
          <table className="w-full text-[14px]" style={{ borderCollapse: "collapse", minWidth: 400 }}>
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
          className="px-4 py-2.5 text-left text-[13px] whitespace-nowrap"
          style={{
            color: "var(--color-text-tertiary)",
            fontWeight: 500,
            borderBottom: "0.667px solid var(--color-border-default)",
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
            borderBottom: "0.667px solid var(--color-border-default)",
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
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          {children}
        </tr>
      );
    },

    // ── Lists with better spacing ──
    ul({ children }) {
      return (
        <ul className="my-2 ml-1 space-y-1" style={{ listStyleType: "disc", paddingLeft: "1.25em" }}>
          {children}
        </ul>
      );
    },
    ol({ children }) {
      return (
        <ol className="my-2 ml-1 space-y-1" style={{ listStyleType: "decimal", paddingLeft: "1.25em" }}>
          {children}
        </ol>
      );
    },
    li({ children }) {
      return (
        <li className="text-[15px] leading-[22px]" style={{ color: "var(--color-text-primary)" }}>
          {children}
        </li>
      );
    },
  }), []);

  return (
    <ReactMarkdown components={components}>
      {children}
    </ReactMarkdown>
  );
});

/** Extract plain text from a code block's children for the copy button */
function extractCodeText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(extractCodeText).join("");
  if (children && typeof children === "object" && "props" in children) {
    return extractCodeText((children as React.ReactElement<{ children?: React.ReactNode }>).props.children);
  }
  return String(children ?? "");
}
