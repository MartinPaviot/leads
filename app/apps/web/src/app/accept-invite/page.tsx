"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";

interface InviteInfo {
  email: string;
  role: string;
  workspace: string;
  expiresAt: string;
  /** True if the invited email already has an account → offer sign-in first. */
  hasAccount?: boolean;
}

function AcceptInviteInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";

  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "valid"; invite: InviteInfo }
    | { kind: "invalid"; reason: string }
    | { kind: "accepting" }
    | { kind: "accepted"; reauth: boolean }
    | { kind: "needs_signin"; invite: InviteInfo }
    | { kind: "wrong_account"; message: string; email?: string }
  >({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid", reason: "Missing invitation token in URL." });
      return;
    }
    fetch(`/api/auth/invite/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.valid) {
          setState({
            kind: "invalid",
            reason: friendlyReason(data.reason as string | undefined),
          });
          return;
        }
        setState({ kind: "valid", invite: data.invite as InviteInfo });
      })
      .catch(() => {
        setState({ kind: "invalid", reason: "Unable to verify the invitation. Please try again." });
      });
  }, [token]);

  async function accept() {
    if (state.kind !== "valid") return;
    const invitedEmail = state.invite.email;
    setState({ kind: "accepting" });
    const res = await fetch("/api/auth/invite/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      // Not signed in — redirect to sign-in, then come back here
      const callback = `/accept-invite?token=${encodeURIComponent(token)}`;
      router.push(`/sign-in?callbackUrl=${encodeURIComponent(callback)}`);
      return;
    }
    if (res.status === 403) {
      setState({
        kind: "wrong_account",
        message: data.error || "Sign in with the invited email address to accept this invitation.",
        email: invitedEmail,
      });
      return;
    }
    if (!res.ok) {
      setState({
        kind: "invalid",
        reason: data.error || "Failed to accept invitation.",
      });
      return;
    }
    // When the accept MOVED the user into a different workspace, the current
    // JWT still carries the OLD tenant — a plain navigation keeps that stale
    // session, so they'd land on the old (often empty) workspace's data. The
    // accept route flags this via `requiresReauth`; sign out so they
    // re-authenticate and get a token with the new tenant. (`requiresReauth`
    // is false when they were already in the tenant — then just go home.)
    const reauth = data.requiresReauth === true;
    setState({ kind: "accepted", reauth });
    setTimeout(() => {
      if (reauth) {
        void signOut({ callbackUrl: `/sign-in?callbackUrl=${encodeURIComponent("/home")}` });
      } else {
        window.location.href = "/home";
      }
    }, 1200);
  }

  // Sign the current (wrong) account out and bounce back to this invite via
  // sign-in, so the user can authenticate as the invited email and accept.
  function switchAccount() {
    const callback = `/accept-invite?token=${encodeURIComponent(token)}`;
    void signOut({ callbackUrl: `/sign-in?callbackUrl=${encodeURIComponent(callback)}` });
  }

  return (
    <div
      className="bg-grid flex min-h-screen flex-col px-4 py-8"
      style={{ background: "var(--color-bg-page)" }}
    >
      <div
        className="m-auto w-full max-w-md space-y-4 rounded-xl px-7 py-6"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          boxShadow: "var(--shadow-dialog)",
        }}
      >
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-Elevay.svg" alt="Elevay" className="mb-3 h-10 w-10" />
          <h1 className="gradient-text text-2xl font-bold tracking-tight">Elevay</h1>
        </div>

        {state.kind === "loading" && <Centered>Verifying invitation…</Centered>}

        {state.kind === "invalid" && (
          <div className="text-center">
            <h2 style={h2Style}>Invitation unavailable</h2>
            <p style={pStyle}>{state.reason}</p>
            <p style={mutedStyle}>Ask the workspace admin to send a new invitation.</p>
          </div>
        )}

        {state.kind === "valid" && (() => {
          const inv = state.invite;
          const signUpHref = `/sign-up?email=${encodeURIComponent(inv.email)}&invite=${encodeURIComponent(token)}`;
          const known = inv.hasAccount === true;
          const isNew = inv.hasAccount === false;
          return (
            <div className="text-center">
              <h2 style={h2Style}>Join {inv.workspace}</h2>
              <p style={pStyle}>
                You&apos;ve been invited to <strong>{inv.workspace}</strong> as a{" "}
                <strong>{inv.role}</strong>.
              </p>
              <p style={mutedStyle}>
                Invitation for <strong>{inv.email}</strong>.{" "}
                {known
                  ? "Sign in with that email to accept."
                  : isNew
                    ? "Create your account to join."
                    : "Sign in, or create an account if you don't have one yet."}
              </p>

              {known ? (
                <div style={{ display: "flex", marginTop: 22 }}>
                  <button onClick={accept} style={primaryButtonStyle}>
                    Sign in &amp; accept
                  </button>
                </div>
              ) : isNew ? (
                <>
                  <div style={{ display: "flex", marginTop: 22 }}>
                    <a
                      href={signUpHref}
                      style={{
                        ...primaryButtonStyle,
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      Create account
                    </a>
                  </div>
                  <button onClick={accept} style={linkButtonStyle}>
                    Already have an account? Sign in
                  </button>
                </>
              ) : (
                <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
                  <button onClick={accept} style={primaryButtonStyle}>
                    Sign in &amp; accept
                  </button>
                  <a href={signUpHref} style={secondaryButtonStyle}>
                    Create account
                  </a>
                </div>
              )}
            </div>
          );
        })()}

        {state.kind === "accepting" && <Centered>Accepting invitation…</Centered>}

        {state.kind === "accepted" && (
          <div className="text-center">
            <h2 style={h2Style}>You&apos;re in!</h2>
            <p style={pStyle}>
              {state.reauth
                ? "Sign in once more to enter your new workspace…"
                : "Redirecting you to the workspace…"}
            </p>
          </div>
        )}

        {state.kind === "wrong_account" && (
          <div className="text-center">
            <h2 style={h2Style}>Wrong account</h2>
            <p style={pStyle}>
              {state.email ? (
                <>
                  This invitation was sent to <strong>{state.email}</strong>, but you&apos;re
                  signed in with a different account.
                </>
              ) : (
                state.message
              )}
            </p>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 22 }}>
              <button onClick={switchAccount} style={primaryButtonStyle}>
                Sign out &amp; switch account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="bg-grid flex min-h-screen flex-col px-4 py-8" style={{ background: "var(--color-bg-page)" }}>
          <div
            className="m-auto w-full max-w-md rounded-xl px-7 py-6"
            style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
          >
            <Centered>Loading…</Centered>
          </div>
        </div>
      }
    >
      <AcceptInviteInner />
    </Suspense>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <p style={{ ...pStyle, textAlign: "center", margin: 0 }}>{children}</p>;
}

function friendlyReason(reason?: string): string {
  switch (reason) {
    case "expired": return "This invitation has expired.";
    case "cancelled": return "This invitation was cancelled.";
    case "accepted": return "This invitation has already been accepted.";
    case "not_found": return "This invitation link is invalid.";
    case "missing_token": return "This link is missing the invitation token.";
    default: return "This invitation is no longer valid.";
  }
}

const h2Style: React.CSSProperties = {
  fontSize: "1.25rem",
  fontWeight: 600,
  margin: "0 0 0.75rem",
  color: "var(--color-text-primary)",
};

const pStyle: React.CSSProperties = {
  margin: "0 0 0.75rem",
  fontSize: "0.95rem",
  lineHeight: 1.6,
  color: "var(--color-text-secondary)",
};

const mutedStyle: React.CSSProperties = {
  margin: "0.75rem 0 0",
  fontSize: "0.85rem",
  color: "var(--color-text-tertiary)",
  lineHeight: 1.6,
};

const primaryButtonStyle: React.CSSProperties = {
  flex: 1,
  background: "var(--color-accent)",
  color: "#fff",
  border: "none",
  padding: "0.625rem 1.25rem",
  borderRadius: 8,
  fontWeight: 600,
  fontSize: "0.875rem",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  flex: 1,
  background: "transparent",
  color: "var(--color-text-primary)",
  border: "1px solid var(--color-border-default)",
  padding: "0.625rem 1.25rem",
  borderRadius: 8,
  fontWeight: 600,
  fontSize: "0.875rem",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const linkButtonStyle: React.CSSProperties = {
  marginTop: 14,
  background: "transparent",
  border: "none",
  color: "var(--color-text-secondary)",
  fontSize: "0.8rem",
  cursor: "pointer",
  textDecoration: "underline",
};
