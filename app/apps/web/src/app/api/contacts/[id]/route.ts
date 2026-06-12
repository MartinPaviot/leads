import { db } from "@/db";
import { contacts, activities, sequenceEnrollments } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { requirePermission } from "@/lib/auth/permissions";
import { eq, and, sql, isNull } from "drizzle-orm";
import { logAudit } from "@/lib/infra/audit-log";
import { suppressContacts } from "@/lib/accounts/suppression";
import { cascadeSoftDeleteContact, CONTACT_CASCADE_TYPES, type ContactCascadeType } from "@/lib/contacts/cascade-delete";
import { ROLE_OBSOLETE_KEY } from "@/lib/contacts/role-status";

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
      .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)))
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
    // Verify the contact belongs to this tenant and is not soft-deleted
    const [existing] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)))
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
      ownerId,
      additionalEmails,
      additionalCompanyIds,
      roleObsolete,
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

    // Honest freshness: mark/clear "left this role". Sets a jsonb timestamp
    // that drops the contact from call lists and strikes the title on the
    // fiche, without deleting the record (reversible, may have a new role).
    if (roleObsolete !== undefined) {
      if (roleObsolete) {
        updatedProps[ROLE_OBSOLETE_KEY] = new Date().toISOString();
      } else {
        delete updatedProps[ROLE_OBSOLETE_KEY];
      }
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
    if (ownerId !== undefined) updates.ownerId = ownerId || null;

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

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const denied = requirePermission(authCtx.role, "contacts:delete");
  if (denied) return denied;

  const { id } = await params;

  // Optional cascade: also soft-delete selected related sets (the delete modal
  // sends the checked types). Body is absent for a plain contact delete.
  const body = (await req.json().catch(() => ({}))) as { cascade?: unknown };
  const cascade: ContactCascadeType[] = Array.isArray(body.cascade)
    ? body.cascade.filter(
        (t): t is ContactCascadeType => typeof t === "string" && (CONTACT_CASCADE_TYPES as readonly string[]).includes(t),
      )
    : [];

  try {
    // Verify the contact exists, belongs to this tenant, and is not already deleted
    const [existing] = await db
      .select({ id: contacts.id, email: contacts.email, firstName: contacts.firstName, lastName: contacts.lastName, linkedinUrl: contacts.linkedinUrl })
      .from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)))
      .limit(1);

    if (!existing) {
      return Response.json({ error: "Contact not found" }, { status: 404 });
    }

    // Check for active sequence enrollments — warn but don't block
    const [activeEnrollment] = await db
      .select({ id: sequenceEnrollments.id })
      .from(sequenceEnrollments)
      .where(
        and(
          eq(sequenceEnrollments.contactId, id),
          eq(sequenceEnrollments.status, "active"),
        ),
      )
      .limit(1);

    if (activeEnrollment) {
      return Response.json(
        { error: "Contact has active sequence enrollments. Unenroll them first." },
        { status: 409 },
      );
    }

    // Cascade the selected related sets first (soft-delete, recoverable), then
    // the contact itself.
    // One shared timestamp for the contact AND its cascade so a later restore
    // brings back exactly the set deleted together (symmetric cascade-restore).
    const deletedAt = new Date();
    const cascaded = cascade.length
      ? await cascadeSoftDeleteContact(authCtx.tenantId, id, cascade, deletedAt)
      : {};

    await db
      .update(contacts)
      .set({ deletedAt })
      .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)));

    // Durable suppression so the contact is never re-sourced (by email/LinkedIn).
    await suppressContacts({
      tenantId: authCtx.tenantId,
      kind: "deleted",
      reason: "user_deleted",
      createdBy: authCtx.appUserId,
      contacts: [{ id: existing.id, email: existing.email, linkedinUrl: existing.linkedinUrl, firstName: existing.firstName, lastName: existing.lastName }],
    }).catch((e) => console.error("suppressContacts (delete) failed:", e));

    await logAudit({
      tenantId: authCtx.tenantId,
      userId: authCtx.appUserId,
      action: "delete",
      entityType: "contact",
      entityId: id,
      metadata: {
        email: existing.email,
        name: [existing.firstName, existing.lastName].filter(Boolean).join(" "),
        softDeleted: true,
        cascaded,
      },
    });

    return Response.json({ success: true, id, cascaded });
  } catch (error) {
    console.error("Failed to delete contact:", error);
    return Response.json({ error: "Failed to delete contact" }, { status: 500 });
  }
}
