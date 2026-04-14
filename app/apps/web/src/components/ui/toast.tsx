"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from "lucide-react";

type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** Override the default 5s auto-dismiss. Use Infinity to require
   *  explicit dismissal. */
  durationMs?: number;
  /** Optional inline action button (e.g. "Undo"). Clicking invokes
   *  `onClick` and dismisses the toast. */
  action?: ToastAction;
}

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

const DEFAULT_DURATION_MS = 5000;

const ToastContext = createContext<{
  toast: (message: string, variant?: ToastVariant, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
}>({
  toast: () => "",
  dismiss: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Track per-toast timers so we can clear them if the user dismisses
  // or clicks the action before auto-dismiss fires.
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (
      message: string,
      variant: ToastVariant = "info",
      options: ToastOptions = {}
    ): string => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, variant, action: options.action }]);

      const duration = options.durationMs ?? DEFAULT_DURATION_MS;
      if (Number.isFinite(duration) && duration > 0) {
        const timer = setTimeout(() => removeToast(id), duration);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [removeToast]
  );

  const icons: Record<ToastVariant, React.ReactNode> = {
    success: <CheckCircle2 size={16} style={{ color: "var(--color-success)" }} />,
    error: <AlertCircle size={16} style={{ color: "var(--color-error)" }} />,
    warning: <AlertTriangle size={16} style={{ color: "var(--color-warning, #d97706)" }} />,
    info: <Info size={16} style={{ color: "var(--color-info)" }} />,
  };

  return (
    <ToastContext.Provider value={{ toast: addToast, dismiss: removeToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed right-4 top-4 z-[100] flex flex-col gap-2" style={{ maxWidth: 420 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.variant === "error" ? "alert" : "status"}
            aria-live={t.variant === "error" ? "assertive" : "polite"}
            className="toast-enter flex items-center gap-2.5 rounded-lg px-4 py-3"
            style={{
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border-default)",
              boxShadow: "var(--shadow-floating)",
            }}
          >
            {icons[t.variant]}
            <span className="flex-1 text-[13px]" style={{ color: "var(--color-text-primary)" }}>
              {t.message}
            </span>
            {t.action && (
              <button
                onClick={() => {
                  t.action?.onClick();
                  removeToast(t.id);
                }}
                className="rounded px-2 py-0.5 text-[12px] font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
                style={{ color: "var(--color-accent)" }}
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => removeToast(t.id)}
              className="flex h-5 w-5 items-center justify-center rounded transition-colors"
              style={{ color: "var(--color-text-tertiary)" }}
              aria-label="Dismiss notification"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
