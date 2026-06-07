import { writeFileSync } from "node:fs";
async function main() {
  const url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";
  const out = "C:/Users/marti/leads/cloudflared.exe";
  console.log("downloading cloudflared...");
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(180_000) });
  console.log("status", res.status, "len", res.headers.get("content-length"));
  if (!res.ok) { console.error("download failed", res.status); process.exit(1); }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(out, buf);
  console.log(`wrote ${out} (${(buf.length / 1e6).toFixed(1)} MB)`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
