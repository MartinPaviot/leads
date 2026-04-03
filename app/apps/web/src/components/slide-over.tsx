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
  avatar?: { initials: string; bg: string; color: string };
  children: React.ReactNode;
}

export function SlideOver({ open, onClose, title, subtitle, expandHref, avatar, children }: SlideOverProps) {
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
        style={{ background: "var(--color-bg-modal-overlay)", animation: "overlay-fade-in 200ms ease-out" }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="slide-in-right fixed right-0 top-0 z-50 flex h-full flex-col"
        style={{
          width: "var(--detail-panel-width)",
          background: "var(--color-bg-card)",
          borderLeft: "1px solid var(--color-border-default)",
          borderTopLeftRadius: "10px",
          borderBottomLeftRadius: "10px",
          boxShadow: "var(--shadow-panel)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--color-border-default)" }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            {avatar && (
              <span
                className="flex shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
                style={{
                  width: 32,
                  height: 32,
                  background: avatar.bg,
                  color: avatar.color,
                  border: `1px solid ${avatar.color}20`,
                }}
              >
                {avatar.initials}
              </span>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {title}
              </h2>
              {subtitle && (
                <p className="mt-0.5 truncate text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {expandHref && (
              <a
                href={expandHref}
                className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                style={{ color: "var(--color-text-tertiary)" }}
                title="Open full page"
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <ExternalLink size={14} />
              </a>
            )}
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
              style={{ color: "var(--color-text-tertiary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
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
    </>,
    document.body
  );
}

export function PropertyRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
      <span className="w-28 shrink-0 text-[12px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>
        {label}
      </span>
      <span className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>
        {value || "\u2014"}
      </span>
    </div>
  );
}
