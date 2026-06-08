"use client";

import { useEffect, useCallback } from "react";
import { X } from "lucide-react";

type ModalSize = "sm" | "md" | "lg";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: ModalSize;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const sizeWidths: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export function Modal({ open, onClose, title, size = "md", children, footer }: ModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleEscape);
        document.body.style.overflow = "";
      };
    }
  }, [open, handleEscape]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: "var(--color-bg-modal-overlay)",
          animation: "overlay-fade-in 200ms ease-out",
        }}
        onClick={onClose}
      />

      {/* Modal — capped to the viewport (minus the p-4 gutter) and a flex
          column so the BODY scrolls internally while the header + footer stay
          pinned. This is what keeps tall modals from sticking out past the
          screen with an unreachable submit button. */}
      <div
        className={`relative flex max-h-[calc(100vh-2rem)] w-full ${sizeWidths[size]} flex-col overflow-hidden rounded-xl`}
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          boxShadow: "var(--shadow-dialog)",
          animation: "modal-fade-in 200ms ease-out",
        }}
      >
        {/* Header */}
        {title && (
          <div
            className="flex shrink-0 items-center justify-between px-5 py-3.5"
            style={{ borderBottom: "1px solid var(--color-border-default)" }}
          >
            <h2 className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {title}
            </h2>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
              style={{ color: "var(--color-text-tertiary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Body — the only scroll region when content is tall */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {/* Footer */}
        {footer && (
          <div
            className="flex shrink-0 items-center justify-end gap-2 px-5 py-3"
            style={{ borderTop: "1px solid var(--color-border-default)" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
