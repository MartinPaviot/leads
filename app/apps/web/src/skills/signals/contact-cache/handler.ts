import { db } from "@/db";
import { contacts } from "@/db/schema";
import { eq, and, or } from "drizzle-orm";
import type { SkillRunOptions } from "@/skills/types";
import type { ContactCacheInput, ContactCacheOutput } from "./schema";

export async function contactCacheHandler(
  input: ContactCacheInput,
  options: SkillRunOptions,
): Promise<ContactCacheOutput> {
  const results: ContactCacheOutput["results"] = [];
  let duplicates = 0;
  let newContacts = 0;

  for (const contact of input.contacts) {
    const identifier = contact.email || contact.linkedinUrl || contact.name || "unknown";

    // Build query conditions
    const conditions: ReturnType<typeof eq>[] = [eq(contacts.tenantId, options.tenantId)];
    const matchConditions: ReturnType<typeof eq>[] = [];

    if (contact.email) {
      matchConditions.push(eq(contacts.email, contact.email));
    }
    if (contact.linkedinUrl) {
      matchConditions.push(eq(contacts.linkedinUrl, contact.linkedinUrl));
    }

    if (matchConditions.length === 0) {
      results.push({ identifier, isDuplicate: false, existingContactId: null, status: null });
      newContacts++;
      continue;
    }

    const existing = await db
      .select({ id: contacts.id, properties: contacts.properties })
      .from(contacts)
      .where(and(...conditions, or(...matchConditions)))
      .limit(1);

    if (existing.length > 0) {
      duplicates++;
      const props = (existing[0].properties as Record<string, unknown>) ?? {};
      const currentStatus = (props.outreachStatus as string) ?? null;

      // Update status if requested
      if (input.action === "update_status" && input.status) {
        await db
          .update(contacts)
          .set({
            properties: { ...props, outreachStatus: input.status },
          })
          .where(eq(contacts.id, existing[0].id));
      }

      results.push({
        identifier,
        isDuplicate: true,
        existingContactId: existing[0].id,
        status: input.action === "update_status" && input.status ? input.status : currentStatus,
      });
    } else {
      newContacts++;
      results.push({ identifier, isDuplicate: false, existingContactId: null, status: null });
    }
  }

  return {
    action: input.action,
    totalProcessed: input.contacts.length,
    duplicates,
    newContacts,
    results,
  };
}
