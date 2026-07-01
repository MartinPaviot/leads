import { describe, it, expect, vi, beforeEach } from "vitest";

const insertedValues: any[] = [];
const selectQueue: any[][] = [];
vi.mock("@/db", () => ({
  db: {
    insert: () => ({
      values: (v: any) => {
        insertedValues.push(v);
        return Promise.resolve();
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(selectQueue.shift() ?? []),
        }),
      }),
    }),
  },
}));

import {
  registerMcpClient,
  getMcpClient,
  isRedirectUriRegistered,
  verifyClientSecret,
} from "../clients";

beforeEach(() => {
  insertedValues.length = 0;
  selectQueue.length = 0;
});

describe("registerMcpClient", () => {
  it("registers a public client (token_endpoint_auth_method: none) with NO secret", async () => {
    const result = await registerMcpClient({
      redirect_uris: ["https://claude.ai/callback"],
      client_name: "Claude Desktop",
      token_endpoint_auth_method: "none",
    } as any);

    expect(result.client_id).toBeDefined();
    expect(result.client_secret).toBeUndefined();
    expect(insertedValues[0].clientSecretHash).toBeNull();
    expect(insertedValues[0].tokenEndpointAuthMethod).toBe("none");
  });

  it("registers a confidential client with a secret, stored HASHED not raw", async () => {
    const result = await registerMcpClient({
      redirect_uris: ["https://example.com/callback"],
      token_endpoint_auth_method: "client_secret_post",
    } as any);

    expect(result.client_secret).toBeDefined();
    expect(insertedValues[0].clientSecretHash).toBeDefined();
    expect(insertedValues[0].clientSecretHash).not.toBe(result.client_secret);
  });

  it("defaults to public (none) when token_endpoint_auth_method is omitted", async () => {
    const result = await registerMcpClient({ redirect_uris: ["https://x.com/cb"] } as any);
    expect(result.client_secret).toBeUndefined();
  });
});

describe("getMcpClient / isRedirectUriRegistered / verifyClientSecret", () => {
  it("returns null for an unknown client", async () => {
    selectQueue.push([]);
    expect(await getMcpClient("nope")).toBeNull();
  });

  it("round-trips redirect_uris and validates exact match only", async () => {
    selectQueue.push([
      {
        clientId: "c1",
        clientSecretHash: null,
        clientName: "Claude",
        redirectUris: ["https://claude.ai/callback"],
        tokenEndpointAuthMethod: "none",
      },
    ]);
    const client = await getMcpClient("c1");
    expect(client).not.toBeNull();
    expect(isRedirectUriRegistered(client!, "https://claude.ai/callback")).toBe(true);
    expect(isRedirectUriRegistered(client!, "https://claude.ai/callback/extra")).toBe(false);
    expect(isRedirectUriRegistered(client!, "https://evil.com/callback")).toBe(false);
  });

  it("verifyClientSecret fails closed for a public client (no secret to check)", () => {
    const client = {
      clientId: "c1",
      clientSecretHash: null,
      clientName: null,
      redirectUris: [],
      tokenEndpointAuthMethod: "none",
    };
    expect(verifyClientSecret(client, "anything")).toBe(false);
  });
});
