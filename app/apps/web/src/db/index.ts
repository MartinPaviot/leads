import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import {
  assertEuHost,
  isEuEnforcementEnabled,
  maskHostname,
} from "@/lib/region-config";

// FINDING-004: assert DATABASE_URL points to an EU/CH host when
// GDPR_REGION=eu. Logs CRITICAL in production (so ops alerts fire) and
// WARNING in development. Does not hard-throw, to allow recovery deploys
// when the host changes intentionally.

const result = assertEuHost(process.env.DATABASE_URL!);
if (isEuEnforcementEnabled() && !result.ok) {
  const message =
    `[db] GDPR_REGION=eu but DATABASE_URL host ` +
    `(${result.hostname ? maskHostname(result.hostname) : "unknown"}) ` +
    `is not in the EU/CH allowlist (${result.reason}). ` +
    `Migrate the DB to Supabase eu-central-1, Scaleway, OVH, ` +
    `Infomaniak, Exoscale, or another EU/CH host.`;

  if (process.env.NODE_ENV === "production") {
    console.error(`CRITICAL: ${message}`);
  } else if (process.env.NODE_ENV !== "test") {
    console.warn(`WARNING: ${message}`);
  }
}

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle({ client, schema });

export * from "./schema";
