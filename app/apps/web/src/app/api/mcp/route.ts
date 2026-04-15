import { db } from "@/db";
import {
  tenants,
  contacts,
  companies,
  deals,
  activities,
  notes,
} from "@/db/schema";
import { eq, and, desc, ilike, or, sql } from "drizzle-orm";
import { searchSimilar } from "@/lib/embeddings";
import type { TenantSettings, McpApiKeyEntry } from "@/lib/tenant-settings";
import { compare } from "bcryptjs";
import { guardedInsertContact } from "@/lib/pricing/enforce";
import { QuotaExceededError } from "@/lib/pricing/quota";

// ── MCP Tool Definitions ──

const MCP_TOOLS = [
  {
    name: "search_records",
    description:
      "Search contacts, companies, or deals by name/query. Returns up to 20 results across all entity types.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
        entity_type: {
          type: "string",
          enum: ["contact", "company", "deal"],
          description: "Optional: limit search to a specific entity type",
        },
        limit: {
          type: "number",
          description: "Max results (default 20)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_contact",
    description: "Get a single contact by ID with all details.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Contact ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "get_company",
    description: "Get a single company by ID with all details.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Company ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "get_deal",
    description: "Get a single deal by ID with all details.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Deal ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_contacts",
    description: "List contacts with optional search by name or email.",
    inputSchema: {
      type: "object" as const,
      properties: {
        search: {
          type: "string",
          description: "Optional search string for name/email",
        },
        limit: { type: "number", description: "Max results (default 50)" },
        offset: { type: "number", description: "Offset for pagination" },
      },
    },
  },
  {
    name: "list_companies",
    description: "List companies with optional search by name or domain.",
    inputSchema: {
      type: "object" as const,
      properties: {
        search: {
          type: "string",
          description: "Optional search string for name/domain",
        },
        limit: { type: "number", description: "Max results (default 50)" },
        offset: { type: "number", description: "Offset for pagination" },
      },
    },
  },
  {
    name: "list_deals",
    description: "List deals with optional stage filter.",
    inputSchema: {
      type: "object" as const,
      properties: {
        stage: {
          type: "string",
          enum: [
            "lead",
            "qualification",
            "demo",
            "trial",
            "proposal",
            "negotiation",
            "won",
            "lost",
          ],
          description: "Optional: filter by deal stage",
        },
        limit: { type: "number", description: "Max results (default 50)" },
        offset: { type: "number", description: "Offset for pagination" },
      },
    },
  },
  {
    name: "create_contact",
    description: "Create a new contact in the CRM.",
    inputSchema: {
      type: "object" as const,
      properties: {
        first_name: { type: "string", description: "First name" },
        last_name: { type: "string", description: "Last name" },
        email: { type: "string", description: "Email address" },
        title: { type: "string", description: "Job title" },
        phone: { type: "string", description: "Phone number" },
        company_id: {
          type: "string",
          description: "ID of the company to associate",
        },
      },
    },
  },
  {
    name: "create_deal",
    description: "Create a new deal in the CRM.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Deal name" },
        stage: {
          type: "string",
          enum: [
            "lead",
            "qualification",
            "demo",
            "trial",
            "proposal",
            "negotiation",
            "won",
            "lost",
          ],
          description: "Deal stage (default: lead)",
        },
        value: { type: "number", description: "Deal value in cents" },
        company_id: { type: "string", description: "Associated company ID" },
        contact_id: { type: "string", description: "Associated contact ID" },
      },
      required: ["name"],
    },
  },
  {
    name: "log_note",
    description: "Add a note to a contact, company, or deal.",
    inputSchema: {
      type: "object" as const,
      properties: {
        entity_type: {
          type: "string",
          enum: ["contact", "company", "deal"],
          description: "Entity type",
        },
        entity_id: { type: "string", description: "Entity ID" },
        title: { type: "string", description: "Note title (optional)" },
        content: { type: "string", description: "Note content" },
      },
      required: ["entity_type", "entity_id", "content"],
    },
  },
  {
    name: "list_activities",
    description: "List recent activities for an entity.",
    inputSchema: {
      type: "object" as const,
      properties: {
        entity_type: {
          type: "string",
          enum: ["contact", "company", "deal"],
          description: "Entity type",
        },
        entity_id: { type: "string", description: "Entity ID" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
      required: ["entity_type", "entity_id"],
    },
  },
  {
    name: "search_crm",
    description:
      "Semantic search across all CRM data using AI embeddings. Best for natural language queries like 'companies in fintech' or 'contacts interested in pricing'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Natural language search query",
        },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
];

// ── Auth: resolve tenantId from Bearer token ──

async function authenticateMcpRequest(
  req: Request
): Promise<{ tenantId: string; keyId: string } | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7).trim();
  if (!token || !token.startsWith("mcp_")) return null;

  // Look up all tenants that have MCP keys configured.
  // This is not ideal for large numbers of tenants but works well for
  // the expected scale. For higher scale, store keys in a separate table
  // with an index on key_prefix.
  const allTenants = await db
    .select({ id: tenants.id, settings: tenants.settings })
    .from(tenants);

  for (const tenant of allTenants) {
    const settings = (tenant.settings || {}) as TenantSettings;
    const keys = settings.mcpApiKeys;
    if (!keys || keys.length === 0) continue;

    for (const key of keys) {
      // Quick prefix check before expensive bcrypt
      if (!token.startsWith(key.keyPrefix.replace("...", ""))) continue;

      const match = await compare(token, key.keyHash);
      if (match) {
        // Update lastUsedAt (fire-and-forget)
        const updatedKeys = keys.map((k) =>
          k.id === key.id ? { ...k, lastUsedAt: new Date().toISOString() } : k
        );
        db.update(tenants)
          .set({
            settings: { ...settings, mcpApiKeys: updatedKeys },
            updatedAt: new Date(),
          })
          .where(eq(tenants.id, tenant.id))
          .then(() => {})
          .catch((e) => console.warn("mcp: lastUsedAt update failed (non-blocking)", e));

        return { tenantId: tenant.id, keyId: key.id };
      }
    }
  }

  return null;
}

