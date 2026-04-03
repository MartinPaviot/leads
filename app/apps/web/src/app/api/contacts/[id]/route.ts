import { db } from "@/db";
import { contacts } from "@/db/schema";
import { getAuthContext } from "@/lib/auth-utils";
import { eq, and, sql } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId)))
      .limit(1);

    if (!contact) {
      return Response.json({ error: "Contact not found" }, { status: 404 });
    }

    return Response.json({ contact });
  } catch (error) {
    console.error("Failed to fetch contact:", error);
    return Response.json({ error: "Failed to fetch contact" }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Verify the contact belongs to this tenant
    const [existing] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId)))
      .limit(1);

    if (!existing) {
      return Response.json({ error: "Contact not found" }, { status: 404 });
    }

    const body = await req.json();
    const {
      firstName,
      lastName,
      email,
      title,
      phone,
      companyId,
      linkedinUrl,
      additionalEmails,
      additionalCompanyIds,
    } = body;

    // Merge properties: preserve existing properties, update multi-value fields
    const existingProps = (existing.properties || {}) as Record<string, unknown>;
    const updatedProps: Record<string, unknown> = { ...existingProps };

    if (additionalEmails !== undefined) {
      const primaryEmail = (email ?? existing.email)?.trim().toLowerCase();
      updatedProps.additionalEmails = Array.isArray(additionalEmails)
        ? additionalEmails
            .map((e: string) => e.trim().toLowerCase())
            .filter((e: string) => e && e !== primaryEmail)
        : [];
    }

    if (additionalCompanyIds !== undefined) {
      const primaryCompany = companyId ?? existing.companyId;
      updatedProps.additionalCompanyIds = Array.isArray(additionalCompanyIds)
        ? additionalCompanyIds.filter((cid: string) => cid && cid !== primaryCompany)
        : [];
    }

    const updates: Record<string, unknown> = {
      properties: updatedProps,
      updatedAt: new Date(),
    };

    // Only update fields that are explicitly provided
    if (firstName !== undefined) updates.firstName = firstName?.trim() || null;
    if (lastName !== undefined) updates.lastName = lastName?.trim() || null;
    if (email !== undefined) updates.email = email?.trim()?.toLowerCase() || null;
    if (title !== undefined) updates.title = title?.trim() || null;
    if (phone !== undefined) updates.phone = phone?.trim() || null;
    if (companyId !== undefined) updates.companyId = companyId || null;
    if (linkedinUrl !== undefined) updates.linkedinUrl = linkedinUrl?.trim() || null;

    const [updated] = await db
      .update(contacts)
      .set(updates)
      .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId)))
      .returning();

    return Response.json({ contact: updated });
  } catch (error) {
    console.error("Failed to update contact:", error);
    return Response.json({ error: "Failed to update contact" }, { status: 500 });
  }
}
