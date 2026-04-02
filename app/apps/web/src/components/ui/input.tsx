"use client";

import { forwardRef, useRef, useEffect } from "react";

/* ── Text Input ── */
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", style, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`h-8 rounded-md px-3 text-[13px] outline-none transition-colors ${className}`}
          style={{
            background: "var(--color-bg-card)",
            color: "var(--color-text-primary)",
            border: `1px solid ${error ? "var(--color-error)" : "var(--color-border-default)"}`,
            ...style,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = error ? "var(--color-error)" : "var(--color-border-focus)";
            e.currentTarget.style.boxShadow = `0 0 0 2px ${error ? "var(--color-error-soft)" : "rgba(44, 107, 237, 0.15)"}`;
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = error ? "var(--color-error)" : "var(--color-border-default)";
            e.currentTarget.style.boxShadow = "none";
          }}
          {...props}
        />
        {error && (
          <span className="text-[12px]" style={{ color: "var(--color-error)" }}>{error}</span>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

/* ── Textarea ── */
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  autoResize?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, autoResize, className = "", style, ...props }, ref) => {
    const internalRef = useRef<HTMLTextAreaElement>(null);
    const textareaRef = (ref || internalRef) as React.RefObject<HTMLTextAreaElement>;

    useEffect(() => {
      if (autoResize && textareaRef.current) {
        const el = textareaRef.current;
        const resize = () => { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; };
        el.addEventListener("input", resize);
        resize();
        return () => el.removeEventListener("input", resize);
      }
    }, [autoResize, textareaRef]);

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
            {label}
          </label>
        )}
        <textarea
          ref={textareaRef}
          className={`min-h-[80px] rounded-md px-3 py-2 text-[13px] outline-none transition-colors ${autoResize ? "resize-none overflow-hidden" : "resize-y"} ${className}`}
          style={{
            background: "var(--color-bg-card)",
            color: "var(--color-text-primary)",
            border: `1px solid ${error ? "var(--color-error)" : "var(--color-border-default)"}`,
            ...style,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = error ? "var(--color-error)" : "var(--color-border-focus)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = error ? "var(--color-error)" : "var(--color-border-default)";
          }}
          {...props}
        />
        {error && (
          <span className="text-[12px]" style={{ color: "var(--color-error)" }}>{error}</span>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

/* ── Select ── */
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className = "", style, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={`h-8 rounded-md px-2.5 pr-8 text-[13px] outline-none transition-colors appearance-none bg-[url('data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%239CA3AF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat ${className}`}
          style={{
            background: "var(--color-bg-card)",
            color: "var(--color-text-primary)",
            border: `1px solid ${error ? "var(--color-error)" : "var(--color-border-default)"}`,
            ...style,
          }}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {error && (
          <span className="text-[12px]" style={{ color: "var(--color-error)" }}>{error}</span>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";

/* ── Toggle ── */
interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <label className={`inline-flex items-center gap-2 ${disabled ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200"
        style={{ background: checked ? "var(--color-accent)" : "var(--color-bg-emphasis)" }}
      >
        <span
          className="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200"
          style={{ transform: checked ? "translateX(17px)" : "translateX(2px)" }}
        />
      </button>
      {label && (
        <span className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>{label}</span>
      )}
    </label>
  );
}

/* ── Checkbox ── */
interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Checkbox({ checked, onChange, label, disabled }: CheckboxProps) {
  return (
    <label className={`inline-flex items-center gap-2 ${disabled ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className="flex h-4 w-4 items-center justify-center rounded transition-colors duration-150"
        style={{
          background: checked ? "var(--color-accent)" : "transparent",
          border: checked ? "none" : "1px solid var(--color-border-strong)",
        }}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {label && (
        <span className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>{label}</span>
      )}
    </label>
  );
}
