import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Typed tenant settings — single source of truth for the settings JSONB schema.
 * Every key that goes into tenants.settings MUST be defined here.
 */
export interface TenantSettings {
  // ── Onboarding profile ──
  onboardingFullName?: string;
  onboardingCompanyName?: string;
  companyDomain?: string;
  onboardingRole?: string;
  onboardingCompleted?: boolean;
  onboardingCompletedAt?: string;

  // ── Product context ──
  productDescription?: string;
  salesMotion?: string;
  aiTone?: string;
  primaryChallenge?: string;

  // ── ICP (Ideal Customer Profile) ──
  targetIndustries?: string[];
  targetCompanySizes?: string[];
  targetRoles?: string;
  targetGeographies?: string[];

  // ── Email provider ──
  emailProvider?: string;

  // ── Custom schema ──
  customFields?: CustomFieldDef[];
  pipelineStages?: PipelineStageDef[];

  // ── Knowledge base ──
  knowledge?: KnowledgeEntry[];

  // ── Agent behavior ──
  agentApprovalMode?: "auto" | "ask" | "manual";

  // ── Custom objects ──
  customObjectTypes?: CustomObjectTypeDef[];

  // ── MCP API keys ──
  mcpApiKeys?: McpApiKeyEntry[];
}

export interface McpApiKeyEntry {
  id: string;
  name: string;
  /** The hashed key (bcrypt). Only stored hashed. */
  keyHash: string;
  /** The key prefix for display, e.g. "mcp_a1b2..." */
  keyPrefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface CustomFieldDef {
  id: string;
  name: string;
  entityType: string;
  type: string;
  aiFillMode: string;
  options?: string[];
}

export interface PipelineStageDef {
  name: string;
  category: string;
  description?: string;
  aiFillMode?: string;
}

export interface KnowledgeEntry {
  topic: string;
  content: string;
}

export interface CustomObjectFieldDef {
  id: string;
  name: string;
  type: "text" | "number" | "date" | "select" | "url" | "boolean";
  options?: string[];   // for select type
  required?: boolean;
}

export interface CustomObjectTypeDef {
  id: string;           // slug, e.g. "project"
  name: string;         // plural display, e.g. "Projects"
  nameSingular: string; // singular, e.g. "Project"
  icon: string;         // lucide icon name, e.g. "Folder"
  fields: CustomObjectFieldDef[];
}

// ── Defaults ──

const DEFAULTS: Required<Pick<TenantSettings, "aiTone" | "salesMotion" | "agentApprovalMode">> = {
  aiTone: "Direct",
  salesMotion: "Founder-led sales",
  agentApprovalMode: "auto",
};

// ── Per-request cache ──
// Next.js API routes run in a fresh context per request. A simple Map
// avoids hitting the DB multiple times within the same request when
// several functions (snapshot builder, knowledge loader, approval mode
// checker) all need the same tenant settings.
//
// The cache is scoped to the module — which in serverless/edge is
// effectively per-isolate. Entries auto-expire after 5 s so a long-lived
// server process won't serve stale data across requests.

interface CacheEntry {
  settings: TenantSettings;
  ts: number;
}

const CACHE_TTL_MS = 5_000;
const cache = new Map<string, CacheEntry>();

function getCached(tenantId: string): TenantSettings | null {
  const entry = cache.get(tenantId);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(tenantId);
    return null;
  }
  return entry.settings;
}

function setCache(tenantId: string, settings: TenantSettings): void {
  cache.set(tenantId, { settings, ts: Date.now() });
}

// ── Accessor ──

/** Load typed tenant settings. Cached per-request (5 s TTL). */
export async function getTenantSettings(tenantId: string): Promise<TenantSettings> {
  const cached = getCached(tenantId);
  if (cached) return cached;

  const [tenant] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const raw = (tenant?.settings || {}) as Record<string, unknown>;
  const settings = { ...DEFAULTS, ...raw } as TenantSettings;

  setCache(tenantId, settings);
  return settings;
}

/** Update tenant settings (partial merge). Invalidates cache. */
export async function updateTenantSettings(
  tenantId: string,
  updates: Partial<TenantSettings>
): Promise<void> {
  const current = await getTenantSettings(tenantId);
  const merged = { ...current, ...updates };

  await db
    .update(tenants)
    .set({ settings: merged, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));

  // Invalidate so next read picks up the write
  cache.delete(tenantId);
}

// ── ICP Helpers ──

/** Parse targetCompanySizes into a numeric [min, max] range for scoring. */
export function parseSizeRange(settings: TenantSettings): [number, number] | null {
  const sizes = settings.targetCompanySizes;
  if (!sizes || sizes.length === 0) return null;

  const nums = sizes.flatMap((s) => {
    const clean = String(s).replace(/,/g, "").replace("+", "");
    return clean.split("-").map(Number).filter((n) => !isNaN(n));
  });
  if (nums.length === 0) return null;
  return [Math.min(...nums), Math.max(...nums)];
}

/** Parse targetRoles free text into lowercase keywords for matching. */
export function parseRoleKeywords(settings: TenantSettings): string[] {
  const raw = settings.targetRoles || "";
  return raw
    .split(/[,;]/)
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
}

/** Get pipeline stage names, or defaults. */
export function getStageNames(settings: TenantSettings): string {
  if (settings.pipelineStages && settings.pipelineStages.length > 0) {
    return settings.pipelineStages.map((s) => s.name).join(", ");
  }
  return "lead, qualification, demo, trial, proposal, negotiation, won, lost";
}
