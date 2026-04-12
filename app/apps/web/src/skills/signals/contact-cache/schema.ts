import { z } from "zod";

export const contactCacheInputSchema = z.object({
  action: z.enum(["check", "add", "update_status"]),
  contacts: z.array(z.object({
    email: z.string().optional(),
    linkedinUrl: z.string().optional(),
    name: z.string().optional(),
    companyDomain: z.string().optional(),
  })).min(1).max(500),
  status: z.enum(["new", "qualified", "contacted", "replied", "converted", "disqualified"]).optional()
    .describe("Status to set when action is 'update_status'"),
});

export type ContactCacheInput = z.infer<typeof contactCacheInputSchema>;

export const contactCacheOutputSchema = z.object({
  action: z.string(),
  totalProcessed: z.number(),
  duplicates: z.number(),
  newContacts: z.number(),
  results: z.array(z.object({
    identifier: z.string(),
    isDuplicate: z.boolean(),
    existingContactId: z.string().nullable(),
    status: z.string().nullable(),
  })),
});

export type ContactCacheOutput = z.infer<typeof contactCacheOutputSchema>;
