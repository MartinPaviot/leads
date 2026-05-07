import { getAuthContext } from "@/lib/auth/auth-utils";
import { inngest } from "@/inngest/client";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { type, schedule } = body as { type: string; schedule: string };

    if (!type || !["pipeline", "weekly", "winloss"].includes(type)) {
      return Response.json(
        { error: 'Invalid type. Must be "pipeline", "weekly", or "winloss".' },
        { status: 400 }
      );
    }

    if (schedule !== "weekly") {
      return Response.json(
        { error: 'Only "weekly" schedule is supported.' },
        { status: 400 }
      );
    }

    // Send an event to Inngest to schedule a recurring report generation
    await inngest.send({
      name: "reports/schedule.requested",
      data: {
        tenantId: authCtx.tenantId,
        userId: authCtx.userId,
        reportType: type,
        schedule,
      },
    });

    return Response.json({
      success: true,
      message: `${type} report scheduled to run weekly. You will receive it every Monday at 8:00 AM.`,
    });
  } catch (error) {
    console.error("Report scheduling failed:", error);
    return Response.json({ error: "Failed to schedule report" }, { status: 500 });
  }
}
