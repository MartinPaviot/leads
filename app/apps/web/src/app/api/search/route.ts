import { auth } from "@/auth";
import { searchSimilar } from "@/lib/embeddings";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { query, limit } = body;

    if (!query || typeof query !== "string") {
      return Response.json({ error: "Query is required" }, { status: 400 });
    }

    const results = await searchSimilar(query, limit || 5);

    return Response.json({ results });
  } catch (error) {
    console.error("Search failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: `Search failed: ${message}` }, { status: 500 });
  }
}
