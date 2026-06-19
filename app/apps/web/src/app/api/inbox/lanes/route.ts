/**
 * Smart-lane CRUD (INBOX-T01). Owner-scoped; persists to the user_preferences
 * JSONB store (no migration). A lane is a saved query (clauses + AND/OR), so an
 * empty-clause lane is rejected (it would match everything).
 */
import { getAuthContext } from "@/lib/auth/auth-utils";
import { getUserLanes, saveUserLanes, type InboxLane } from "@/lib/inbox/lane-store";
import { z } from "zod";

const clauseSchema = z.object({
  field: z.enum(["from", "to", "cc", "subject", "mailbox"]),
  op: z.enum(["contains", "is", "domain"]),
  value: z.string().min(1),
  negate: z.boolean().optional(),
});

const laneSchema = z.object({
  name: z.string().min(1).max(60),
  clauses: z.array(clauseSchema).min(1, "a lane needs at least one clause"),
  join: z.enum(["and", "or"]),
  aiLabelIds: z.array(z.string()).optional(),
  hideWhenEmpty: z.boolean().optional(),
});

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ lanes: await getUserLanes(ctx.userId) });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body: z.infer<typeof laneSchema>;
  try {
    body = laneSchema.parse(await req.json());
  } catch (e) {
    return Response.json(
      { error: e instanceof z.ZodError ? e.issues[0]?.message : "Invalid body" },
      { status: 422 },
    );
  }
  const lanes = await getUserLanes(ctx.userId);
  const lane: InboxLane = { id: crypto.randomUUID(), ...body };
  lanes.push(lane);
  await saveUserLanes(ctx.userId, lanes);
  return Response.json({ lane }, { status: 201 });
}

export async function PATCH(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body: z.infer<ReturnType<typeof laneSchema.partial>> & { id: string };
  try {
    body = laneSchema.partial().extend({ id: z.string().min(1) }).parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 422 });
  }
  const lanes = await getUserLanes(ctx.userId);
  const idx = lanes.findIndex((l) => l.id === body.id);
  if (idx < 0) return Response.json({ error: "Lane not found" }, { status: 404 });
  lanes[idx] = { ...lanes[idx], ...body };
  await saveUserLanes(ctx.userId, lanes);
  return Response.json({ lane: lanes[idx] });
}

export async function DELETE(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 422 });
  const lanes = (await getUserLanes(ctx.userId)).filter((l) => l.id !== id);
  await saveUserLanes(ctx.userId, lanes);
  return Response.json({ ok: true });
}
