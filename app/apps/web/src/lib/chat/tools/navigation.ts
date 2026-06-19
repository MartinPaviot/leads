/**
 * Navigation + command tools — the chat's hands on the product UI.
 *
 * These tools don't mutate data; they return a UI directive (see
 * lib/chat/ui-directives.ts) that the client executes: jump to a record,
 * open a list view, or pop the email composer pre-filled. This is what turns
 * the chat from an answer box into the place you DRIVE the product from.
 *
 * Each tool also returns a plain, human-readable payload (the resolved name +
 * path), so a client that ignores directives (Slack, external MCP) still gets
 * a useful answer with a link.
 */

import { db } from "@/db";
import { companies, contacts, deals, activities } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { makeTool, type ToolContext } from "./context";
import { navigateDirective, composeEmailDirective } from "@/lib/chat/ui-directives";

/** entityType → { detail path builder } for openRecord. */
const RECORD_ROUTES = {
  account: (id: string) => `/accounts/${id}`,
  contact: (id: string) => `/contacts/${id}`,
  deal: (id: string) => `/opportunities/${id}`,
  meeting: (id: string) => `/meetings/${id}`,
} as const;

/**
 * CLE-15: entityType -> the highlight scope the destination page registers its
 * locator under (the plural surface key). Lets a landed record pulse itself once
 * the page (CLE-06..09/CLE-14) registers a locator; until then a silent no-op.
 */
const HIGHLIGHT_SCOPE: Record<keyof typeof RECORD_ROUTES, string> = {
  account: "accounts",
  contact: "contacts",
  deal: "opportunities",
  meeting: "meetings",
};

/** Canonical list views → path. Aliases are normalised in `openListView`. */
const LIST_VIEWS: Record<string, string> = {
  accounts: "/accounts",
  contacts: "/contacts",
  opportunities: "/opportunities",
  meetings: "/meetings",
  tasks: "/tasks",
  sequences: "/sequences",
  proposals: "/proposals",
  home: "/home",
  inbox: "/inbox",
  insights: "/insights",
  reports: "/reports",
  skills: "/skills",
  "call-mode": "/call-mode",
};

/** Friendly synonyms the model is likely to use → canonical view key. */
const VIEW_ALIASES: Record<string, string> = {
  deals: "opportunities",
  pipeline: "opportunities",
  opportunity: "opportunities",
  account: "accounts",
  contact: "contacts",
  meeting: "meetings",
  calendar: "meetings",
  task: "tasks",
  todos: "tasks",
  campaigns: "sequences",
  campaign: "sequences",
  sequence: "sequences",
  proposal: "proposals",
  calls: "call-mode",
  "call mode": "call-mode",
  dashboard: "home",
};

