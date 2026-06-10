/**
 * SOC2 T1 backfill — encrypt OAuth tokens at rest in `auth_account`.
 *
 * Rewrites plaintext access_token / refresh_token / id_token to the
 * AES-256-GCM `v1.` format for every non-credentials row. Idempotent:
 * already-encrypted values are skipped, so it can be re-run safely.
 * `provider = 'credentials'` rows are excluded — their access_token
 * historically held a bcrypt password hash (H12 legacy), not a token.
 *
 * Run:  npx tsx scripts/encrypt-oauth-tokens.ts
 * Env:  DATABASE_URL, ELEVAY_APP_SECRET (same one prod uses)
 */
import postgres from "postgres";
import { encryptSecret } from "../src/lib/crypto/settings-encryption";

const TOKEN_COLS = ["access_token", "refresh_token", "id_token"] as const;

function isCiphertext(v: string): boolean {
  const p = v.split(".");
  return p.length === 4 && p[0] === "v1";
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
  if (!process.env.ELEVAY_APP_SECRET) throw new Error("ELEVAY_APP_SECRET missing");

  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  const rows = await sql`
    SELECT "userId", provider, "providerAccountId", access_token, refresh_token, id_token
    FROM auth_account
    WHERE provider != 'credentials'
  `;

  let updated = 0;
  let alreadyDone = 0;
  for (const r of rows) {
    const updates: Record<string, string> = {};
    for (const col of TOKEN_COLS) {
      const v = r[col] as string | null;
      if (v && !isCiphertext(v)) updates[col] = encryptSecret(v);
    }
    if (Object.keys(updates).length === 0) {
      alreadyDone++;
      continue;
    }
    await sql`
      UPDATE auth_account SET ${sql(updates)}
      WHERE provider = ${r.provider as string}
        AND "providerAccountId" = ${r.providerAccountId as string}
    `;
    updated++;
  }

  console.log(
    `auth_account: ${rows.length} OAuth rows — ${updated} encrypted, ${alreadyDone} already encrypted/empty`,
  );
  await sql.end();
}

main().catch((e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exit(1);
});
