"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface InviteInfo {
  email: string;
  role: string;
  workspace: string;
  expiresAt: string;
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
    | { kind: "accepted" }
    | { kind: "needs_signin"; invite: InviteInfo }
    | { kind: "wrong_account"; message: string }
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
    setState({ kind: "accepted" });
    // Force a fresh session so the new tenantId/role propagate, then go home.
    setTimeout(() => {
      window.location.href = "/home";
    }, 1200);
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {state.kind === "loading" && <Centered>Verifying invitation…</Centered>}

        {state.kind === "invalid" && (
          <>
            <h1 style={h1Style}>Invitation unavailable</h1>
            <p style={pStyle}>{state.reason}</p>
            <p style={mutedStyle}>
              Ask the workspace admin to send a new invitation.
            </p>
          </>
        )}

        {state.kind === "valid" && (
          <>
            <h1 style={h1Style}>Join {state.invite.workspace}</h1>
            <p style={pStyle}>
              You&apos;ve been invited to <strong>{state.invite.workspace}</strong> as a{" "}
              <strong>{state.invite.role}</strong>.
            </p>
            <p style={mutedStyle}>
              Invitation sent to <strong>{state.invite.email}</strong>. Sign in with that
              email — if you don&apos;t have an account yet, create one first, then return here.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button onClick={accept} style={primaryButtonStyle}>
                Sign in &amp; accept
              </button>
              <a
                href={`/sign-up?email=${encodeURIComponent(state.invite.email)}`}
                style={secondaryButtonStyle}
              >
                Create account
              </a>
            </div>
          </>
        )}

        {state.kind === "accepting" && <Centered>Accepting invitation…</Centered>}

        {state.kind === "accepted" && (
          <>
            <h1 style={h1Style}>You&apos;re in!</h1>
            <p style={pStyle}>Redirecting you to the workspace…</p>
          </>
        )}

        {state.kind === "wrong_account" && (
          <>
            <h1 style={h1Style}>Wrong account</h1>
            <p style={pStyle}>{state.message}</p>
            <p style={mutedStyle}>
              Sign out, then sign back in with the invited email address.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div style={pageStyle}><div style={cardStyle}><Centered>Loading…</Centered></div></div>}>
      <AcceptInviteInner />
    </Suspense>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ ...pStyle, textAlign: "center", margin: 0 }}>{children}</p>
  );
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

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#09090b",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

const cardStyle: React.CSSProperties = {
  maxWidth: 480,
  width: "100%",
  background: "#121214",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: "2rem",
  color: "rgba(255,255,255,0.92)",
};

const h1Style: React.CSSProperties = {
  fontSize: "1.5rem",
  fontWeight: 600,
  margin: "0 0 1rem",
};

const pStyle: React.CSSProperties = {
  margin: "0 0 0.75rem",
  fontSize: "0.95rem",
  lineHeight: 1.6,
};

const mutedStyle: React.CSSProperties = {
  margin: "0.75rem 0 0",
  fontSize: "0.85rem",
  color: "rgba(255,255,255,0.55)",
  lineHeight: 1.6,
};

const primaryButtonStyle: React.CSSProperties = {
  background: "#6366f1",
  color: "#fff",
  border: "none",
  padding: "0.625rem 1.25rem",
  borderRadius: 8,
  fontWeight: 600,
  fontSize: "0.875rem",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.16)",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};
