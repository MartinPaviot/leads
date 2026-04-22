import { NextResponse } from "next/server";
import { getAuthContext, requireAdmin } from "@/lib/auth-utils";
import { invalidateNegative } from "@/lib/logo/cache";

export async function DELETE(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = requireAdmin(authCtx);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain");
  if (!domain) {
    return NextResponse.json(
      { error: "domain query parameter required" },
      { status: 400 },
    );
  }

  await invalidateNegative(domain);
  return NextResponse.json({ ok: true, domain });
}
