/**
 * SOC2 R-08b — create the dedicated application role `elevay_app`:
 * LOGIN, NOSUPERUSER, NOBYPASSRLS — subject to the tenant-isolation
 * policies (it does not own the tables, and 0074 does not use FORCE,
 * so the postgres admin/migration path stays exempt).
 *
 * Idempotent: re-running rotates the password and re-applies grants.
 * The generated pooler connection string is written to
 * `_credentials/elevay-app-db-url.txt` (gitignored) — never printed.
 *
 * Run:  npx tsx scripts/create-rls-role.ts
 * Env:  DATABASE_URL (admin, pooler form postgres.<ref>@host:6543)
 */
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROLE = "elevay_app";

async function main() {
  const adminUrl = process.env.DATABASE_URL!;
  const u = new URL(adminUrl);
  // Pooler usernames are role.<project-ref>; reuse the admin's ref.
  const ref = u.username.includes(".") ? u.username.split(".")[1] : null;

  const password = randomBytes(24).toString("base64url"); // URL-safe alphabet
  const s = postgres(adminUrl, { max: 1, onnotice: () => {} });

  const [exists] = await s.unsafe(
    `SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}'`,
  );
  if (exists) {
    await s.unsafe(
      `ALTER ROLE ${ROLE} WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${password}'`,
    );
    console.log(`role ${ROLE}: exists — password rotated, attributes re-asserted`);
  } else {
    await s.unsafe(
      `CREATE ROLE ${ROLE} WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${password}'`,
    );
    console.log(`role ${ROLE}: created`);
  }

  // DML everywhere + CREATE (a few admin routes run one-shot DDL).
  // Crucially NOT the table owner -> RLS policies apply.
  await s.unsafe(`GRANT USAGE, CREATE ON SCHEMA public TO ${ROLE}`);
  await s.unsafe(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${ROLE}`);
  await s.unsafe(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${ROLE}`);
  await s.unsafe(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${ROLE}`);
  // Future tables created by the admin/migration role stay accessible.
  await s.unsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO ${ROLE}`,
  );
  await s.unsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO ${ROLE}`,
  );
  console.log("grants applied (tables, sequences, functions, default privileges)");

  const [check] = await s.unsafe(
    `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = '${ROLE}'`,
  );
  console.log(
    `verify: rolbypassrls=${check.rolbypassrls} rolsuper=${check.rolsuper}`,
  );
  await s.end();

  const newUser = ref ? `${ROLE}.${ref}` : ROLE;
  const newUrl = `postgresql://${newUser}:${password}@${u.hostname}:${u.port}${u.pathname}`;
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
  const outDir = join(repoRoot, "_credentials");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, "elevay-app-db-url.txt");
  writeFileSync(outFile, newUrl + "\n", { encoding: "utf8" });
  console.log(`connection string written to ${outFile} (NOT printed)`);
}

main().catch((e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exit(1);
});
