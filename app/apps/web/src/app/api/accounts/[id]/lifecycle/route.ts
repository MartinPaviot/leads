import { auth } from "@/auth";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { eq } from "drizzle-orm";

const LIFECYCLE_STAGES = [
  "New",
  "Prospecting",
  "Opportunity",
  "Customer",
  "Disqualified",
  "Inbound",
  "Nurture",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const LIFECYCLE_COLORS: Record<LifecycleStage, string> = {
  New: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  Prospecting: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Opportunity: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Customer: "bg-green-500/20 text-green-400 border-green-500/30",
  Disqualified: "bg-red-500/20 text-red-400 border-red-500/30",
  Inbound: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  Nurture: "bg-teal-500/20 text-teal-400 border-teal-500/30",
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { stage } = body;

    if (!stage || !LIFECYCLE_STAGES.includes(stage)) {
      return Response.json(
        {
          error: "Invalid lifecycle stage",
          validStages: LIFECYCLE_STAGES,
        },
        { status: 400 }
      );
    }

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    if (!company) {
      return Response.json({ error: "Account not found" }, { status: 404 });
    }

    const currentProperties = (company.properties || {}) as Record<
      string,
      unknown
    >;
    const updatedProperties = {
      ...currentProperties,
      lifecycle: stage,
    };

    await db
      .update(companies)
      .set({ properties: updatedProperties, updatedAt: new Date() })
      .where(eq(companies.id, id));

    return Response.json({
      success: true,
      stage,
      colors: LIFECYCLE_COLORS[stage as LifecycleStage],
    });
  } catch (error) {
    console.error("Failed to update lifecycle stage:", error);
    return Response.json(
      { error: "Failed to update lifecycle stage" },
      { status: 500 }
    );
  }
}
