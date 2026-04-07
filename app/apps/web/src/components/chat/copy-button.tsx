"use client";

import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";

interface CopyButtonProps {
  text: string;
  className?: string;
}

export function CopyButton({ text, className = "" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center justify-center rounded-md p-1 transition-all ${className}`}
      style={{
        color: copied ? "var(--color-success, #22c55e)" : "var(--color-text-tertiary)",
        background: copied ? "var(--color-success, #22c55e)11" : "transparent",
      }}
      title={copied ? "Copied" : "Copy"}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}
