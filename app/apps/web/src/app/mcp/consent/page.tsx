import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { getMcpClient, isRedirectUriRegistered } from "@/lib/mcp/oauth/clients";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * OAuth consent screen (CHAT-08 Part B). Server component — by the time a
 * user lands here, /api/mcp/authorize has already validated client_id/
 * redirect_uri/code_challenge and confirmed a LeadSens session exists.
 * Re-validates anyway (never trust a redirect as proof) before rendering
 * Approve, since this page is the one place a user's explicit consent is
 * actually captured.
 */
export default async function McpConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const clientId = typeof sp.client_id === "string" ? sp.client_id : "";
  const redirectUri = typeof sp.redirect_uri === "string" ? sp.redirect_uri : "";
  const codeChallenge = typeof sp.code_challenge === "string" ? sp.code_challenge : "";
  const codeChallengeMethod = typeof sp.code_challenge_method === "string" ? sp.code_challenge_method : "S256";
  const state = typeof sp.state === "string" ? sp.state : "";
  const scope = typeof sp.scope === "string" ? sp.scope : "";

  const authCtx = await getAuthContext();
  if (!authCtx) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/mcp/consent?${new URLSearchParams(sp as Record<string, string>).toString()}`)}`);
  }

  const client = clientId ? await getMcpClient(clientId) : null;
  const [me] = authCtx
    ? await db.select({ email: users.email }).from(users).where(eq(users.id, authCtx.appUserId)).limit(1)
    : [];

  if (!client || !redirectUri || !codeChallenge || !isRedirectUriRegistered(client, redirectUri)) {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Invalid request</h1>
        <p style={{ color: "#666", fontSize: 14 }}>
          This authorization link is missing required parameters or references an unregistered client/redirect. Ask
          the app you were connecting to try again.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
        {client.clientName || "An application"} wants to access your LeadSens account
      </h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
        Signed in as <strong>{me?.email || authCtx.userId}</strong>. This will let it read and act on your CRM data on your
        behalf, scoped to your role and permissions — the same rules that already apply in the LeadSens app.
        Destructive actions (delete/merge) are never available to external clients.
      </p>
      <form method="POST" action="/api/mcp/authorize/decision" style={{ display: "flex", gap: 12 }}>
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="code_challenge" value={codeChallenge} />
        <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />
        <input type="hidden" name="state" value={state} />
        <input type="hidden" name="scope" value={scope} />
        <button
          type="submit"
          name="decision"
          value="deny"
          style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }}
        >
          Deny
        </button>
        <button
          type="submit"
          name="decision"
          value="approve"
          style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#111", color: "#fff", cursor: "pointer" }}
        >
          Approve
        </button>
      </form>
    </div>
  );
}
