/**
 * Inbox filter CRUD (INBOX-T02 deterministic filters). Owner-scoped; persists to
 * the user_preferences JSONB store (no migration). A filter is a saved query
 * (clauses + AND/OR) + an action (label / star / archive); an empty-clause filter
 * is rejected. The LLM-prompt classifier + the live-preview UI are residual.
 */
import { getAuthContext } from "@/lib/auth/auth-utils";
import { getUserFilters, saveUserFilters } from "@/lib/inbox/filter-store";
import type { LabelFilter } from "@/lib/inbox/filter-match";
import { z } from "zod";

const clauseSchema = z.object({
  field: z.enum(["from", "to", "cc", "subject", "mailbox"]),
  op: z.enum(["contains", "is", "domain"]),
  value: z.string().min(1),
  negate: z.boolean().optional(),
});

const filterSchema = z.object({
  name: z.string().min(1).max(60),
  clauses: z.array(clauseSchema).min(1, "a filter needs at least one clause"),
  join: z.enum(["and", "or"]),
  action: z.enum(["label", "star", "archive"]),
  label: z.string().max(40).optional(),
});

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ filters: await getUserFilters(ctx.userId) });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body: z.infer<typeof filterSchema>;
  try {
    body = filterSchema.parse(await req.json());
  } catch (e) {
    return Response.json(
      { error: e instanceof z.ZodError ? e.issues[0]?.message : "Invalid body" },
      { status: 422 },
    );
  }
  const filters = await getUserFilters(ctx.userId);
  const filter: LabelFilter = { id: crypto.randomUUID(), ...body };
  filters.push(filter);
  await saveUserFilters(ctx.userId, filters);
  return Response.json({ filter }, { status: 201 });
}

export async function PATCH(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body: z.infer<ReturnType<typeof filterSchema.partial>> & { id: string };
  try {
    body = filterSchema.partial().extend({ id: z.string().min(1) }).parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 422 });
  }
  const filters = await getUserFilters(ctx.userId);
  const idx = filters.findIndex((f) => f.id === body.id);
  if (idx < 0) return Response.json({ error: "Filter not found" }, { status: 404 });
  filters[idx] = { ...filters[idx], ...body };
  await saveUserFilters(ctx.userId, filters);
  return Response.json({ filter: filters[idx] });
}

export async function DELETE(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 422 });
  const filters = (await getUserFilters(ctx.userId)).filter((f) => f.id !== id);
  await saveUserFilters(ctx.userId, filters);
  return Response.json({ ok: true });
}
