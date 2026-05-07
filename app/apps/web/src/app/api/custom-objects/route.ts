import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import {
  getTenantSettings,
  updateTenantSettings,
  type CustomObjectTypeDef,
} from "@/lib/config/tenant-settings";

/**
 * GET /api/custom-objects
 * List all custom object type definitions for this tenant.
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getTenantSettings(authCtx.tenantId);
    return Response.json({ objectTypes: settings.customObjectTypes || [] });
  } catch (error) {
    console.error("Failed to fetch custom object types:", error);
    return Response.json({ error: "Failed to fetch object types" }, { status: 500 });
  }
}

/**
 * POST /api/custom-objects
 * Create a new custom object type definition.
 * Body: { id, name, nameSingular, icon, fields }
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  try {
    const body = (await req.json()) as CustomObjectTypeDef;

    if (!body.id || !body.name || !body.nameSingular) {
      return Response.json(
        { error: "id, name, and nameSingular are required" },
        { status: 400 }
      );
    }

    // Sanitize the ID to be a safe slug
    const slug = body.id
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    if (!slug) {
      return Response.json({ error: "Invalid id" }, { status: 400 });
    }

    const settings = await getTenantSettings(authCtx.tenantId);
    const existing = settings.customObjectTypes || [];

    if (existing.some((t) => t.id === slug)) {
      return Response.json(
        { error: `Object type "${slug}" already exists` },
        { status: 409 }
      );
    }

    const newType: CustomObjectTypeDef = {
      id: slug,
      name: body.name.trim(),
      nameSingular: body.nameSingular.trim(),
      icon: body.icon || "Box",
      fields: (body.fields || []).map((f) => ({
        id: f.id || crypto.randomUUID(),
        name: f.name,
        type: f.type || "text",
        options: f.options,
        required: f.required || false,
      })),
    };

    await updateTenantSettings(authCtx.tenantId, {
      customObjectTypes: [...existing, newType],
    });

    return Response.json({ objectType: newType }, { status: 201 });
  } catch (error) {
    console.error("Failed to create custom object type:", error);
    return Response.json({ error: "Failed to create object type" }, { status: 500 });
  }
}

/**
 * PUT /api/custom-objects
 * Update an existing custom object type definition.
 * Body: full CustomObjectTypeDef with the id to update.
 */
export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  try {
    const body = (await req.json()) as CustomObjectTypeDef;

    if (!body.id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const settings = await getTenantSettings(authCtx.tenantId);
    const existing = settings.customObjectTypes || [];
    const idx = existing.findIndex((t) => t.id === body.id);

    if (idx === -1) {
      return Response.json({ error: "Object type not found" }, { status: 404 });
    }

    const updated = [...existing];
    updated[idx] = {
      ...updated[idx],
      name: body.name?.trim() || updated[idx].name,
      nameSingular: body.nameSingular?.trim() || updated[idx].nameSingular,
      icon: body.icon || updated[idx].icon,
      fields: body.fields ?? updated[idx].fields,
    };

    await updateTenantSettings(authCtx.tenantId, {
      customObjectTypes: updated,
    });

    return Response.json({ objectType: updated[idx] });
  } catch (error) {
    console.error("Failed to update custom object type:", error);
    return Response.json({ error: "Failed to update object type" }, { status: 500 });
  }
}

/**
 * DELETE /api/custom-objects
 * Delete a custom object type definition.
 * Body: { id }
 */
export async function DELETE(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  try {
    const { id } = (await req.json()) as { id: string };

    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const settings = await getTenantSettings(authCtx.tenantId);
    const existing = settings.customObjectTypes || [];
    const filtered = existing.filter((t) => t.id !== id);

    if (filtered.length === existing.length) {
      return Response.json({ error: "Object type not found" }, { status: 404 });
    }

    await updateTenantSettings(authCtx.tenantId, {
      customObjectTypes: filtered,
    });

    // Note: We don't delete the records from custom_records table here.
    // That would be a separate destructive action the user can trigger.

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete custom object type:", error);
    return Response.json({ error: "Failed to delete object type" }, { status: 500 });
  }
}
