import { NextRequest } from "next/server";
import postgres from "postgres";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { getTenantSettings } from "@/lib/config/tenant-settings";

function getSql() {
  return postgres(process.env.DATABASE_URL!);
}

type RouteParams = { params: Promise<{ type: string; id: string }> };

/**
 * GET /api/custom-objects/[type]/[id]
 * Get a single custom record.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, id } = await params;

  const settings = await getTenantSettings(authCtx.tenantId);
  const objectType = (settings.customObjectTypes || []).find((t) => t.id === type);
  if (!objectType) {
    return Response.json({ error: "Object type not found" }, { status: 404 });
  }

  const sql = getSql();
  try {
    const [record] = await sql`
      SELECT id, object_type, name, properties, created_by, created_at, updated_at
      FROM custom_records
      WHERE tenant_id = ${authCtx.tenantId}
        AND id = ${id}
        AND object_type = ${type}
    `;

    if (!record) {
      return Response.json({ error: "Record not found" }, { status: 404 });
    }

    return Response.json({ record, objectType });
  } catch (error) {
    console.error("Failed to get custom record:", error);
    return Response.json({ error: "Failed to get record" }, { status: 500 });
  } finally {
    await sql.end();
  }
}

/**
 * PUT /api/custom-objects/[type]/[id]
 * Update a custom record.
 * Body: { name?, properties? }
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, id } = await params;

  const settings = await getTenantSettings(authCtx.tenantId);
  const objectType = (settings.customObjectTypes || []).find((t) => t.id === type);
  if (!objectType) {
    return Response.json({ error: "Object type not found" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { name, properties } = body as {
      name?: string;
      properties?: Record<string, unknown>;
    };

    // Validate required fields if properties are being updated
    if (properties) {
      for (const field of objectType.fields) {
        if (field.required && !properties[field.id]) {
          return Response.json(
            { error: `Field "${field.name}" is required` },
            { status: 400 }
          );
        }
      }
    }

    const sql = getSql();
    try {
      // Build the update dynamically based on what's provided
      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (name !== undefined) updates.name = name.trim();
      if (properties !== undefined) updates.properties = JSON.stringify(properties);

      const [record] = await sql`
        UPDATE custom_records
        SET
          name = COALESCE(${name?.trim() ?? null}, name),
          properties = COALESCE(${properties ? JSON.stringify(properties) : null}::jsonb, properties),
          updated_at = NOW()
        WHERE tenant_id = ${authCtx.tenantId}
          AND id = ${id}
          AND object_type = ${type}
        RETURNING id, object_type, name, properties, created_by, created_at, updated_at
      `;

      if (!record) {
        return Response.json({ error: "Record not found" }, { status: 404 });
      }

      return Response.json({ record });
    } finally {
      await sql.end();
    }
  } catch (error) {
    console.error("Failed to update custom record:", error);
    return Response.json({ error: "Failed to update record" }, { status: 500 });
  }
}

/**
 * DELETE /api/custom-objects/[type]/[id]
 * Delete a custom record.
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, id } = await params;

  const sql = getSql();
  try {
    const result = await sql`
      DELETE FROM custom_records
      WHERE tenant_id = ${authCtx.tenantId}
        AND id = ${id}
        AND object_type = ${type}
      RETURNING id
    `;

    if (result.length === 0) {
      return Response.json({ error: "Record not found" }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete custom record:", error);
    return Response.json({ error: "Failed to delete record" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