export function buildNavigationTools(ctx: ToolContext) {
  const { tenantId } = ctx;

  return {
    openRecord: makeTool({
      description:
        "Navigate the user to a specific record's detail page (account, contact, deal, or meeting). Use ONLY when the user wants to GO somewhere — 'open Acme', 'take me to Jane's contact', 'pull up that deal', 'show me the page for X'. Do NOT call this just to summarize or answer about a record — only when they want to land on the page. Verifies the record exists first.",
      inputSchema: z.object({
        entityType: z.enum(["account", "contact", "deal", "meeting"]),
        id: z.string().describe("The record id to open"),
      }),
      execute: async (input) => {
        const { entityType, id } = input;
        let name: string | null = null;

        if (entityType === "account") {
          const [r] = await db
            .select({ name: companies.name })
            .from(companies)
            .where(and(eq(companies.id, id), eq(companies.tenantId, tenantId)))
            .limit(1);
          if (!r) return { error: "Account not found in this workspace." };
          name = r.name;
        } else if (entityType === "contact") {
          const [r] = await db
            .select({ firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email })
            .from(contacts)
            .where(and(eq(contacts.id, id), eq(contacts.tenantId, tenantId)))
            .limit(1);
          if (!r) return { error: "Contact not found in this workspace." };
          name = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email || "Contact";
        } else if (entityType === "deal") {
          const [r] = await db
            .select({ name: deals.name })
            .from(deals)
            .where(and(eq(deals.id, id), eq(deals.tenantId, tenantId)))
            .limit(1);
          if (!r) return { error: "Deal not found in this workspace." };
          name = r.name;
        } else {
          // meeting — stored as an activity row
          const [r] = await db
            .select({ summary: activities.summary })
            .from(activities)
            .where(and(eq(activities.id, id), eq(activities.tenantId, tenantId)))
            .limit(1);
          if (!r) return { error: "Meeting not found in this workspace." };
          name = r.summary || "Meeting";
        }

        const path = RECORD_ROUTES[entityType](id);
        return {
          opened: { entityType, id, name, path },
          // CLE-15: pulse the record on arrival. The detail page registering a
          // locator for `id` is CLE-07/CLE-14; until then this is a no-op and the
          // navigation works exactly as before.
          ...navigateDirective(path, name ?? undefined, { entityId: id, scope: HIGHLIGHT_SCOPE[entityType] }),
        };
      },
    }),

    openListView: makeTool({
      description:
        "Navigate the user to a list/overview page: accounts, contacts, opportunities (pipeline), meetings, tasks, sequences (campaigns), proposals, inbox, insights, reports, skills, call-mode, or home. Use when the user says 'go to my pipeline', 'open tasks', 'show me my campaigns', 'take me home'. For a single record use openRecord instead.",
      inputSchema: z.object({
        view: z
          .string()
          .describe(
            "Which view to open. One of: accounts, contacts, opportunities, meetings, tasks, sequences, proposals, inbox, insights, reports, skills, call-mode, home.",
          ),
      }),
      execute: async (input) => {
        const key = input.view.trim().toLowerCase();
        const canonical = LIST_VIEWS[key] ? key : VIEW_ALIASES[key];
        const path = canonical ? LIST_VIEWS[canonical] : undefined;
        if (!path) {
          return {
            error: `Unknown view "${input.view}". Valid views: ${Object.keys(LIST_VIEWS).join(", ")}.`,
          };
        }
        return {
          opened: { view: canonical, path },
          ...navigateDirective(path, canonical),
        };
      },
    }),

    composeEmail: makeTool({
      description:
        "Open the email composer pre-filled with a draft so the user can review and send in ONE click. Call this AFTER you've written an email the user wants to send (e.g. they said 'draft and open it', 'put it in the composer', or you just produced a send-ready email). Provide subject + body, and either `to` or a `contactId` (its email is resolved). This does NOT send — it opens the composer for review.",
      inputSchema: z.object({
        subject: z.string().describe("Email subject line"),
        body: z.string().describe("Email body (plain text)"),
        to: z.string().optional().describe("Recipient email address (or pass contactId)"),
        contactId: z
          .string()
          .optional()
          .describe("Contact id — resolves the recipient email + attributes the send"),
        cc: z.string().optional().describe("Comma-separated cc addresses"),
        dealId: z.string().optional().describe("Deal id to attribute the send to"),
      }),
      execute: async (input) => {
        let to = input.to?.trim() || "";
        let contactName: string | null = null;

        if (input.contactId) {
          const [c] = await db
            .select({
              firstName: contacts.firstName,
              lastName: contacts.lastName,
              email: contacts.email,
            })
            .from(contacts)
            .where(and(eq(contacts.id, input.contactId), eq(contacts.tenantId, tenantId)))
            .limit(1);
          if (!c) return { error: "Contact not found in this workspace." };
          contactName = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || null;
          if (!to) to = c.email?.trim() || "";
        }

        if (!to) {
          return {
            error:
              "No recipient — provide a `to` address or a `contactId` that has an email on file.",
          };
        }

        const draft = {
          to,
          subject: input.subject,
          body: input.body,
          ...(input.cc?.trim() ? { cc: input.cc.trim() } : {}),
          ...(input.contactId ? { contactId: input.contactId } : {}),
          ...(input.dealId ? { dealId: input.dealId } : {}),
        };

        return {
          composer: { to, subject: input.subject, contactName, opened: true },
          ...composeEmailDirective(draft),
        };
      },
    }),
  };
}
