import type { AutonomyLevel, PermissionsMap, PermissionValue, AutonomyConfig, GuardrailsConfig, BrandConfig, ActionType } from "./types";

export const LEVEL_DEFAULTS: Record<AutonomyLevel, PermissionsMap> = {
  copilot: {
    coldEmailSend: "manual",
    replyPositive: "manual",
    replyObjection: "manual",
    replyNegative: "auto_stop",
    warmIntroSend: "manual",
    linkedInActions: "draft_only",
    newProspectAdd: "manual",
    strategySwitch: "ask",
    sequencePause: "ask",
  },
  guided: {
    coldEmailSend: "delayed",
    replyPositive: "delayed",
    replyObjection: "manual",
    replyNegative: "auto_stop",
    warmIntroSend: "manual",
    linkedInActions: "draft_only",
    newProspectAdd: "manual",
    strategySwitch: "auto_with_log",
    sequencePause: "auto_with_notification",
  },
  autonomous: {
    coldEmailSend: "auto",
    replyPositive: "auto",
    replyObjection: "auto",
    replyNegative: "auto_stop",
    warmIntroSend: "auto_if_preapproved",
    linkedInActions: "draft_only",
    newProspectAdd: "auto_if_icp_match",
    strategySwitch: "auto_with_log",
    sequencePause: "auto_with_notification",
  },
  strategic: {
    coldEmailSend: "auto",
    replyPositive: "auto",
    replyObjection: "auto",
    replyNegative: "auto_stop",
    warmIntroSend: "auto_if_preapproved",
    linkedInActions: "auto",
    newProspectAdd: "auto_if_icp_match",
    strategySwitch: "auto_with_log",
    sequencePause: "auto_with_log",
  },
};

export const DEFAULT_GUARDRAILS: GuardrailsConfig = {
  maxEmailsPerDay: 40,
  maxNewProspectsPerWeek: 25,
  maxEmailsPerProspect: 5,
  maxEmailsPerProspectDays: 21,
  neverContact: [],
  alwaysEscalateWhen: [],
  sendWindow: { start: "08:00", end: "18:00", days: ["mon", "tue", "wed", "thu", "fri"], timezone: "recipient" },
  language: "auto",
  maxDailySpend: 5.0,
};

export const DEFAULT_BRAND: BrandConfig = {
  writingStyle: "Direct and concise",
  forbiddenWords: [],
  signatureTemplate: "",
  formalityLevel: "match_prospect",
};

export function buildDefaultConfig(level: AutonomyLevel = "copilot"): AutonomyConfig {
  return {
    level,
    permissions: { ...LEVEL_DEFAULTS[level] },
    guardrails: { ...DEFAULT_GUARDRAILS },
    brand: { ...DEFAULT_BRAND },
  };
}

export function mergeAutonomyConfig(
  level: AutonomyLevel,
  permissionOverrides?: Partial<PermissionsMap>,
  guardrailOverrides?: Partial<GuardrailsConfig>,
  brandOverrides?: Partial<BrandConfig>
): AutonomyConfig {
  return {
    level,
    permissions: { ...LEVEL_DEFAULTS[level], ...permissionOverrides },
    guardrails: { ...DEFAULT_GUARDRAILS, ...guardrailOverrides },
    brand: { ...DEFAULT_BRAND, ...brandOverrides },
  };
}

export function getEffectivePermission(
  actionType: ActionType,
  config: AutonomyConfig
): PermissionValue {
  return config.permissions[actionType] || LEVEL_DEFAULTS[config.level][actionType] || "manual";
}

export const DELAY_BY_ACTION: Partial<Record<ActionType, number>> = {
  coldEmailSend: 2 * 60 * 60 * 1000, // 2 hours
  replyPositive: 1 * 60 * 60 * 1000,  // 1 hour
  replyObjection: 1 * 60 * 60 * 1000,
};
