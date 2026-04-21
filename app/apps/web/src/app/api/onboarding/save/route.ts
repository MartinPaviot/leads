import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { authUsers, tenants, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { updateTenantSettings, type TenantSettings, getTenantSettings } from "@/lib/tenant-settings";
import { inngest } from "@/inngest/client";
import { sendWelcomeEmail } from "@/lib/emails/welcome";
import { logger } from "@/lib/logger";
import { posthogEvents } from "@/lib/analytics";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await req.json();
  const updates: Partial<TenantSettings> = {};

  // Persist the step the user is currently viewing so we can re-open the
  // wizard in the same spot after a reload. `currentStep` arrives either
  // on its own (pure position update, `step === "_current"`) or piggy-backed
  // on the normal per-step saves below.
  if (typeof data.currentStep === "string" && data.currentStep.length > 0) {
    updates.onboardingCurrentStep = data.currentStep;
  }

  if (data.step === "_current") {
    if (updates.onboardingCurrentStep) {
      await updateTenantSettings(authCtx.tenantId, updates);
    }
    return Response.json({ ok: true });
  }

  if (data.step === "welcome") {
    updates.onboardingFullName = data.fullName;
    updates.onboardingCompanyName = data.companyName;
    updates.onboardingRole = data.role;
    updates.companyDomain = data.domain;

    // WS-0 — stamp the very first welcome save so onboarding_completed
    // can compute an accurate total duration later. Only set if absent so
    // a user who re-enters the welcome step doesn't reset the clock.
    const currentSettings = await getTenantSettings(authCtx.tenantId);
    if (!currentSettings.onboardingStartedAt) {
      updates.onboardingStartedAt = new Date().toISOString();
    }

    // Also update tenant name and user name
    if (data.companyName) {
      await db.update(tenants).set({ name: data.companyName }).where(eq(tenants.id, authCtx.tenantId));
    }
    if (data.fullName) {
      const parts = data.fullName.trim().split(/\s+/);
      const firstName = parts[0] || "";
      const lastName = parts.slice(1).join(" ") || "";
      await db.update(users).set({ firstName, lastName }).where(eq(users.id, authCtx.appUserId));
    }
  }

  if (data.step === "product") {
    updates.productDescription = data.productDesc;
    updates.salesMotion = data.salesMotion;
    updates.primaryChallenge = data.challenge;
  }

  if (data.step === "connect") {
    updates.emailProvider = data.emailProvider;
  }

  if (data.step === "privacy") {
    updates.contactCreationMode = data.contactCreationMode;
    updates.backsyncRange = data.backsyncRange;
    updates.doNotTrackDomains = data.doNotTrackDomains;
    if (
      data.defaultDataVisibility === "everyone" ||
      data.defaultDataVisibility === "team" ||
      data.defaultDataVisibility === "private"
    ) {
      updates.defaultDataVisibility = data.defaultDataVisibility;
    }
  }

  if (data.step === "icp") {
    updates.targetIndustries = data.industries;
    updates.targetCompanySizes = data.companySizes;
    updates.targetSeniorities = data.targetSeniorities;
    updates.targetDepartments = data.targetDepartments;
    // Derive targetRoles string for backward compat with scoring, TAM, chat prompts
    const seniorities = (data.targetSeniorities || []) as string[];
    const departments = (data.targetDepartments || []) as string[];
    updates.targetRoles = [...seniorities, ...departments].join(", ");
    updates.targetGeographies = data.geographies;
    if (data.aiTone) updates.aiTone = data.aiTone;
  }

  // O9: capture the prior welcome-send timestamp before we write so the
  // post-write idempotency guard can compare against it.
  // WS-0: also read onboardingStartedAt here so the completion event
  // can report total duration without a second DB roundtrip.
  let priorWelcomeSentAt: string | undefined;
  let onboardingStartedAt: string | undefined;
  if (data.step === "complete") {
    const [tenantRow] = await db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, authCtx.tenantId))
      .limit(1);
    const priorSettings = (tenantRow?.settings || {}) as Record<string, unknown>;
    priorWelcomeSentAt =
      typeof priorSettings.welcomeEmailSentAt === "string"
        ? (priorSettings.welcomeEmailSentAt as string)
        : undefined;
    onboardingStartedAt =
      typeof priorSettings.onboardingStartedAt === "string"
        ? (priorSettings.onboardingStartedAt as string)
        : undefined;

    updates.onboardingCompleted = true;
    updates.onboardingCompletedAt = new Date().toISOString();
    // Clear the resume marker on completion — no point remembering a step
    // once the wizard is done.
    updates.onboardingCurrentStep = undefined;
  }

  await updateTenantSettings(authCtx.tenantId, updates);

  // Fire onboarding/completed event to trigger auto-TAM + enrichment
  if (data.step === "complete") {
    // WS-0 — emit PostHog onboarding_completed server-side so the funnel
    // closes even when the client tab closes between the save and the
    // redirect. durationMs null if onboardingStartedAt never stamped
    // (legacy tenant pre-WS-0 or stamp lost).
    let durationMs: number | undefined;
    if (onboardingStartedAt) {
      const started = new Date(onboardingStartedAt).getTime();
      const now = Date.now();
      if (Number.isFinite(started) && now >= started) {
        durationMs = now - started;
      }
    }
    posthogEvents
      .onboarding_completed(authCtx.userId, {
        userId: authCtx.userId,
        durationMs,
      })
      .catch((err) =>
        logger.warn("onboarding/save: onboarding_completed emit failed", { err })
      );

    inngest
      .send({
        name: "onboarding/completed",
        data: {
          tenantId: authCtx.tenantId,
          appUserId: authCtx.appUserId,
        },
      })
      .catch((err) =>
        console.warn("Failed to trigger onboarding completion:", err)
      );

    // O9: welcome email — best-effort, idempotent. We send exactly once
    // per tenant; a re-completion (e.g. user re-runs the wizard) won't
    // mailbomb. Failures are logged but never block the completion.
    if (!priorWelcomeSentAt) {
      try {
        const [user] = await db
          .select({ email: authUsers.email, name: authUsers.name })
          .from(authUsers)
          .where(eq(authUsers.id, authCtx.userId))
          .limit(1);
        const [tenantRow] = await db
          .select({ name: tenants.name, settings: tenants.settings })
          .from(tenants)
          .where(eq(tenants.id, authCtx.tenantId))
          .limit(1);
        const settings = (tenantRow?.settings || {}) as Record<string, unknown>;
        const companyName =
          (typeof settings.onboardingCompanyName === "string"
            ? settings.onboardingCompanyName
            : null) ||
          tenantRow?.name ||
          null;

        if (user?.email) {
          const result = await sendWelcomeEmail({
            to: user.email,
            firstName: user.name,
            companyName,
          });
          if (result.sent) {
            await updateTenantSettings(authCtx.tenantId, {
              welcomeEmailSentAt: new Date().toISOString(),
            });
          } else {
            logger.warn("onboarding/save: welcome email send failed", {
              tenantId: authCtx.tenantId,
              reason: result.reason,
            });
          }
        }
      } catch (err) {
        logger.error("onboarding/save: welcome email path threw", { err });
      }
    }
  }

  return Response.json({ ok: true });
}
