/**
 * Remote-image privacy proxy for the inbox reading pane (INBOX-R02).
 *
 * When a user chooses to load a message's remote images, the pane routes each
 * one through here instead of letting the browser fetch it directly — so the
 * sender's server sees OUR egress IP and a generic UA, never the recipient's IP
 * or "opened-at" timing. Auth-gated (no open proxy), SSRF-guarded against
 * internal targets (including a post-DNS re-check for rebinding), and bounded in
 * size/time. Redirects are NOT followed (a redirect could escape the guard).
 */
import { getAuthContext } from "@/lib/auth/auth-utils";
import { isUrlSafeForProxy, isPrivateIp } from "@/lib/inbox/proxy-guard";
import { lookup } from "node:dns/promises";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const FETCH_TIMEOUT_MS = 8000;

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return new Response("Unauthorized", { status: 401 });

  const target = new URL(req.url).searchParams.get("url");
  if (!target || !isUrlSafeForProxy(target)) {
    return new Response("Invalid image URL", { status: 400 });
  }

  // DNS-rebinding defence: resolve the host and reject if ANY address is private.
  try {
    const addrs = await lookup(new URL(target).hostname, { all: true });
    if (addrs.some((a) => isPrivateIp(a.address))) {
      return new Response("Blocked", { status: 400 });
    }
  } catch {
    return new Response("DNS resolution failed", { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(target, {
      signal: controller.signal,
      redirect: "error", // following a redirect could escape the SSRF guard
      headers: { "User-Agent": "Elevay-Image-Proxy", Accept: "image/*" },
    });
    if (!upstream.ok) return new Response("Upstream error", { status: 502 });

    const type = upstream.headers.get("content-type") || "";
    if (!type.toLowerCase().startsWith("image/")) {
      return new Response("Not an image", { status: 415 });
    }
    const declared = upstream.headers.get("content-length");
    if (declared && parseInt(declared, 10) > MAX_BYTES) {
      return new Response("Image too large", { status: 413 });
    }

    // Stream with a hard cap — never trust Content-Length. An upstream can omit
    // it and stream an unbounded body, which `arrayBuffer()` would buffer whole
    // into memory before any size check. Abort the moment we cross the limit.
    if (!upstream.body) return new Response("Empty response", { status: 502 });
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel().catch(() => {});
        controller.abort();
        return new Response("Image too large", { status: 413 });
      }
      chunks.push(value);
    }

    return new Response(Buffer.concat(chunks), {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=86400",
        "Content-Security-Policy": "default-src 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Fetch failed", { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