// ── Tool handlers ──

type ToolParams = Record<string, unknown>;

async function handleTool(
  name: string,
  params: ToolParams,
  tenantId: string
): Promise<unknown> {
  switch (name) {
    case "search_records":
      return handleSearchRecords(params, tenantId);
    case "get_contact":
      return handleGetContact(params, tenantId);
    case "get_company":
      return handleGetCompany(params, tenantId);
    case "get_deal":
      return handleGetDeal(params, tenantId);
    case "list_contacts":
      return handleListContacts(params, tenantId);
    case "list_companies":
      return handleListCompanies(params, tenantId);
    case "list_deals":
      return handleListDeals(params, tenantId);
    case "create_contact":
      return handleCreateContact(params, tenantId);
    case "create_deal":
      return handleCreateDeal(params, tenantId);
    case "log_note":
      return handleLogNote(params, tenantId);
    case "list_activities":
      return handleListActivities(params, tenantId);
    case "search_crm":
      return handleSearchCrm(params, tenantId);
    default:
      throw new McpError(-32601, `Unknown tool: ${name}`);
  }
}

class McpError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

// ── search_records ──

async function handleSearchRecords(params: ToolParams, tenantId: string) {
  const query = String(params.query || "").trim();
  if (!query) throw new McpError(-32602, "query is required");
  const entityType = params.entity_type as string | undefined;
  const limit = Math.min(Number(params.limit) || 20, 100);
  const pattern = `%${query}%`;

  const results: Array<{ type: string; id: string; name: string; details: Record<string, unknown> }> = [];

  if (!entityType || entityType === "contact") {
    const rows = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, tenantId),
          or(
            ilike(contacts.firstName, pattern),
            ilike(contacts.lastName, pattern),
            ilike(contacts.email, pattern)
          )
        )
      )
      .limit(limit);
    for (const r of rows) {
      results.push({
        type: "contact",
        id: r.id,
        name: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email || "Unknown",
        details: {
          email: r.email,
          title: r.title,
          phone: r.phone,
          score: r.score,
          companyId: r.companyId,
        },
      });
    }
  }

  if (!entityType || entityType === "company") {
    const rows = await db
      .select()
      .from(companies)
      .where(
        and(
          eq(companies.tenantId, tenantId),
          or(ilike(companies.name, pattern), ilike(companies.domain, pattern))
        )
      )
      .limit(limit);
    for (const r of rows) {
      results.push({
        type: "company",
        id: r.id,
        name: r.name,
        details: {
          domain: r.domain,
          industry: r.industry,
          size: r.size,
          score: r.score,
        },
      });
    }
  }

  if (!entityType || entityType === "deal") {
    const rows = await db
      .select()
      .from(deals)
      .where(and(eq(deals.tenantId, tenantId), ilike(deals.name, pattern)))
      .limit(limit);
    for (const r of rows) {
      results.push({
        type: "deal",
        id: r.id,
        name: r.name,
        details: {
          stage: r.stage,
          value: r.value,
          currency: r.currency,
          companyId: r.companyId,
        },
      });
    }
  }

  return { results: results.slice(0, limit), total: results.length };
}

