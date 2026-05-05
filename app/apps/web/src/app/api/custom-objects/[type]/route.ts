import { NextRequest } from "next/server";
import postgres from "postgres";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { getTenantSettings } from "@/lib/config/tenant-settings";

function getSql() {
  return postgres(process.env.DATABASE_URL!);
}

type TypeRouteParams = { params: Promise<{ type: string }> };

/**
 * GET /api/custom-objects/[type]
 * List all records of a given custom object type.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type } = await params;

  // Verify the object type exists in tenant settings
  const settings = await getTenantSettings(authCtx.tenantId);
  const objectType = (settings.customObjectTypes || []).find((t) => t.id === type);
  if (!objectType) {
    return Response.json({ error: "Object type not found" }, { status: 404 });
  }

  const sql = getSql();
  try {
    const records = await sql`
      SELECT id, object_type, name, properties, created_by, created_at, updated_at
      FROM custom_records
      WHERE tenant_id = ${authCtx.tenantId}
        AND object_type = ${type}
      ORDER BY created_at DESC
    `;

    return Response.json({ records, objectType });
  } catch (error) {
    console.error("Failed to list custom records:", error);
    return Response.json({ error: "Failed to list records" }, { status: 500 });
  } finally {
    await sql.end();
  }
}

/**
 * POST /api/custom-objects/[type]
 * Create a new record of a given custom object type.
 * Body: { name, properties: { fieldId: value, ... } }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type } = await params;

  // Verify the object type exists
  const settings = await getTenantSettings(authCtx.tenantId);
  const objectType = (settings.customObjectTypes || []).find((t) => t.id === type);
  if (!objectType) {
    return Response.json({ error: "Object type not found" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { name, properties } = body as {
      name: string;
      properties?: Record<string, unknown>;
    };

    if (!name || !name.trim()) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }

    // Validate required fields
    for (const field of objectType.fields) {
      if (field.required && (!properties || !properties[field.id])) {
        return Response.json(
          { error: `Field "${field.name}" is required` },
          { status: 400 }
        );
      }
    }

    const sql = getSql();
    try {
      const [record] = await sql`
        INSERT INTO custom_records (tenant_id, object_type, name, properties, created_by)
        VALUES (
          ${authCtx.tenantId},
          ${type},
          ${name.trim()},
          ${JSON.stringify(properties || {})},
          ${authCtx.appUserId}
        )
        RETURNING id, object_type, name, properties, created_by, created_at, updated_at
      `;

      return Response.json({ record }, { status: 201 });
    } finally {
      await sql.end();
    }
  } catch (error) {
    console.error("Failed to create custom record:", error);
    return Response.json({ error: "Failed to create record" }, { status: 500 });
  }
}

/**
 * DELETE /api/custom-objects/[type]
 * Bulk-delete records of a given custom object type.
 * Body: { ids: string[] }
 */
export async function DELETE(
  req: NextRequest,
  { params }: TypeRouteParams
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type } = await params;

  // Verify the object type exists
  const settings = await getTenantSettings(authCtx.tenantId);
  const objectType = (settings.customObjectTypes || []).find((t) => t.id === type);
  if (!objectType) {
    return Response.json({ error: "Object type not found" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { ids } = body as { ids: string[] };

    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json({ error: "ids array is required" }, { status: 400 });
    }

    // Cap at 100 deletions per request for safety
    if (ids.length > 100) {
      return Response.json(
        { error: "Cannot delete more than 100 records at once" },
        { status: 400 }
      );
    }

    const sql = getSql();
    try {
      const result = await sql`
        DELETE FROM custom_records
        WHERE tenant_id = ${authCtx.tenantId}
          AND object_type = ${type}
          AND id = ANY(${ids})
        RETURNING id
      `;

      return Response.json({
        ok: true,
        deleted: result.length,
      });
    } finally {
      await sql.end();
    }
  } catch (error) {
    console.error("Failed to bulk delete custom records:", error);
    return Response.json({ error: "Failed to delete records" }, { status: 500 });
  }
}
