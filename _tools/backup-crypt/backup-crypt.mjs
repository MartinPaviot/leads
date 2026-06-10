#!/usr/bin/env node
// AES-256-GCM file encryption for local DB dumps (_credentials/db-backups).
// Key = SHA-256(ELEVAY_APP_SECRET) — same derivation as lib/crypto/settings-encryption.ts,
// read from env or app/apps/web/.env.local. No dependencies.
//
// Usage:
//   node backup-crypt.mjs encrypt <file>        -> writes <file>.enc
//   node backup-crypt.mjs decrypt <file.enc>    -> writes <file> back
//
// Format: "EVBK1" magic (5 bytes) | iv (12) | authTag (16) | ciphertext

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const MAGIC = Buffer.from("EVBK1");

function loadKey() {
  let secret = process.env.ELEVAY_APP_SECRET;
  if (!secret) {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const envPath = resolve(repoRoot, "app", "apps", "web", ".env.local");
    if (existsSync(envPath)) {
      const line = readFileSync(envPath, "utf8")
        .split(/\r?\n/)
        .find((l) => l.startsWith("ELEVAY_APP_SECRET="));
      if (line) secret = line.slice("ELEVAY_APP_SECRET=".length).trim().replace(/^"|"$/g, "");
    }
  }
  if (!secret) {
    console.error("ELEVAY_APP_SECRET not found (env or app/apps/web/.env.local)");
    process.exit(1);
  }
  return createHash("sha256").update(secret).digest();
}

const [mode, file] = process.argv.slice(2);
if (!mode || !file || !["encrypt", "decrypt"].includes(mode)) {
  console.error("usage: node backup-crypt.mjs encrypt|decrypt <file>");
  process.exit(1);
}

const key = loadKey();

if (mode === "encrypt") {
  const plain = readFileSync(file);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const out = Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ct]);
  writeFileSync(file + ".enc", out);
  console.log(`encrypted ${file} -> ${file}.enc (${out.length} bytes)`);
} else {
  const buf = readFileSync(file);
  if (!buf.subarray(0, 5).equals(MAGIC)) {
    console.error("not an EVBK1 file");
    process.exit(1);
  }
  const iv = buf.subarray(5, 17);
  const tag = buf.subarray(17, 33);
  const ct = buf.subarray(33);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  const outPath = file.endsWith(".enc") ? file.slice(0, -4) : file + ".dec";
  writeFileSync(outPath, plain);
  console.log(`decrypted ${file} -> ${outPath} (${plain.length} bytes)`);
}
