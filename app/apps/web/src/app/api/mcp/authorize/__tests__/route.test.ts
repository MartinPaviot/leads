import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: (...args: any[]) => mockGetAuthContext(...args),
}));

let fixtureClient: any = null;
vi.mock("@/lib/mcp/oauth/clients", () => ({
  getMcpClient: vi.fn(async () => fixtureClient),
  isRedirectUriRegistered: (client: any, uri: string) => client?.redirectUris?.includes(uri) ?? false,
}));

import { GET } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  fixtureClient = {
    clientId: "c1",
    clientSecretHash: null,
    clientName: "Claude Desktop",
    redirectUris: ["https://claude.ai/callback"],
    tokenEndpointAuthMethod: "none",
  };
  mockGetAuthContext.mockResolvedValue(null);
});

function authorizeUrl(params: Record<string, string>) {
  const url = new URL("https://www.elevay.dev/api/mcp/authorize");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

const validParams = {
  response_type: "code",
  client_id: "c1",
  redirect_uri: "https://claude.ai/callback",
  code_challenge: "some-challenge",
  code_challenge_method: "S256",
};

describe("GET /api/mcp/authorize", () => {
  it("rejects an unsupported response_type", async () => {
    const res = await GET(new Request(authorizeUrl({ ...validParams, response_type: "token" })));
    expect(res.status).toBe(400);
  });

  it("rejects a request missing client_id/redirect_uri/code_challenge", async () => {
    const res = await GET(new Request(authorizeUrl({ response_type: "code" })));
    expect(res.status).toBe(400);
  });

  it("rejects a non-S256 code_challenge_method", async () => {
    const res = await GET(new Request(authorizeUrl({ ...validParams, code_challenge_method: "plain" })));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown client_id", async () => {
    fixtureClient = null;
    const res = await GET(new Request(authorizeUrl(validParams)));
    expect(res.status).toBe(400);
  });

  it("rejects an unregistered redirect_uri WITHOUT redirecting there (no open redirect)", async () => {
    const res = await GET(new Request(authorizeUrl({ ...validParams, redirect_uri: "https://evil.com/steal" })));
    expect(res.status).toBe(400);
    // Critical: must NOT be a redirect to the attacker-controlled URL.
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects to /sign-in with a relative callbackUrl when no session exists", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await GET(new Request(authorizeUrl(validParams)));
    expect(res.status).toBe(307);
    const location = res.headers.get("location")!;
    expect(location).toContain("/sign-in");
    expect(location).toContain(encodeURIComponent("/mcp/consent?"));
  });

  it("redirects straight to /mcp/consent when a session already exists", async () => {
    mockGetAuthContext.mockResolvedValue({ userId: "au1", tenantId: "t1", appUserId: "apu1", role: "member" });
    const res = await GET(new Request(authorizeUrl(validParams)));
    expect(res.status).toBe(307);
    const location = res.headers.get("location")!;
    expect(location).toContain("/mcp/consent?");
    expect(location).toContain("client_id=c1");
  });
});
