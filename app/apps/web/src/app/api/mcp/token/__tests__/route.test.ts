import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/infra/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ success: true, resetAt: Date.now() + 1000 })),
  rateLimitResponse: vi.fn((resetAt: number) => new Response(JSON.stringify({ error: "rate limited" }), { status: 429 })),
}));

let fixtureClient: any = null;
vi.mock("@/lib/mcp/oauth/clients", () => ({
  getMcpClient: vi.fn(async () => fixtureClient),
  verifyClientSecret: vi.fn(() => false),
}));

const mockConsumeCode = vi.fn();
vi.mock("@/lib/mcp/oauth/authorization-codes", () => ({
  consumeAuthorizationCode: (...args: any[]) => mockConsumeCode(...args),
}));

const mockIssueTokens = vi.fn();
const mockRefreshTokens = vi.fn();
vi.mock("@/lib/mcp/oauth/access-tokens", () => ({
  issueTokens: (...args: any[]) => mockIssueTokens(...args),
  refreshTokens: (...args: any[]) => mockRefreshTokens(...args),
}));

import { POST } from "../route";

function formRequest(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return new Request("https://www.elevay.dev/api/mcp/token", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fixtureClient = {
    clientId: "c1",
    clientSecretHash: null,
    clientName: "Claude",
    redirectUris: ["https://claude.ai/callback"],
    tokenEndpointAuthMethod: "none",
  };
  mockIssueTokens.mockResolvedValue({ accessToken: "at1", refreshToken: "rt1", expiresInSeconds: 3600 });
});

describe("POST /api/mcp/token", () => {
  it("rejects an unknown client_id", async () => {
    fixtureClient = null;
    const res = await POST(formRequest({ grant_type: "authorization_code", client_id: "nope", code: "x", redirect_uri: "y", code_verifier: "z" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_client");
  });

  it("authorization_code: rejects a missing code/redirect_uri/code_verifier", async () => {
    const res = await POST(formRequest({ grant_type: "authorization_code", client_id: "c1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_request");
  });

  it("authorization_code: on success, returns a bearer token response", async () => {
    mockConsumeCode.mockResolvedValue({ ok: true, tenantId: "t1", authUserId: "au1", appUserId: "apu1", role: "member", scope: "read write" });
    const res = await POST(formRequest({
      grant_type: "authorization_code",
      client_id: "c1",
      code: "code-1",
      redirect_uri: "https://claude.ai/callback",
      code_verifier: "verifier-1",
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.access_token).toBe("at1");
    expect(json.token_type).toBe("bearer");
    expect(json.refresh_token).toBe("rt1");
    expect(json.scope).toBe("read write");
  });

  it("authorization_code: propagates a PKCE/expiry failure as invalid_grant", async () => {
    mockConsumeCode.mockResolvedValue({ ok: false, error: "invalid_grant", reason: "PKCE verification failed" });
    const res = await POST(formRequest({
      grant_type: "authorization_code",
      client_id: "c1",
      code: "code-1",
      redirect_uri: "https://claude.ai/callback",
      code_verifier: "wrong",
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_grant");
    expect(json.error_description).toContain("PKCE");
  });

  it("refresh_token: rejects a missing refresh_token", async () => {
    const res = await POST(formRequest({ grant_type: "refresh_token", client_id: "c1" }));
    expect(res.status).toBe(400);
  });

  it("refresh_token: on success, returns a rotated bearer token response", async () => {
    mockRefreshTokens.mockResolvedValue({ ok: true, tokens: { accessToken: "at2", refreshToken: "rt2", expiresInSeconds: 3600 }, scope: "read" });
    const res = await POST(formRequest({ grant_type: "refresh_token", client_id: "c1", refresh_token: "old-rt" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.access_token).toBe("at2");
    expect(json.scope).toBe("read");
  });

  it("rejects an unsupported grant_type", async () => {
    const res = await POST(formRequest({ grant_type: "password", client_id: "c1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unsupported_grant_type");
  });

  it("confidential client without a valid secret is rejected with 401", async () => {
    fixtureClient = { ...fixtureClient, tokenEndpointAuthMethod: "client_secret_post", clientSecretHash: "hash" };
    const res = await POST(formRequest({ grant_type: "refresh_token", client_id: "c1", refresh_token: "x" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_client");
  });
});
