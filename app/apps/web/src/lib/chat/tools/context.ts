import type { AuthContext } from "@/lib/auth/auth-utils";
import type { TenantSettings } from "@/lib/config/tenant-settings";
import type { ApprovalModeV2 } from "@/lib/guardrails/approval-mode";
import { tool } from "ai";
import { z } from "zod";

export interface ToolContext {
  tenantId: string;
  userId: string;
  authCtx: AuthContext;
  settings: TenantSettings;
  /** Canonical v2 approval mode (coerced via readApprovalMode at the route read site). */
  agentApprovalMode: ApprovalModeV2;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeTool<I>(opts: {
  description: string;
  inputSchema: z.ZodType<I>;
  execute: (input: I) => Promise<any>;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tool<I, any>({
    description: opts.description,
    inputSchema: opts.inputSchema,
    execute: opts.execute,
  } as any);
}