// ── get_contact ──

async function handleGetContact(params: ToolParams, tenantId: string) {
  const id = String(params.id || "").trim();
  if (!id) throw new McpError(-32602, "id is required");

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.tenantId, tenantId)))
    .limit(1);

  if (!contact) throw new McpError(-32602, "Contact not found");

  // Get associated company name
  let companyName: string | null = null;
  if (contact.companyId) {
    const [company] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(and(eq(companies.id, contact.companyId), eq(companies.tenantId, tenantId)))
      .limit(1);
    companyName = company?.name || null;
  }

  return {
    id: contact.id,
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    title: contact.title,
    linkedinUrl: contact.linkedinUrl,
    score: contact.score,
    scoreReasons: contact.scoreReasons,
    companyId: contact.companyId,
    companyName,
    properties: contact.properties,
    createdAt: contact.createdAt?.toISOString(),
    updatedAt: contact.updatedAt?.toISOString(),
  };
}

// ── get_company ──

async function handleGetCompany(params: ToolParams, tenantId: string) {
  const id = String(params.id || "").trim();
  if (!id) throw new McpError(-32602, "id is required");

  const [company] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, id), eq(companies.tenantId, tenantId)))
    .limit(1);

  if (!company) throw new McpError(-32602, "Company not found");

  // Count contacts in this company
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(and(eq(contacts.companyId, id), eq(contacts.tenantId, tenantId)));

  return {
    id: company.id,
    name: company.name,
    domain: company.domain,
    industry: company.industry,
    size: company.size,
    revenue: company.revenue,
    description: company.description,
    score: company.score,
    scoreReasons: company.scoreReasons,
    properties: company.properties,
    contactCount: countResult?.count ?? 0,
    createdAt: company.createdAt?.toISOString(),
    updatedAt: company.updatedAt?.toISOString(),
  };
}

// ── get_deal ──

