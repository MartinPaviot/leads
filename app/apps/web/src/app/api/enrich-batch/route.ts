import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { inngest } from "@/inngest/client";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { companyIds } = await req.json();
  if (!Array.isArray(companyIds) || companyIds.length === 0) {
    return NextResponse.json({ error: "companyIds required" }, { status: 400 });
  }

  await inngest.send({
    name: "company/enrich-batch",
    data: { companyIds, tenantId: authCtx.tenantId },
  });

  return NextResponse.json({ queued: companyIds.length });
}
