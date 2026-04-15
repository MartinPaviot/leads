/**
 * WS-1: CTA footer injection for meeting follow-up emails.
 *
 * For each external participant who was exposed to a branded bot on a given
 * activity, build a personalised footer with a tracked redirect link so we
 * can measure the recorder→signup funnel per exposure.
 *
 * External recipients with no exposure row (silent meetings, opt-outs)
 * receive no footer.
 */

import { db } from "@/db";
import { notetakerExposures } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { normalizeEmail } from "@/lib/util/email";

function getAppBaseUrl(): string {
  return (
    process.env.APP_BASE_URL ||
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    "https://app.elevay.com"
  ).replace(/\/$/, "");
}

export type CtaFooterBuildResult = {
  /** email_lowercased → footer text ready to append to message body */
  footerByRecipient: Map<string, string>;
  /** How many external recipients got a footer (for logging). */
  footerCount: number;
};

export async function buildCtaFootersForActivity(
  activityId: string
): Promise<CtaFooterBuildResult> {
  const exposures = await db
    .select()
    .from(notetakerExposures)
    .where(
      and(
        eq(notetakerExposures.activityId, activityId),
        eq(notetakerExposures.brandingMode, "full")
      )
    );

  const base = getAppBaseUrl();
  const out = new Map<string, string>();

  for (const exp of exposures) {
    const footer = buildFooterText(base, exp.id);
    // Key by the raw lowercased email (what the send route has), plus the
    // normalised form (in case the send path passes normalised values).
    out.set(exp.participantEmail.toLowerCase(), footer);
    out.set(exp.participantEmailNormalized, footer);
  }

  return { footerByRecipient: out, footerCount: exposures.length };
}

function buildFooterText(base: string, exposureId: string): string {
  const link = `${base}/r/exposure/${exposureId}`;
  return [
    "",
    "— ",
    "Ce résumé a été généré automatiquement par Elevay.",
    `Voir comment ça marche : ${link}`,
  ].join("\n");
}

/** Exposed for tests. */
export function _buildFooterTextForTest(base: string, exposureId: string): string {
  return buildFooterText(base, exposureId);
}

/**
 * Given a normalised or lowercased recipient email + the footer map,
 * return the body with the footer appended if applicable.
 */
export function appendFooterIfExternal(
  body: string,
  recipientEmail: string,
  footers: Map<string, string>
): string {
  const lower = recipientEmail.toLowerCase();
  let footer = footers.get(lower);
  if (!footer) {
    try {
      footer = footers.get(normalizeEmail(recipientEmail));
    } catch {
      // ignore
    }
  }
  if (!footer) return body;
  return `${body}${footer}`;
}
