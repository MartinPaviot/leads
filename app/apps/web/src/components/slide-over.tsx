"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ExternalLink } from "lucide-react";

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  expandHref?: string;
  children: React.ReactNode;
}

export function SlideOver({ open, onClose, title, subtitle, expandHref, children }: SlideOverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.3)" }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 z-50 flex h-full flex-col"
        style={{
          width: "var(--detail-panel-width)",
          background: "var(--color-bg-elevated)",
          borderLeft: "0.5px solid var(--color-border-moderate)",
          borderTopLeftRadius: "10px",
          borderBottomLeftRadius: "10px",
          boxShadow: "var(--shadow-panel)",
          animation: "slideInRight 200ms ease-out",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "0.5px solid var(--color-border-default)" }}
        >
          <div className="min-w-0">
            <h2
              className="truncate text-[14px] font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {title}
            </h2>
            {subtitle && (
              <p
                className="mt-0.5 truncate text-[12px]"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {expandHref && (
              <a
                href={expandHref}
                className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                style={{ color: "var(--color-text-tertiary)" }}
                title="Open full page"
              >
                <ExternalLink size={14} />
              </a>
            )}
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-4 py-3">
          {children}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>,
    document.body
  );
}

/** A labeled property row for use inside SlideOver */
export function PropertyRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2" style={{ borderBottom: "0.5px solid var(--color-border-default)" }}>
      <span
        className="w-28 shrink-0 text-[12px]"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {label}
      </span>
      <span className="text-[12px]" style={{ color: "var(--color-text-primary)" }}>
        {value || "—"}
      </span>
    </div>
  );
}
