// Post-backfill check (boolean only): every non-credentials auth_account
// row is v1.-encrypted, decrypts cleanly, and the decrypted id_token has
// JWT shape. Never prints token material.
import postgres from "postgres";
import { decryptOAuthToken } from "../src/lib/crypto/oauth-token-crypto";

function isCiphertext(v: string | null): boolean {
  if (!v) return true; // empty is fine
  const p = v.split(".");
  return p.length === 4 && p[0] === "v1";
}

async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });
  const rows = await s.unsafe(
    "SELECT provider, access_token, refresh_token, id_token FROM auth_account WHERE provider != 'credentials'",
  );
  let allEncrypted = true;
  let allDecrypt = true;
  let jwtShape = true;
  for (const r of rows) {
    for (const col of ["access_token", "refresh_token", "id_token"] as const) {
      const v = r[col] as string | null;
      if (!isCiphertext(v)) allEncrypted = false;
      if (v) {
        try {
          const plain = decryptOAuthToken(v);
          if (col === "id_token" && plain && plain.split(".").length !== 3) {
            jwtShape = false;
          }
        } catch {
          allDecrypt = false;
        }
      }
    }
  }
  console.log(
    `rows=${rows.length} allEncrypted=${allEncrypted} allDecrypt=${allDecrypt} idTokenJwtShape=${jwtShape}`,
  );
  await s.end();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