async function handleGetDeal(params: ToolParams, tenantId: string) {
  const id = String(params.id || "").trim();
  if (!id) throw new McpError(-32602, "id is required");

  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, id), eq(deals.tenantId, tenantId)))
    .limit(1);

  if (!deal) throw new McpError(-32602, "Deal not found");

  let companyName: string | null = null;
  if (deal.companyId) {
    const [company] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(and(eq(companies.id, deal.companyId), eq(companies.tenantId, tenantId)))
      .limit(1);
    companyName = company?.name || null;
  }

  let contactName: string | null = null;
  if (deal.contactId) {
    const [contact] = await db
      .select({ firstName: contacts.firstName, lastName: contacts.lastName })
      .from(contacts)
      .where(and(eq(contacts.id, deal.contactId), eq(contacts.tenantId, tenantId)))
      .limit(1);
    if (contact) {
      contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || null;
    }
  }

  return {
    id: deal.id,
    name: deal.name,
    stage: deal.stage,
    value: deal.value,
    currency: deal.currency,
    expectedCloseDate: deal.expectedCloseDate?.toISOString() || null,
    summary: deal.summary,
    score: deal.score,
    scoreReasons: deal.scoreReasons,
    companyId: deal.companyId,
    companyName,
    contactId: deal.contactId,
    contactName,
    properties: deal.properties,
    createdAt: deal.createdAt?.toISOString(),
    updatedAt: deal.updatedAt?.toISOString(),
  };
}

// ── list_contacts ──

async function handleListContacts(params: ToolParams, tenantId: string) {
  const search = String(params.search || "").trim();
  const limit = Math.min(Number(params.limit) || 50, 200);
  const offset = Number(params.offset) || 0;

  const filters = [eq(contacts.tenantId, tenantId)];
  if (search) {
    const pattern = `%${search}%`;
    filters.push(
      or(
        ilike(contacts.firstName, pattern),
        ilike(contacts.lastName, pattern),
        ilike(contacts.email, pattern)
      )!
    );
  }

  const where = filters.length === 1 ? filters[0] : and(...filters);

  const [rows, countResult] = await Promise.all([
    db.select().from(contacts).where(where).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(contacts).where(where),
  ]);

  return {
    contacts: rows.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      title: c.title,
      phone: c.phone,
      score: c.score,
      companyId: c.companyId,
      createdAt: c.createdAt?.toISOString(),
    })),
    total: countResult[0]?.count ?? 0,
    limit,
    offset,
  };
}

// ── list_companies ──

async function handleListCompanies(params: ToolParams, tenantId: string) {
  const search = String(params.search || "").trim();
  const limit = Math.min(Number(params.limit) || 50, 200);
  const offset = Number(params.offset) || 0;

  const filters = [eq(companies.tenantId, tenantId)];
  if (search) {
    const pattern = `%${search}%`;
    filters.push(
      or(ilike(companies.name, pattern), ilike(companies.domain, pattern))!
    );
  }

  const where = filters.length === 1 ? filters[0] : and(...filters);

  const [rows, countResult] = await Promise.all([
    db.select().from(companies).where(where).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(companies).where(where),
  ]);

  return {
    companies: rows.map((c) => ({
      id: c.id,
      name: c.name,
      domain: c.domain,
      industry: c.industry,
      size: c.size,
      score: c.score,
      createdAt: c.createdAt?.toISOString(),
    })),
    total: countResult[0]?.count ?? 0,
    limit,
    offset,
  };
}

// ── list_deals ──

async function handleListDeals(params: ToolParams, tenantId: string) {
  const stage = params.stage as string | undefined;
  const limit = Math.min(Number(params.limit) || 50, 200);
  const offset = Number(params.offset) || 0;

  const filters = [eq(deals.tenantId, tenantId)];
  if (stage) {
    filters.push(eq(deals.stage, stage as any));
  }

  const where = filters.length === 1 ? filters[0] : and(...filters);

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(deals)
      .where(where)
      .orderBy(desc(deals.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(deals).where(where),
  ]);

  return {
    deals: rows.map((d) => ({
      id: d.id,
      name: d.name,
      stage: d.stage,
      value: d.value,
      currency: d.currency,
      expectedCloseDate: d.expectedCloseDate?.toISOString() || null,
      score: d.score,
      companyId: d.companyId,
      contactId: d.contactId,
      createdAt: d.createdAt?.toISOString(),
    })),
    total: countResult[0]?.count ?? 0,
    limit,
    offset,
  };
}

// ── create_contact ──

