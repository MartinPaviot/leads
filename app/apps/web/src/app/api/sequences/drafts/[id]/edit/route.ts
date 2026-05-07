/**
 * POST /api/sequences/drafts/[id]/edit
 *
 * P0-1 task 1.2 — edit content while keeping status pending_approval.
 *
 * Body : { subject?, bodyHtml?, bodyText?, version? }
 * Response : { draft }
 *
 * Edit doesn't transition the lifecycle — the draft stays
 * `pending_approval`. Status check via `canTransition` rejects edits
 * on terminal / approved drafts (would race with sender worker).
 *
 * Optimistic locking : version stamp check. Edit increments version.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { sequenceDrafts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { canTransition } from "@/lib/sequence-drafts/state-machine";

const MAX_SUBJECT_LEN = 998; // RFC 5322 line-length-friendly cap
const MAX_BODY_LEN = 200_000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: {
    subject?: string;
    bodyHtml?: string;
    bodyText?: string;
    version?: number;
  } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  // At least one field must be provided.
  if (
    body.subject === undefined &&
    body.bodyHtml === undefined &&
    body.bodyText === undefined
  ) {
    return Response.json(
      { error: "Provide at least one of: subject, bodyHtml, bodyText" },
      { status: 400 },
    );
  }

  // Length validation per field.
  if (body.subject !== undefined) {
    if (typeof body.subject !== "string" || body.subject.length === 0) {
      return Response.json({ error: "Subject must be non-empty string" }, { status: 400 });
    }
    if (body.subject.length > MAX_SUBJECT_LEN) {
      return Response.json(
        { error: `Subject too long (max ${MAX_SUBJECT_LEN})` },
        { status: 400 },
      );
    }
  }
  if (body.bodyHtml !== undefined) {
    if (typeof body.bodyHtml !== "string") {
      return Response.json({ error: "bodyHtml must be string" }, { status: 400 });
    }
    if (body.bodyHtml.length > MAX_BODY_LEN) {
      return Response.json(
        { error: `bodyHtml too long (max ${MAX_BODY_LEN})` },
        { status: 400 },
      );
    }
  }
  if (body.bodyText !== undefined) {
    if (typeof body.bodyText !== "string") {
      return Response.json({ error: "bodyText must be string" }, { status: 400 });
    }
    if (body.bodyText.length > MAX_BODY_LEN) {
      return Response.json(
        { error: `bodyText too long (max ${MAX_BODY_LEN})` },
        { status: 400 },
      );
    }
  }

  const [draft] = await db
    .select()
    .from(sequenceDrafts)
    .where(
      and(
        eq(sequenceDrafts.id, id),
        eq(sequenceDrafts.tenantId, authCtx.tenantId),
      ),
    )
    .limit(1);

  if (!draft) {
    return Response.json({ error: "Draft not found" }, { status: 404 });
  }

  const transition = canTransition(draft.status as never, "edit");
  if (!transition.allowed) {
    return Response.json({ error: transition.reason }, { status: 409 });
  }

  if (typeof body.version === "number" && body.version !== draft.version) {
    return Response.json(
      { error: "Version mismatch", currentVersion: draft.version },
      { status: 409 },
    );
  }

  const setExpr: Partial<typeof sequenceDrafts.$inferInsert> = {
    version: draft.version + 1,
    updatedAt: new Date(),
  };
  if (body.subject !== undefined) setExpr.subject = body.subject;
  if (body.bodyHtml !== undefined) setExpr.bodyHtml = body.bodyHtml;
  if (body.bodyText !== undefined) setExpr.bodyText = body.bodyText;

  const updated = await db
    .update(sequenceDrafts)
    .set(setExpr)
    .where(
      and(
        eq(sequenceDrafts.id, id),
        eq(sequenceDrafts.tenantId, authCtx.tenantId),
        eq(sequenceDrafts.version, draft.version),
      ),
    )
    .returning();

  if (updated.length === 0) {
    return Response.json(
      { error: "Concurrent update detected", currentVersion: draft.version },
      { status: 409 },
    );
  }

  return Response.json({ draft: updated[0] });
}
