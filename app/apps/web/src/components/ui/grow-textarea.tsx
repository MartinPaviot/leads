"use client";

/**
 * Auto-growing single-to-multi-line input — the obvious chat-bar behaviour:
 * starts at one line and grows in height as the user types so they always see
 * the full text they entered, up to `maxHeight` then scrolls. Enter submits,
 * Shift+Enter inserts a newline (standard composer convention).
 *
 * Controlled: pass `value` + `onChange`; it re-measures on every value change
 * (typing, or programmatic fills like clicking an example).
 */

import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef } from "react";

interface GrowTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> {
  /** Max height in px before it scrolls. Default 168 (~7 lines). */
  maxHeight?: number;
  /** Fired on Enter without Shift. */
  onSubmit?: () => void;
}

export const GrowTextarea = forwardRef<HTMLTextAreaElement, GrowTextareaProps>(
  ({ maxHeight = 168, onSubmit, className = "", style, onInput, onKeyDown, ...props }, ref) => {
    const innerRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

    const resize = useCallback(() => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = "auto";
      const next = Math.min(el.scrollHeight, maxHeight);
      el.style.height = `${next}px`;
      el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
    }, [maxHeight]);

    // Re-measure on mount and on every controlled value change.
    useLayoutEffect(() => {
      resize();
    }, [resize, props.value]);

    return (
      <textarea
        ref={innerRef}
        rows={1}
        className={`w-full resize-none rounded-lg px-3 py-2 text-[13px] leading-relaxed outline-none transition-colors ${className}`}
        style={{ maxHeight, ...style }}
        onInput={(e) => {
          resize();
          onInput?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && onSubmit) {
            e.preventDefault();
            onSubmit();
          }
          onKeyDown?.(e);
        }}
        {...props}
      />
    );
  },
);
GrowTextarea.displayName = "GrowTextarea";
