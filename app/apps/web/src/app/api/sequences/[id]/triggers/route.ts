/**
 * Sequence trigger config — `/api/sequences/[id]/triggers`
 * (P0-2 follow-up).
 *
 * GET — returns the current `triggerSignalTypes` from
 *       `sequences.campaignConfig` for this sequence + the catalog
 *       of known types so the UI can render a checkbox per type.
 * PUT — replaces the trigger array. Validates each type against the
 *       canonical list ; unknown types are rejected with 400.
 *
 * Tenant-scoped : the sequence must belong to the caller's tenant.
 * Mutations require admin role to avoid a non-admin team member
 * accidentally muting auto-enrollment for the whole tenant.
 */

import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { sequences } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  KNOWN_SIGNAL_TYPES,
  readTriggerConfig,
  writeTriggerConfig,
} from "@/lib/sequences/triggers";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const [seq] = await db
    .select({
      id: sequences.id,
      name: sequences.name,
      campaignConfig: sequences.campaignConfig,
    })
    .from(sequences)
    .where(and(eq(sequences.id, id), eq(sequences.tenantId, authCtx.tenantId)))
    .limit(1);

  if (!seq) {
    return Response.json({ error: "Sequence not found" }, { status: 404 });
  }

  const config = readTriggerConfig(
    seq.campaignConfig as Record<string, unknown> | null,
  );

  return Response.json({
    sequenceId: seq.id,
    name: seq.name,
    triggerSignalTypes: config.triggerSignalTypes,
    knownSignalTypes: KNOWN_SIGNAL_TYPES,
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const { id } = await params;

  let body: { triggerSignalTypes?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.triggerSignalTypes)) {
    return Response.json(
      { error: "triggerSignalTypes must be an array of strings" },
      { status: 400 },
    );
  }
  // Reject unknown types EXPLICITLY rather than silently dropping —
  // a typo'd type would otherwise look "saved" and never fire.
  const KNOWN_SET: ReadonlySet<string> = new Set(KNOWN_SIGNAL_TYPES);
  const unknown: string[] = [];
  for (const v of body.triggerSignalTypes) {
    if (typeof v !== "string") {
      return Response.json(
        { error: "triggerSignalTypes must contain only strings" },
        { status: 400 },
      );
    }
    if (!KNOWN_SET.has(v)) unknown.push(v);
  }
  if (unknown.length > 0) {
    return Response.json(
      {
        error: `Unknown signal types : ${unknown.join(", ")}`,
        knownSignalTypes: KNOWN_SIGNAL_TYPES,
      },
      { status: 400 },
    );
  }

  // Load + merge so we don't trample other campaignConfig keys.
  const [existing] = await db
    .select({ campaignConfig: sequences.campaignConfig })
    .from(sequences)
    .where(and(eq(sequences.id, id), eq(sequences.tenantId, authCtx.tenantId)))
    .limit(1);

  if (!existing) {
    return Response.json({ error: "Sequence not found" }, { status: 404 });
  }

  const next = writeTriggerConfig(
    existing.campaignConfig as Record<string, unknown> | null,
    body.triggerSignalTypes as string[],
  );

  await db
    .update(sequences)
    .set({ campaignConfig: next, updatedAt: new Date() })
    .where(and(eq(sequences.id, id), eq(sequences.tenantId, authCtx.tenantId)));

  const config = readTriggerConfig(next);
  return Response.json({
    sequenceId: id,
    triggerSignalTypes: config.triggerSignalTypes,
  });
}
