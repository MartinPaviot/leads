"use client";

/**
 * Inactivity auto-logout. Mounted once in the authenticated dashboard layout.
 *
 * Watches real user interaction (not request traffic — see the note in
 * `lib/auth/idle-timeout.ts`). After IDLE_TIMEOUT_MS of inactivity it signs the
 * user out; IDLE_WARNING_MS before that it shows a countdown so an active user
 * is never bounced silently. Last-activity is shared across tabs via
 * localStorage, so working in one tab keeps the others alive, and an idle
 * logout in one tab redirects the rest.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { Clock } from "lucide-react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import {
  IDLE_STORAGE_KEY,
  IDLE_LOGOUT_KEY,
  idlePhase,
  secondsUntilLogout,
} from "@/lib/auth/idle-timeout";

const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
  "wheel",
  "mousemove",
] as const;
const WRITE_THROTTLE_MS = 2_000;
const REDIRECT = "/sign-in?reason=idle";

const nowMs = () => Date.now();

function readLast(): number | null {
  try {
    const v = localStorage.getItem(IDLE_STORAGE_KEY);
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null; // private mode / storage disabled → single-tab in-memory only
  }
}
function writeLast(ts: number) {
  try {
    localStorage.setItem(IDLE_STORAGE_KEY, String(ts));
  } catch {
    /* ignore */
  }
}

export function IdleLogout() {
  // null = no warning shown; a number = seconds left in the countdown.
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastActivityRef = useRef(nowMs());
  const lastWriteRef = useRef(0);
  const loggedOutRef = useRef(false);

  const bump = useCallback(() => {
    const t = nowMs();
    lastActivityRef.current = t;
    // Throttle the cross-tab write; mousemove/scroll fire a lot.
    if (t - lastWriteRef.current >= WRITE_THROTTLE_MS) {
      lastWriteRef.current = t;
      writeLast(t);
    }
  }, []);

  const stay = useCallback(() => {
    const t = nowMs();
    lastActivityRef.current = t;
    lastWriteRef.current = t;
    writeLast(t); // propagate the reset to other tabs
    setSecondsLeft(null);
  }, []);

  const logout = useCallback(() => {
    if (loggedOutRef.current) return;
    loggedOutRef.current = true;
    try {
      localStorage.setItem(IDLE_LOGOUT_KEY, String(nowMs()));
    } catch {
      /* ignore */
    }
    void signOut({ callbackUrl: REDIRECT });
  }, []);

  // Seed last-activity on mount (a fresh page load is activity).
  useEffect(() => {
    const t = nowMs();
    lastActivityRef.current = t;
    writeLast(t);
  }, []);

  // Reset the idle clock on real interaction.
  useEffect(() => {
    const handler = () => bump();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, handler, { passive: true });
    }
    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, handler);
    };
  }, [bump]);

  // Follow a sibling tab that logged out for inactivity.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === IDLE_LOGOUT_KEY && e.newValue && !loggedOutRef.current) {
        loggedOutRef.current = true;
        window.location.href = REDIRECT;
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Heartbeat: every second, read the shared last-activity and act.
  useEffect(() => {
    const tick = () => {
      const stored = readLast();
      const last = Math.max(lastActivityRef.current, stored ?? 0);
      const idleMs = nowMs() - last;
      const phase = idlePhase(idleMs);
      if (phase === "expired") {
        setSecondsLeft(0);
        logout();
      } else if (phase === "warning") {
        setSecondsLeft(secondsUntilLogout(idleMs));
      } else {
        // collapse to null without re-rendering when already inactive-warning-free
        setSecondsLeft((prev) => (prev === null ? prev : null));
      }
    };
    tick();
    const id = window.setInterval(tick, 1_000);
    // Catch a tab that was backgrounded past the cut-off the moment it returns.
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [logout]);

  if (secondsLeft === null) return null;

  return (
    <IdleWarningModal secondsLeft={secondsLeft} onStay={stay} onSignOut={logout} />
  );
}

function IdleWarningModal({
  secondsLeft,
  onStay,
  onSignOut,
}: {
  secondsLeft: number;
  onStay: () => void;
  onSignOut: () => void;
}) {
  const ref = useFocusTrap<HTMLDivElement>(true);

  // Esc dismisses = the user is present = stay (never log out on Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onStay();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onStay]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-title"
      aria-describedby="idle-desc"
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      style={{ background: "var(--color-bg-modal-overlay, rgba(0,0,0,0.4))" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onStay();
      }}
    >
      <div
        ref={ref}
        className="w-full max-w-md rounded-xl p-5"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          boxShadow: "var(--shadow-dialog)",
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
            style={{ background: "var(--color-bg-hover)", color: "var(--color-text-secondary)" }}
            aria-hidden="true"
          >
            <Clock size={16} />
          </div>
          <div className="flex-1">
            <h2
              id="idle-title"
              className="text-[14px] font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Still there?
            </h2>
            <p
              id="idle-desc"
              className="mt-1 text-[12px]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              You&apos;ll be signed out in {secondsLeft}s for security after a period of
              inactivity. Anything you&apos;ve typed stays put.
            </p>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-md px-3 py-1.5 text-[12px] font-medium"
            style={{
              background: "transparent",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            Sign out now
          </button>
          <button
            type="button"
            onClick={onStay}
            autoFocus
            className="rounded-md px-3 py-1.5 text-[12px] font-semibold text-white"
            style={{ background: "var(--color-accent)" }}
          >
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
}