async function handleCreateContact(params: ToolParams, tenantId: string) {
  const firstName = String(params.first_name || "").trim() || null;
  const lastName = String(params.last_name || "").trim() || null;
  const email = String(params.email || "").trim().toLowerCase() || null;
  const title = String(params.title || "").trim() || null;
  const phone = String(params.phone || "").trim() || null;
  const companyId = String(params.company_id || "").trim() || null;

  if (!email && !firstName && !lastName) {
    throw new McpError(-32602, "At least email or name is required");
  }

  const [contact] = await guardedInsertContact(tenantId, () =>
    db
      .insert(contacts)
      .values({
        tenantId,
        firstName,
        lastName,
        email,
        title,
        phone,
        companyId,
      })
      .returning()
  );

  return {
    id: contact.id,
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    title: contact.title,
    createdAt: contact.createdAt?.toISOString(),
  };
}

// ── create_deal ──

async function handleCreateDeal(params: ToolParams, tenantId: string) {
  const name = String(params.name || "").trim();
  if (!name) throw new McpError(-32602, "name is required");

  const stage = (params.stage as string) || "lead";
  const value = params.value ? Number(params.value) : null;
  const companyId = String(params.company_id || "").trim() || null;
  const contactId = String(params.contact_id || "").trim() || null;

  const [deal] = await db
    .insert(deals)
    .values({
      tenantId,
      name,
      stage: stage as any,
      value,
      companyId,
      contactId,
    })
    .returning();

  return {
    id: deal.id,
    name: deal.name,
    stage: deal.stage,
    value: deal.value,
    createdAt: deal.createdAt?.toISOString(),
  };
}

// ── log_note ──

async function handleLogNote(params: ToolParams, tenantId: string) {
  const entityType = String(params.entity_type || "").trim();
  const entityId = String(params.entity_id || "").trim();
  const content = String(params.content || "").trim();
  const title = String(params.title || "").trim() || null;

  if (!entityType || !entityId) {
    throw new McpError(-32602, "entity_type and entity_id are required");
  }
  if (!content) {
    throw new McpError(-32602, "content is required");
  }

  const [note] = await db
    .insert(notes)
    .values({
      tenantId,
      entityType,
      entityId,
      title,
      content,
    })
    .returning();

  return {
    id: note.id,
    entityType: note.entityType,
    entityId: note.entityId,
    title: note.title,
    createdAt: note.createdAt?.toISOString(),
  };
}

// ── list_activities ──

async function handleListActivities(params: ToolParams, tenantId: string) {
  const entityType = String(params.entity_type || "").trim();
  const entityId = String(params.entity_id || "").trim();
  const limit = Math.min(Number(params.limit) || 20, 100);

  if (!entityType || !entityId) {
    throw new McpError(-32602, "entity_type and entity_id are required");
  }

  const rows = await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, entityType),
        eq(activities.entityId, entityId)
      )
    )
    .orderBy(desc(activities.occurredAt))
    .limit(limit);

  return {
    activities: rows.map((a) => ({
      id: a.id,
      activityType: a.activityType,
      channel: a.channel,
      direction: a.direction,
      summary: a.summary,
      occurredAt: a.occurredAt?.toISOString(),
      metadata: a.metadata,
    })),
    total: rows.length,
  };
}

// ── search_crm ──

async function handleSearchCrm(params: ToolParams, tenantId: string) {
  const query = String(params.query || "").trim();
  if (!query) throw new McpError(-32602, "query is required");
  const limit = Math.min(Number(params.limit) || 10, 50);

  if (!process.env.OPENAI_API_KEY) {
    throw new McpError(
      -32603,
      "Semantic search is not configured (missing OPENAI_API_KEY)"
    );
  }

  const results = await searchSimilar(query, limit, tenantId);

  return {
    results: results.map((r) => ({
      entityType: r.entityType,
      entityId: r.entityId,
      content: r.content,
      similarity: Math.round(r.similarity * 1000) / 1000,
    })),
  };
}

