import { getAuthContext } from "@/lib/auth/auth-utils";
import { searchHybrid } from "@/lib/ai/embeddings";
import { buildConversations } from "@/lib/inbox/conversations";
import { loadConversationRows } from "@/lib/inbox/load";
import { getInboxScope, scopeConversationRows } from "@/lib/inbox/user-scope";
import { rankConversationsBySemantic, type SemanticHit } from "@/lib/inbox/semantic-search";

/**
 * GET /api/inbox/search?q=<query>  (INBOX-Q01) — meaning-ranked inbox search.
 *
 * Runs the existing hybrid retriever (pgvector + BM25 + RRF) over the embeddings
 * captured at email ingest, maps the hits back to the viewer's own conversations
 * (owner-scoped) and ranks them by fused score. Degrades to `degraded:true` (the
 * UI falls back to the keyword filter, Q04) when no embedding provider is set.
 */
export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const q = (new URL(req.url, "http://localhost").searchParams.get("q") || "").trim();
  if (!q) return Response.json({ results: [], degraded: false });

  // Hybrid retrieval. Throws when OPENAI_API_KEY is absent → signal a graceful
  // keyword fallback rather than an error.
  let hits: SemanticHit[];
  try {
    const raw = await searchHybrid(q.slice(0, 500), 40, authCtx.tenantId);
    hits = raw.map((r) => ({ entityId: r.entityId, score: r.score }));
  } catch {
    return Response.json({ results: [], degraded: true });
  }

  try {
    const scope = await getInboxScope(authCtx.tenantId, authCtx.userId);
    const rows = scopeConversationRows(await loadConversationRows(authCtx.tenantId), scope);
    const convs = buildConversations(rows).map((c) => ({
      key: c.key,
      subject: c.subject,
      contactId: c.contactId,
      snippet: c.snippet,
    }));
    return Response.json({ results: rankConversationsBySemantic(convs, hits), degraded: false });
  } catch (error) {
    console.error("Inbox semantic search failed:", error);
    return Response.json({ results: [], degraded: true });
  }
}
