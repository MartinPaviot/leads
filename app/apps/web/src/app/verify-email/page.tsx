import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BodyScrollUnlock } from "@/components/auth/body-scroll-unlock";
import {
  consumeVerifyToken,
  markEmailVerified,
  validateVerifyToken,
} from "@/lib/emails/email-verification";

/**
 * S2 — `/verify-email?token=…`
 *
 * Pure server-component flow, no client JS: validate the emailed token,
 * stamp `auth_user.emailVerified`, consume the token, then bounce the
 * user to `/home?verified=1` (signed-in) or `/sign-in?reason=email-verified`
 * (signed-out — they verified from a different browser than they signed
 * up in).
 *
 * On any failure we render a friendly screen with a CTA to resend rather
 * than a redirect, so the user understands what happened.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = (params.token ?? "").trim();

  if (!token) {
    return <VerifyError reason="missing" />;
  }

  const row = await validateVerifyToken(token);
  if (!row) {
    return <VerifyError reason="invalid" />;
  }

  await markEmailVerified(row.userId);
  await consumeVerifyToken(row.id);

  const session = await auth();
  if (session?.user?.id === row.userId) {
    redirect("/home?verified=1");
  }
  redirect("/sign-in?reason=email-verified");
}

function VerifyError({ reason }: { reason: "missing" | "invalid" }) {
  const title = reason === "missing" ? "Missing verification link" : "Link expired or invalid";
  const body =
    reason === "missing"
      ? "This page needs a verification token. Please open the link from the email we sent you."
      : "This verification link has expired or has already been used. Sign in and resend a new one from the inbox screen.";

  return (
    <div
      className="bg-grid flex min-h-screen flex-col px-4 py-8"
      style={{ background: "var(--color-bg-page)" }}
    >
      <BodyScrollUnlock />
      <div
        className="m-auto w-full max-w-sm space-y-5 rounded-xl p-7 text-center"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          boxShadow: "var(--shadow-dialog)",
        }}
      >
        <img src="/logo-Elevay.svg?v=2" alt="Elevay" className="mx-auto h-10 w-10" />
        <h1 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {title}
        </h1>
        <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
          {body}
        </p>
        <div className="flex flex-col gap-2">
          <Link
            href="/sign-in"
            className="rounded-lg px-4 py-2.5 text-[13px] font-medium"
            style={{
              background: "var(--color-accent)",
              color: "white",
            }}
          >
            Sign in
          </Link>
          <Link
            href="/verify-email-sent"
            className="text-[12px] hover:underline"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Resend verification email
          </Link>
        </div>
      </div>
    </div>
  );
}