// ── JSON-RPC handler ──

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function jsonRpcError(
  id: string | number | null | undefined,
  code: number,
  message: string,
  data?: Record<string, unknown>
) {
  return Response.json(
    {
      jsonrpc: "2.0",
      id: id ?? null,
      error: data ? { code, message, data } : { code, message },
    },
    { status: code === -32600 || code === -32700 ? 400 : 200 }
  );
}

function jsonRpcSuccess(id: string | number | null | undefined, result: unknown) {
  return Response.json({
    jsonrpc: "2.0",
    id: id ?? null,
    result,
  });
}

export async function POST(req: Request) {
  // ── Auth ──
  const authResult = await authenticateMcpRequest(req);
  if (!authResult) {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32000,
          message: "Unauthorized. Provide a valid MCP API key as Bearer token.",
        },
      },
      { status: 401 }
    );
  }

  const { tenantId } = authResult;

  // ── Parse body ──
  let body: JsonRpcRequest;
  try {
    body = await req.json();
  } catch {
    return jsonRpcError(null, -32700, "Parse error: invalid JSON");
  }

  if (body.jsonrpc !== "2.0" || !body.method) {
    return jsonRpcError(body.id, -32600, "Invalid JSON-RPC 2.0 request");
  }

  // ── Route methods ──
  const { method, params, id } = body;

  try {
    switch (method) {
      // MCP protocol: initialize
      case "initialize": {
        return jsonRpcSuccess(id, {
          protocolVersion: "2024-11-05",
          serverInfo: {
            name: "elevay-crm",
            version: "1.0.0",
          },
          capabilities: {
            tools: {},
          },
        });
      }

      // MCP protocol: list tools
      case "tools/list": {
        return jsonRpcSuccess(id, { tools: MCP_TOOLS });
      }

      // MCP protocol: call a tool
      case "tools/call": {
        const toolName = (params as any)?.name as string;
        const toolArgs = ((params as any)?.arguments || {}) as ToolParams;

        if (!toolName) {
          return jsonRpcError(id, -32602, "Missing tool name in params.name");
        }

        const toolDef = MCP_TOOLS.find((t) => t.name === toolName);
        if (!toolDef) {
          return jsonRpcError(id, -32601, `Unknown tool: ${toolName}`);
        }

        const result = await handleTool(toolName, toolArgs, tenantId);

        return jsonRpcSuccess(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        });
      }

      // MCP protocol: ping
      case "ping": {
        return jsonRpcSuccess(id, {});
      }

      // MCP protocol: notifications (no response needed but be graceful)
      case "notifications/initialized": {
        return jsonRpcSuccess(id, {});
      }

      default:
        return jsonRpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    if (err instanceof McpError) {
      return jsonRpcError(id, err.code, err.message);
    }
    if (err instanceof QuotaExceededError) {
      // MCP uses JSON-RPC, not HTTP status codes — surface the quota code
      // as a JSON-RPC error with the structured data in the message payload.
      return jsonRpcError(id, -32010, err.message, {
        code: err.code,
        feature: err.feature,
        current: err.current,
        limit: err.limit,
        plan: err.plan,
      });
    }
    console.error("MCP tool error:", err);
    return jsonRpcError(
      id,
      -32603,
      `Internal error: ${err instanceof Error ? err.message : "Unknown error"}`
    );
  }
}

// ── GET: server info (useful for discovery) ──

export async function GET() {
  return Response.json({
    name: "elevay-crm",
    version: "1.0.0",
    protocol: "json-rpc-2.0",
    description:
      "Elevay CRM MCP server. Send JSON-RPC 2.0 POST requests with Bearer token auth.",
    endpoints: {
      mcp: "POST /api/mcp",
      keys: {
        create: "POST /api/mcp/keys",
        list: "GET /api/mcp/keys",
        revoke: "DELETE /api/mcp/keys",
      },
    },
    tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description })),
  });
}
