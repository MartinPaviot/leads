import { auth } from "@/auth";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface CustomSignal {
  name: string;
  enabled: boolean;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, "default"))
      .limit(1);

    if (!tenant) {
      return Response.json({ error: "Workspace not found" }, { status: 404 });
    }

    const settings = (tenant.settings || {}) as Record<string, unknown>;
    const customSignals = (settings.customSignals || []) as CustomSignal[];

    return Response.json({ customSignals });
  } catch (error) {
    console.error("Failed to fetch custom signals:", error);
    return Response.json(
      { error: "Failed to fetch custom signals" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { customSignals } = body;

    if (!Array.isArray(customSignals)) {
      return Response.json(
        { error: "customSignals must be an array" },
        { status: 400 }
      );
    }

    for (const signal of customSignals) {
      if (
        !signal.name ||
        typeof signal.name !== "string" ||
        typeof signal.enabled !== "boolean"
      ) {
        return Response.json(
          {
            error:
              "Each signal must have a name (string) and enabled (boolean)",
          },
          { status: 400 }
        );
      }
    }

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, "default"))
      .limit(1);

    if (!tenant) {
      return Response.json({ error: "Workspace not found" }, { status: 404 });
    }

    const currentSettings = (tenant.settings || {}) as Record<string, unknown>;
    const updatedSettings = {
      ...currentSettings,
      customSignals,
    };

    await db
      .update(tenants)
      .set({ settings: updatedSettings, updatedAt: new Date() })
      .where(eq(tenants.id, "default"));

    return Response.json({ success: true, customSignals });
  } catch (error) {
    console.error("Failed to update custom signals:", error);
    return Response.json(
      { error: "Failed to update custom signals" },
      { status: 500 }
    );
  }
}
