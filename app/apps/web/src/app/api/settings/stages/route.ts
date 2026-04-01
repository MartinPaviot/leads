import { auth } from "@/auth";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";

interface PipelineStage {
  id: string;
  name: string;
  description: string;
  category: "in_progress" | "done";
}

const DEFAULT_STAGES: PipelineStage[] = [
  { id: "lead", name: "Lead", description: "Initial contact with a potential prospect", category: "in_progress" },
  { id: "qualification", name: "Qualification", description: "Initial meeting booked", category: "in_progress" },
  { id: "demo", name: "Demo", description: "Demo scheduled", category: "in_progress" },
  { id: "trial", name: "Trial", description: "Prospect expressed interest in trial", category: "in_progress" },
  { id: "proposal", name: "Proposal", description: "Prospect is ready to work through terms", category: "in_progress" },
  { id: "negotiation", name: "Negotiation", description: "Negotiating contract terms", category: "in_progress" },
  { id: "won", name: "Won", description: "Agreement signed", category: "done" },
  { id: "lost", name: "Lost", description: "Deal lost", category: "done" },
];

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, "default")).limit(1);
    const settings = (tenant?.settings || {}) as Record<string, unknown>;
    const stages = (settings.pipelineStages as PipelineStage[]) || DEFAULT_STAGES;
    return Response.json({ stages });
  } catch (error) {
    console.error("Failed to fetch stages:", error);
    return Response.json({ error: "Failed to fetch stages" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { stages } = body;

    if (!stages || !Array.isArray(stages)) {
      return Response.json({ error: "stages array required" }, { status: 400 });
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, "default")).limit(1);
    if (!tenant) return Response.json({ error: "Not found" }, { status: 404 });

    const settings = (tenant.settings || {}) as Record<string, unknown>;
    await db.update(tenants).set({
      settings: { ...settings, pipelineStages: stages },
      updatedAt: new Date(),
    }).where(eq(tenants.id, "default"));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to update stages:", error);
    return Response.json({ error: "Failed to update stages" }, { status: 500 });
  }
}
