import { getAuthContext } from "@/lib/auth/auth-utils";
import { listThreadNotes, addThreadNote, deleteThreadNote } from "@/lib/inbox/note-store";
import { normalizeNoteContent } from "@/lib/inbox/notes";

/**
 * Private thread notes (INBOX-X06). All owner-scoped to the signed-in author.
 *   GET    /api/inbox/notes?key=<conversationKey>     → the author's notes on the thread
 *   POST   /api/inbox/notes { key, content }          → add a note
 *   DELETE /api/inbox/notes?id=<noteId>               → soft-delete the author's note
 * Internal-only: never sent, never ingested into the AI context graph.
 */
export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const key = new URL(req.url, "http://localhost").searchParams.get("key");
  if (!key) return Response.json({ error: "key required" }, { status: 400 });
  try {
    return Response.json({ notes: await listThreadNotes(authCtx.tenantId, authCtx.appUserId, key) });
  } catch (error) {
    console.error("Failed to load thread notes:", error);
    return Response.json({ notes: [] });
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as { key?: string; content?: unknown };
    const content = normalizeNoteContent(body.content);
    if (!body.key) return Response.json({ error: "key required" }, { status: 400 });
    if (!content) return Response.json({ error: "content required" }, { status: 400 });
    const note = await addThreadNote(authCtx.tenantId, authCtx.appUserId, body.key, content);
    return Response.json({ note }, { status: 201 });
  } catch (error) {
    console.error("Failed to add thread note:", error);
    return Response.json({ error: "Failed to add note" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url, "http://localhost").searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  try {
    await deleteThreadNote(authCtx.tenantId, authCtx.appUserId, id);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete thread note:", error);
    return Response.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
