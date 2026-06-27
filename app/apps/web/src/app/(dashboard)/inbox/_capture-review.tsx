"use client";

/**
 * Capture review drawer (INBOX-G02) — the human-in-the-loop approval surface.
 *
 * When the tenant runs capture in "review" mode, auto-captured interactions land
 * as pending approvals instead of going straight to the CRM. This surfaces them
 * inside the inbox with an honest provenance line and one-tap Add-to-CRM / Dismiss,
 * reusing the proven capture-approval backend. Renders nothing when the queue is
 * empty, so it never adds chrome for tenants on auto-capture.
 */
import { useEffect, useState } from "react";
import { Inbox, Check, X, Loader2, AlertCircle } from "lucide-react";
import { useT } from "@/lib/i18n/locale";

interface PendingCapture {
  id: string;
  summary: string;
  from: string;
  at: string;
}

export function CaptureReviewDrawer() {
  const t = useT();
  const [captures, setCaptures] = useState<PendingCapture[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    fetch("/api/inbox/captures")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: { captures?: PendingCapture[] }) => {
        if (!cancelled && Array.isArray(d.captures)) setCaptures(d.captures);
      })
      // Previously swallowed (.catch(() => {})), so a failing approval queue
      // rendered nothing — indistinguishable from "no captures". Surface a
      // retryable signal instead so a broken queue is visible.
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function review(id: string, action: "approve" | "reject") {
    setBusy(id);
    try {
      const r = await fetch("/api/inbox/captures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (r.ok) setCaptures((c) => c.filter((x) => x.id !== id));
    } catch {
      /* keep it in the list on failure */
    } finally {
      setBusy(null);
    }
  }

  if (captures.length === 0 && !error) return null;

  return (
    <div className="border-b" style={{ borderColor: "var(--color-border-default)" }}>
      {captures.length === 0 && error ? (
        <div
          className="flex w-full items-center justify-between gap-2 px-4 py-2 text-[12px]"
          style={{ color: "var(--color-text-secondary)" }}
          role="alert"
        >
          <span className="flex items-center gap-1.5">
            <AlertCircle size={13} className="shrink-0" style={{ color: "var(--color-error)" }} />
            {t("inbox.capture.loadError")}
          </span>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded px-2 py-0.5 text-[11px] font-medium"
            style={{ border: "1px solid var(--color-border-default)", color: "var(--color-text-secondary)" }}
          >
            {t("common.retry")}
          </button>
        </div>
      ) : (
      <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-4 py-2 text-[12px] font-medium hover:bg-[var(--color-bg-hover)]"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <Inbox size={13} className="shrink-0" style={{ color: "var(--color-accent)" }} />
        {t(captures.length === 1 ? "inbox.capture.toReviewOne" : "inbox.capture.toReviewOther", {
          count: captures.length,
        })}
      </button>

      {open && (
        <div className="px-4 pb-2">
          {captures.map((c) => (
            <div
              key={c.id}
              className="mb-1.5 rounded-md border p-2 text-[12px]"
              style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
            >
              <div className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                {c.summary || t("inbox.capture.noSubject")}
              </div>
              {c.from && (
                <div className="mt-0.5 truncate" style={{ color: "var(--color-text-secondary)" }}>
                  {c.from}
                </div>
              )}
              <div className="mt-0.5 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                {t("inbox.capture.provenance")}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  disabled={busy === c.id}
                  onClick={() => void review(c.id, "approve")}
                  className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium"
                  style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                >
                  {busy === c.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  {t("inbox.capture.addToCrm")}
                </button>
                <button
                  type="button"
                  disabled={busy === c.id}
                  onClick={() => void review(c.id, "reject")}
                  className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px]"
                  style={{ border: "1px solid var(--color-border-default)", color: "var(--color-text-secondary)" }}
                >
                  <X size={11} />
                  {t("inbox.capture.dismiss")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}
