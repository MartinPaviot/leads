/**
 * Backfill activities.metadata.from on inbound email rows that lost their From
 * header (clobber bug #260; that backfill restored only `to`). For an inbound
 * email_received attached to a contact, the SENDER is that contact, so
 * metadata.from = the contact's address (with display name when known).
 *
 * This restores the sender name on the dashboard / inbox cards AND lets the
 * deterministic buildConversations machine→handled gate see role addresses
 * again (the read-time email filter in #264 already protects, this is the
 * root-cause data fix).
 *
 * Idempotent + set-only: only rows whose metadata.from is missing/empty are
 * touched, merged with `||` (never replaces an existing From). Dry-run by
 * default; pass --apply to write.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const ENV = "C:/Users/marti/leads/app/apps/web/.env.local";
const url = readFileSync(ENV, "utf8")
  .match(/^DATABASE_URL\s*=\s*(.+)$/m)?.[1]
  ?.trim()
  .replace(/^["']|["']$/g, "");
if (!url) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 5 });
try {
  const rows = await sql`
    select a.id, a.tenant_id, t.name as tenant_name, c.email, c.first_name, c.last_name
    from activities a
    join contacts c on c.id = a.entity_id and c.tenant_id = a.tenant_id
    left join tenants t on t.id = a.tenant_id
    where a.activity_type = 'email_received' and a.entity_type = 'contact'
      and a.deleted_at is null and c.email is not null
      and coalesce(a.metadata ->> 'from', '') = ''`;

  const fromFor = (r) => {
    const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
    return name ? `${name} <${r.email}>` : r.email;
  };

  console.log(`Inbound rows with empty metadata.from (contact-attached): ${rows.length}`);
  const byTenant = {};
  for (const r of rows) {
    const k = `${r.tenant_name ?? "?"} (${r.tenant_id})`;
    byTenant[k] = (byTenant[k] ?? 0) + 1;
  }
  for (const [k, n] of Object.entries(byTenant)) console.log(`  ${String(n).padStart(4)}  ${k}`);

  console.log(`\nSample (id → from to set):`);
  for (const r of rows.slice(0, 12)) console.log(`  ${r.id} → ${fromFor(r)}`);

  if (!APPLY) {
    console.log(`\nDRY-RUN — re-run with --apply to write ${rows.length} rows.`);
  } else {
    let updated = 0;
    for (const r of rows) {
      await sql`update activities
                set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('from', ${fromFor(r)}::text)
                where id = ${r.id}`;
      updated++;
    }
    console.log(`\nAPPLIED: updated ${updated} rows.`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
