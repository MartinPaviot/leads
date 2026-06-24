/**
 * Write validators for the canonical layer (spec 00, AC2). Schemas are DERIVED
 * from the Drizzle tables via drizzle-zod's createInsertSchema, so they mirror
 * the schema by construction and stay in sync (no hand-maintained drift). Every
 * canonical write parses through these and is REJECTED on a type/shape
 * mismatch.
 */
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import {
  companies,
  contacts,
  accountFieldSource,
  contactFieldSource,
} from "@/db/schema";

// Full insert schemas (mirror the tables exactly).
export const accountInsertSchema = createInsertSchema(companies);
export const contactInsertSchema = createInsertSchema(contacts);
export const accountFieldSourceInsertSchema = createInsertSchema(accountFieldSource);
export const contactFieldSourceInsertSchema = createInsertSchema(contactFieldSource);

// Upsert partials: an upsert supplies a subset of columns. Shape/types are
// still enforced against the mirror; identity-signal presence is enforced
// separately in upsert.ts.
export const accountWriteSchema = accountInsertSchema.partial();
export const contactWriteSchema = contactInsertSchema.partial();

/** Vendor side map: { provider: vendorId } — strings only, never identity. */
export const vendorIdsSchema = z.record(z.string(), z.string());

export class CanonicalValidationError extends Error {
  issues: z.ZodIssue[];
  constructor(message: string, issues: z.ZodIssue[]) {
    super(message);
    this.name = "CanonicalValidationError";
    this.issues = issues;
  }
}

/** Parse or throw CanonicalValidationError (rejects invalid writes — AC2). */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new CanonicalValidationError(
      "canonical write failed validation",
      result.error.issues,
    );
  }
  return result.data;
}
