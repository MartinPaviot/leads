import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { BodyScrollUnlock } from "@/components/auth/body-scroll-unlock";
import { sanitizeCallbackUrl } from "@/lib/auth/auth-callback";
import { resolveInboxDeepLinks } from "@/lib/emails/inbox-deep-links";
import { ResendVerifyButton } from "./resend-button";

/**
 * S2 / S7 — "Check your inbox" page shown right after sign-up.
 *
 * Server-rendered shell so we can read the session and the email's domain
 * to surface the matching webmail deep-link. Resend is a tiny client
 * island (`<ResendVerifyButton />`) for the cooldown UI.
 *
 * If the user is already verified by the time they land here (e.g. they
 * clicked the email in another tab) we redirect them straight to their
 * destination — the inbox page would just be a confusing dead-end.
 */
export default async function VerifyEmailSentPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = sanitizeCallbackUrl(params.next);

  const session = await auth();
  if (!session?.user?.email) {
    // Hitting this page signed-out doesn't make sense — bounce to sign-in
    // so they can restart the verify-email flow with proper context.
    redirect("/sign-in");
  }

  const email = session.user.email;
  const links = resolveInboxDeepLinks(email);

  return (
    <div
      className="bg-grid flex min-h-screen flex-col px-4 py-8"
      style={{ background: "var(--color-bg-page)" }}
    >
      <BodyScrollUnlock />
      <div
        className="m-auto w-full max-w-md space-y-5 rounded-xl p-7 text-center"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          boxShadow: "var(--shadow-dialog)",
        }}
      >
        <div className="flex flex-col items-center">
          <img src="/logo-Elevay.svg?v=2" alt="Elevay" className="mb-3 h-10 w-10" />
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
            Check your inbox
          </h1>
          <p className="mt-2 text-[14px]" style={{ color: "var(--color-text-secondary)" }}>
            We sent a verification link to{" "}
            <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>
              {email}
            </span>
            . Click it to confirm your account.
          </p>
        </div>

        {links.length > 0 && (
          <div className="flex flex-col gap-2">
            {links.map((link) => (
              <a
                key={link.provider}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg px-4 py-2.5 text-[13px] font-medium transition-opacity hover:opacity-90"
                style={{
                  background: "var(--color-accent)",
                  color: "white",
                }}
              >
                {link.label}
              </a>
            ))}
          </div>
        )}

        <div
          className="rounded-lg px-3 py-2.5 text-left text-[12px]"
          style={{
            background: "var(--color-bg-page)",
            color: "var(--color-text-tertiary)",
            border: "1px solid var(--color-border-default)",
          }}
        >
          Don&apos;t see the email? Check your spam folder, then resend below.
          The link expires in 24 hours.
        </div>

        <ResendVerifyButton />

        <div className="flex items-center justify-center gap-3 border-t pt-4 text-[12px]" style={{ borderColor: "var(--color-border-default)" }}>
          <Link
            href={next}
            className="hover:underline"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Skip for now
          </Link>
          <span style={{ color: "var(--color-text-tertiary)" }}>·</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/sign-in" });
            }}
          >
            <button
              type="submit"
              className="hover:underline"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
