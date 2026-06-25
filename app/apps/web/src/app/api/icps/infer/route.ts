/**
 * POST /api/icps/infer
 *
 * AI proposes candidate ICPs from the tenant's product description +
 * best customers, mapped onto the field catalog. Returns candidates
 * un-persisted + a per-candidate validity flag (each is run through
 * validateIcpInput so the UI can grey out anything the model got
 * wrong). The founder reviews + POSTs the keepers via /api/icps.
 *
 * Body (all optional — falls back to tenant settings):
 *   { productDescription?, salesMotion?, bestCustomers?: string[] }
 */

import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { resolveCatalogRows, resolveCatalogForValidation } from "@/lib/icp/catalog-db";
import {
  buildInferencePrompt,
  inferenceResponseSchema,
} from "@/lib/icp/inference-prompt";
import { validateIcpInput } from "@/lib/icp/validation";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-haiku-4-5-20251001")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;
  if (!model) {
    return Response.json({ error: "No LLM API key configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    productDescription?: string;
    salesMotion?: string;
    bestCustomers?: string[];
  };

  const settings = await getTenantSettings(authCtx.tenantId);
  const catalog = await resolveCatalogRows(authCtx.tenantId);

  const prompt = buildInferencePrompt({
    productDescription: body.productDescription ?? settings.productDescription,
    salesMotion: body.salesMotion ?? settings.salesMotion,
    bestCustomers: body.bestCustomers ?? [],
    catalog,
  });

  let proposed;
  try {
    const { object } = await tracedGenerateObject({
      model,
      schema: inferenceResponseSchema,
      prompt,
      _trace: {
        agentId: "icp-inference",
        tenantId: authCtx.tenantId,
        inputPreview: "Propose candidate ICPs from product + catalog",
      },
    });
    proposed = object;
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Inference failed" },
      { status: 502 },
    );
  }

  // Validate each candidate against the catalog so the UI can flag the
  // ones the model got wrong (and the user can fix before persisting).
  const validationCatalog = await resolveCatalogForValidation(authCtx.tenantId);
  const candidates = proposed.icps.map((icp: (typeof proposed.icps)[number]) => {
    const result = validateIcpInput(icp, validationCatalog);
    return {
      ...icp,
      valid: result.ok,
      validationError: result.ok ? null : result.error,
    };
  });

  return Response.json({ candidates });
}
