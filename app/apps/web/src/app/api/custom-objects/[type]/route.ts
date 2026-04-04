import { NextRequest } from "next/server";
import postgres from "postgres";
import { getAuthContext } from "@/lib/auth-utils";
import { getTenantSettings } from "@/lib/tenant-settings";

function getSql() {
  return postgres(process.env.DATABASE_URL!);
}

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
