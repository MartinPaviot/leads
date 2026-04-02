"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";

type ToastVariant = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

const ToastContext = createContext<{
  toast: (message: string, variant?: ToastVariant) => void;
}>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const icons: Record<ToastVariant, React.ReactNode> = {
    success: <CheckCircle2 size={16} style={{ color: "var(--color-success)" }} />,
    error: <AlertCircle size={16} style={{ color: "var(--color-error)" }} />,
    info: <Info size={16} style={{ color: "var(--color-info)" }} />,
  };

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed right-4 top-4 z-[100] flex flex-col gap-2" style={{ maxWidth: 360 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
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
            <button
              onClick={() => removeToast(t.id)}
              className="flex h-5 w-5 items-center justify-center rounded transition-colors"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
