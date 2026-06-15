import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { authUsers, tenants, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { updateTenantSettings, type TenantSettings, getTenantSettings } from "@/lib/config/tenant-settings";
import { inngest } from "@/inngest/client";
import { sendWelcomeEmail } from "@/lib/emails/welcome";
import { logger } from "@/lib/observability/logger";
import { posthogEvents } from "@/lib/analytics/analytics";
import { upsertRankOneProfileFromUiState } from "@/lib/icp/profile-upsert";
import { EMPTY_UI_STATE } from "@/lib/icp/ui-state";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await req.json();
  const updates: Partial<TenantSettings> = {};

  // Targeting helpers — shared by the icp flat-write block and the rank-1
  // profile upsert below. `icpHasAnyTargeting` gates BOTH so they stay
  // consistent: an empty/partial confirm must not write empty flats over a
  // populated ICP, because `hasUsableIcp` reads the flats and the onboarding
  // gate keys off it — clearing them would re-trigger the modal. The
  // reconnected card always sends the tenant's loaded values, so a normal
  // confirm lands here with real targeting.
  const strs = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const icpHasAnyTargeting =
    data.step === "icp" &&
    (strs(data.industries).length > 0 ||
      strs(data.companySizes).length > 0 ||
      strs(data.geographies).length > 0 ||
      strs(data.targetSeniorities).length > 0 ||
      strs(data.targetDepartments).length > 0 ||
      strs(data.keywords).length > 0 ||
      strs(data.technologies).length > 0 ||
      strs(data.hiringTitles).length > 0 ||
      num(data.revenueMin) !== null ||
      num(data.revenueMax) !== null ||
      num(data.totalFundingMin) !== null ||
      num(data.totalFundingMax) !== null ||
      num(data.minJobOpenings) !== null ||
      num(data.fundingRecencyDays) !== null);

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
    if (Array.isArray(data.companyInvestors) && data.companyInvestors.length > 0) {
      updates.companyInvestors = data.companyInvestors;
    }

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
    // Targeting flats — written only when the payload actually carries
    // targeting (see icpHasAnyTargeting). Within that, each field is
    // guarded so a partial payload doesn't clear an unrelated field. An
    // explicit clear of a single field (alongside other targeting) is
    // honored; a wholesale empty payload is a no-op so the ICP survives.
    if (icpHasAnyTargeting) {
      if (data.industries !== undefined) updates.targetIndustries = data.industries;
      if (data.companySizes !== undefined) updates.targetCompanySizes = data.companySizes;
      if (data.targetSeniorities !== undefined) updates.targetSeniorities = data.targetSeniorities;
      if (data.targetDepartments !== undefined) updates.targetDepartments = data.targetDepartments;
      // BUG-WS0-008: targetRoles is now always derived at read time from
      // targetSeniorities + targetDepartments via deriveTargetRoles() in
      // tenant-settings.ts. We no longer persist it here — that was the
      // source of the desync (editing seniorities/departments on the ICP
      // settings page did not re-derive targetRoles).
      if (data.geographies !== undefined) updates.targetGeographies = data.geographies;
      // Full Apollo filter surface (see ConfirmationCardTargeting). Each
      // field is optional; only persist when present so partial saves
      // don't wipe them.
      if (data.keywords !== undefined) updates.targetKeywords = data.keywords;
      if (data.technologies !== undefined) updates.targetTechnologies = data.technologies;
      if (data.excludeGeographies !== undefined) updates.excludeGeographies = data.excludeGeographies;
      if (data.hiringTitles !== undefined) updates.hiringTitles = data.hiringTitles;
      if (data.revenueMin !== undefined && data.revenueMin !== null) updates.targetRevenueMin = data.revenueMin;
      if (data.revenueMax !== undefined && data.revenueMax !== null) updates.targetRevenueMax = data.revenueMax;
      if (data.totalFundingMin !== undefined && data.totalFundingMin !== null) updates.totalFundingMin = data.totalFundingMin;
      if (data.totalFundingMax !== undefined && data.totalFundingMax !== null) updates.totalFundingMax = data.totalFundingMax;
      if (data.fundingRecencyDays !== undefined && data.fundingRecencyDays !== null) updates.fundingRecencyDays = data.fundingRecencyDays;
      if (data.minJobOpenings !== undefined && data.minJobOpenings !== null) updates.minJobOpenings = data.minJobOpenings;
    }
    // aiTone is identity, not targeting — always honored when provided.
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

  // Phase 1 (_specs/icp-unification R5.4): the ICP step also creates /
  // updates the tenant's rank-1 ICP profile, so the unified ICP page is
  // never empty and the profile — not the flats — is the targeting
  // source of truth from day 1. The helper re-mirrors the flats from
  // the same uiState (idempotent with the updates written above).
  if (data.step === "icp") {
    // Same anti-wipe gate as the flats above: upsertRankOneProfileFromUiState
    // REPLACES the guided-slot criteria, so an all-empty uiState would strip a
    // populated profile. icpHasAnyTargeting keeps the profile and the flats
    // consistent.
    if (icpHasAnyTargeting) {
      try {
        await upsertRankOneProfileFromUiState({
          tenantId: authCtx.tenantId,
          appUserId: authCtx.appUserId,
          name: "Default",
          uiState: {
            ...EMPTY_UI_STATE,
            importance: {},
            industries: strs(data.industries),
            companySizes: strs(data.companySizes),
            geographies: strs(data.geographies),
            seniorities: strs(data.targetSeniorities),
            keywords: strs(data.keywords),
            technologies: strs(data.technologies),
            hiringTitles: strs(data.hiringTitles),
            revenueMin: num(data.revenueMin),
            revenueMax: num(data.revenueMax),
            totalFundingMin: num(data.totalFundingMin),
            totalFundingMax: num(data.totalFundingMax),
            minJobOpenings: num(data.minJobOpenings),
          },
          sourcingFilters: {
            excludeGeographies: strs(data.excludeGeographies),
            fundingRecencyDays: num(data.fundingRecencyDays),
          },
        });
      } catch (err) {
        // Never fail the onboarding save over the profile — the flats are
        // already written; the profile can be (re)created from
        // /settings/icp later.
        logger.error("onboarding.icp_profile_upsert_failed", {
          tenantId: authCtx.tenantId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

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

    // Seed Knowledge base from onboarding data (product, ICP, company context).
    // Non-blocking, idempotent — safe to re-run on re-completion.
    import("@/lib/knowledge/seed-from-onboarding")
      .then((m) => m.seedKnowledgeFromOnboarding(authCtx.tenantId, authCtx.userId))
      .catch((err) =>
        logger.warn("onboarding/save: knowledge seeding failed", { err })
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
