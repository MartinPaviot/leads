// Verifies (boolean only) that the ELEVAY_APP_SECRET in env decrypts the
// ciphertexts already present in the target DB (connected_mailboxes).
// Never prints plaintext or the secret.
import postgres from "postgres";
import { verifyCiphertextIntegrity } from "../src/lib/crypto/settings-encryption";

async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });
  const rows = await s.unsafe(
    "SELECT secret_encrypted FROM connected_mailboxes WHERE secret_encrypted IS NOT NULL LIMIT 3",
  );
  if (rows.length === 0) {
    console.log("NO_CIPHERTEXT_ROWS");
  } else {
    const ok = rows.every((r) =>
      verifyCiphertextIntegrity(r.secret_encrypted as string),
    );
    console.log(ok ? "SECRET_MATCHES" : "SECRET_MISMATCH");
  }
  await s.end();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
