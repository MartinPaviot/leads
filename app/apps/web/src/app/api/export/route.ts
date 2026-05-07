import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import {
  contacts,
  companies,
  deals,
  activities,
  notes,
  tasks,
  outboundEmails,
  sequences,
  sequenceEnrollments,
} from "@/db/schema";
import { eq } from "drizzle-orm";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          const str = typeof val === "object" ? JSON.stringify(val) : String(val);
          // Escape CSV: wrap in quotes if contains comma, newline, or quote
          if (str.includes(",") || str.includes("\n") || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",")
    ),
  ];
  return lines.join("\n");
}

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "json";
  const entity = searchParams.get("entity") || searchParams.get("type"); // contacts, companies, deals, activities, etc.

  const tenantId = authCtx.tenantId;

  try {
    if (entity) {
      // Single entity export
      let data: Record<string, unknown>[] = [];
      let filename = entity;

      switch (entity) {
        case "contacts": {
          const rows = await db.select().from(contacts).where(eq(contacts.tenantId, tenantId));
          data = rows.map((r) => ({
            id: r.id,
            firstName: r.firstName,
            lastName: r.lastName,
            email: r.email,
            phone: r.phone,
            title: r.title,
            linkedinUrl: r.linkedinUrl,
            companyId: r.companyId,
            score: r.score,
            properties: r.properties,
            createdAt: r.createdAt?.toISOString(),
          }));
          break;
        }
        case "companies": {
          const rows = await db.select().from(companies).where(eq(companies.tenantId, tenantId));
          data = rows.map((r) => ({
            id: r.id,
            name: r.name,
            domain: r.domain,
            industry: r.industry,
            size: r.size,
            revenue: r.revenue,
            description: r.description,
            score: r.score,
            properties: r.properties,
            createdAt: r.createdAt?.toISOString(),
          }));
          break;
        }
        case "deals": {
          const rows = await db.select().from(deals).where(eq(deals.tenantId, tenantId));
          data = rows.map((r) => ({
            id: r.id,
            name: r.name,
            stage: r.stage,
            value: r.value,
            currency: r.currency,
            companyId: r.companyId,
            contactId: r.contactId,
            expectedCloseDate: r.expectedCloseDate?.toISOString(),
            score: r.score,
            summary: r.summary,
            properties: r.properties,
            createdAt: r.createdAt?.toISOString(),
          }));
          break;
        }
        case "activities": {
          const rows = await db.select().from(activities).where(eq(activities.tenantId, tenantId));
          data = rows.map((r) => ({
            id: r.id,
            entityType: r.entityType,
            entityId: r.entityId,
            activityType: r.activityType,
            channel: r.channel,
            direction: r.direction,
            summary: r.summary,
            occurredAt: r.occurredAt?.toISOString(),
            metadata: r.metadata,
          }));
          break;
        }
        case "notes": {
          const rows = await db.select().from(notes).where(eq(notes.tenantId, tenantId));
          data = rows.map((r) => ({
            id: r.id,
            entityType: r.entityType,
            entityId: r.entityId,
            title: r.title,
            content: r.content,
            createdAt: r.createdAt?.toISOString(),
          }));
          break;
        }
        case "tasks": {
          const rows = await db.select().from(tasks).where(eq(tasks.tenantId, tenantId));
          data = rows.map((r) => ({
            id: r.id,
            title: r.title,
            description: r.description,
            status: r.status,
            priority: r.priority,
            dueDate: r.dueDate?.toISOString(),
            entityType: r.entityType,
            entityId: r.entityId,
            createdAt: r.createdAt?.toISOString(),
          }));
          break;
        }
        default:
          return Response.json({ error: `Unknown entity: ${entity}` }, { status: 400 });
      }

      if (format === "csv") {
        const csv = toCsv(data);
        return new Response(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}-${new Date().toISOString().split("T")[0]}.csv"`,
          },
        });
      }

      return new Response(JSON.stringify(data, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${filename}-${new Date().toISOString().split("T")[0]}.json"`,
        },
      });
    }

    // Full export — all entities
    const [
      contactsData,
      companiesData,
      dealsData,
      activitiesData,
      notesData,
      tasksData,
      emailsData,
    ] = await Promise.all([
      db.select().from(contacts).where(eq(contacts.tenantId, tenantId)),
      db.select().from(companies).where(eq(companies.tenantId, tenantId)),
      db.select().from(deals).where(eq(deals.tenantId, tenantId)),
      db.select().from(activities).where(eq(activities.tenantId, tenantId)),
      db.select().from(notes).where(eq(notes.tenantId, tenantId)),
      db.select().from(tasks).where(eq(tasks.tenantId, tenantId)),
      db.select().from(outboundEmails).where(eq(outboundEmails.tenantId, tenantId)),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      format: "elevay-export-v1",
      data: {
        contacts: contactsData,
        companies: companiesData,
        deals: dealsData,
        activities: activitiesData,
        notes: notesData,
        tasks: tasksData,
        outboundEmails: emailsData,
      },
      relationships: {
        contactToCompany: contactsData
          .filter((c) => c.companyId)
          .map((c) => ({ contactId: c.id, companyId: c.companyId })),
        dealToCompany: dealsData
          .filter((d) => d.companyId)
          .map((d) => ({ dealId: d.id, companyId: d.companyId })),
        dealToContact: dealsData
          .filter((d) => d.contactId)
          .map((d) => ({ dealId: d.id, contactId: d.contactId })),
      },
      metadata: {
        counts: {
          contacts: contactsData.length,
          companies: companiesData.length,
          deals: dealsData.length,
          activities: activitiesData.length,
          notes: notesData.length,
          tasks: tasksData.length,
          outboundEmails: emailsData.length,
        },
      },
    };

    if (format === "csv") {
      // For full export CSV, concatenate all entity tables with a blank line separator
      const sections: string[] = [];
      const entityMap: Record<string, Record<string, unknown>[]> = {
        contacts: contactsData.map((r) => ({
          id: r.id, firstName: r.firstName, lastName: r.lastName, email: r.email,
          phone: r.phone, title: r.title, linkedinUrl: r.linkedinUrl,
          companyId: r.companyId, score: r.score, createdAt: r.createdAt?.toISOString(),
        })),
        companies: companiesData.map((r) => ({
          id: r.id, name: r.name, domain: r.domain, industry: r.industry,
          size: r.size, revenue: r.revenue, description: r.description,
          score: r.score, createdAt: r.createdAt?.toISOString(),
        })),
        deals: dealsData.map((r) => ({
          id: r.id, name: r.name, stage: r.stage, value: r.value, currency: r.currency,
          companyId: r.companyId, contactId: r.contactId,
          expectedCloseDate: r.expectedCloseDate?.toISOString(), score: r.score,
          summary: r.summary, createdAt: r.createdAt?.toISOString(),
        })),
        activities: activitiesData.map((r) => ({
          id: r.id, entityType: r.entityType, entityId: r.entityId,
          activityType: r.activityType, channel: r.channel, direction: r.direction,
          summary: r.summary, occurredAt: r.occurredAt?.toISOString(),
        })),
        notes: notesData.map((r) => ({
          id: r.id, entityType: r.entityType, entityId: r.entityId,
          title: r.title, content: r.content, createdAt: r.createdAt?.toISOString(),
        })),
        tasks: tasksData.map((r) => ({
          id: r.id, title: r.title, description: r.description, status: r.status,
          priority: r.priority, dueDate: r.dueDate?.toISOString(),
          entityType: r.entityType, entityId: r.entityId, createdAt: r.createdAt?.toISOString(),
        })),
        outboundEmails: emailsData.map((r) => ({
          id: r.id, ...Object.fromEntries(
            Object.entries(r).filter(([k]) => k !== "id" && k !== "tenantId")
          ),
        })),
      };

      for (const [name, rows] of Object.entries(entityMap)) {
        if (rows.length > 0) {
          sections.push(`# ${name}\n${toCsv(rows)}`);
        }
      }

      const csv = sections.join("\n\n");
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="elevay-full-export-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="elevay-full-export-${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  } catch (error) {
    console.error("Export failed:", error);
    return Response.json({ error: "Export failed" }, { status: 500 });
  }
}
