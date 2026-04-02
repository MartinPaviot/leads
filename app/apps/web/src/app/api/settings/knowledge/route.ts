import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";

interface KnowledgeTopic {
  id: string;
  topic: string;
  content: string;
}

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, authCtx.tenantId)).limit(1);
    const settings = (tenant?.settings || {}) as Record<string, unknown>;
    return Response.json({ knowledge: (settings.knowledge as KnowledgeTopic[]) || [] });
  } catch (error) {
    console.error("Failed to fetch knowledge:", error);
    return Response.json({ error: "Failed to fetch knowledge" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { topic, content } = body;

    if (!topic?.trim() || !content?.trim()) {
      return Response.json({ error: "Topic and content required" }, { status: 400 });
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, authCtx.tenantId)).limit(1);
    if (!tenant) {
      return Response.json({ error: "Workspace not found" }, { status: 404 });
    }

    const settings = (tenant.settings || {}) as Record<string, unknown>;
    const knowledge = (settings.knowledge as KnowledgeTopic[]) || [];

    const newTopic: KnowledgeTopic = {
      id: crypto.randomUUID(),
      topic: topic.trim(),
      content: content.trim(),
    };

    knowledge.push(newTopic);

    await db.update(tenants).set({
      settings: { ...settings, knowledge },
      updatedAt: new Date(),
    }).where(eq(tenants.id, authCtx.tenantId));

    return Response.json({ topic: newTopic }, { status: 201 });
  } catch (error) {
    console.error("Failed to add knowledge:", error);
    return Response.json({ error: "Failed to add knowledge" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, topic, content } = body;

    if (!id) {
      return Response.json({ error: "Topic ID required" }, { status: 400 });
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, authCtx.tenantId)).limit(1);
    if (!tenant) return Response.json({ error: "Not found" }, { status: 404 });

    const settings = (tenant.settings || {}) as Record<string, unknown>;
    const knowledge = (settings.knowledge as KnowledgeTopic[]) || [];
    const idx = knowledge.findIndex((k) => k.id === id);
    if (idx === -1) return Response.json({ error: "Topic not found" }, { status: 404 });

    if (topic !== undefined) knowledge[idx].topic = topic.trim();
    if (content !== undefined) knowledge[idx].content = content.trim();

    await db.update(tenants).set({
      settings: { ...settings, knowledge },
      updatedAt: new Date(),
    }).where(eq(tenants.id, authCtx.tenantId));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to update knowledge:", error);
    return Response.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return Response.json({ error: "Topic ID required" }, { status: 400 });
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, authCtx.tenantId)).limit(1);
    if (!tenant) return Response.json({ error: "Not found" }, { status: 404 });

    const settings = (tenant.settings || {}) as Record<string, unknown>;
    const knowledge = ((settings.knowledge as KnowledgeTopic[]) || []).filter((k) => k.id !== id);

    await db.update(tenants).set({
      settings: { ...settings, knowledge },
      updatedAt: new Date(),
    }).where(eq(tenants.id, authCtx.tenantId));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to delete knowledge:", error);
    return Response.json({ error: "Failed to delete" }, { status: 500 });
  }
}
