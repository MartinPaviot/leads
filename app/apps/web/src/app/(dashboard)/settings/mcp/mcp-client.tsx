"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Copy, Trash2, Key } from "lucide-react";

interface McpKeyDisplay {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export default function McpSettingsPage() {
  const [keys, setKeys] = useState<McpKeyDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp/keys");
      if (!res.ok) throw new Error("Failed to fetch keys");
      const data = await res.json();
      setKeys(data.keys || []);
    } catch {
      setError("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  // E5 — MCP key revocation routes through ConfirmDialog. Busy flag
  // lets the button reflect the pending DELETE.
  const [revokeKeyId, setRevokeKeyId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  function handleRevoke(keyId: string) {
    setRevokeKeyId(keyId);
  }

  async function confirmRevoke() {
    if (!revokeKeyId) return;
    setRevoking(true);
    setError(null);
    try {
      const res = await fetch("/api/mcp/keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: revokeKeyId }),
      });
      if (!res.ok) throw new Error("Failed to revoke key");
      await fetchKeys();
    } catch {
      setError("Failed to revoke key");
    } finally {
      setRevoking(false);
      setRevokeKeyId(null);
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const mcpUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/mcp`
      : "https://your-domain.com/api/mcp";

  return (
    <>
      <SettingsHeader
        title="MCP Integration"
        subtitle="Connect external AI tools (Claude Desktop, Cursor, etc.) to your CRM data via the Model Context Protocol."
      />

      {/* Connection info */}
      <section className="mt-8">
        <h2
          className="text-[12px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Connection Details
        </h2>

        <Card className="mt-3">
          <CardBody>
            <div className="space-y-3">
              <div>
                <label className="text-[12px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>
                  MCP Server URL
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <code
                    className="flex-1 rounded px-3 py-1.5 text-[13px] font-mono"
                    style={{
                      background: "var(--color-bg-emphasis)",
                      color: "var(--color-text-primary)",
                      border: "1px solid var(--color-border-default)",
                    }}
                  >
                    {mcpUrl}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(mcpUrl)}
                    icon={<Copy size={13} />}
                  >
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-[12px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>
                  Authentication
                </label>
                <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                  OAuth 2.1 (per-user, scoped to your role — the same permissions you have in the LeadSens app).
                  Your MCP client discovers the connection automatically from this URL; you&apos;ll be redirected here
                  to sign in and approve the first time it connects. No key to copy or manage.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      </section>

      {/* Legacy API Keys — deprecated, kept read-only for cleanup */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2
            className="text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Legacy API Keys (deprecated)
          </h2>
        </div>
        <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          API keys no longer work with the MCP connection above — it now uses OAuth. Existing keys are listed here
          so you can revoke ones you no longer need; you can&apos;t create new ones.
        </p>

        {error && (
          <p className="mt-2 text-[13px]" style={{ color: "var(--color-error)" }}>
            {error}
          </p>
        )}

        {/* Key list */}
        <div className="mt-3 space-y-2">
          {loading ? (
            [0, 1, 2].map((i) => (
              <Card key={i}>
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-[15px] w-[15px] rounded" />
                      <div>
                        <Skeleton className="h-3.5 w-32 rounded" />
                        <div className="flex items-center gap-2 mt-1">
                          <Skeleton className="h-2.5 w-16 rounded" />
                          <Skeleton className="h-2.5 w-24 rounded" />
                        </div>
                      </div>
                    </div>
                    <Skeleton className="h-7 w-16 rounded-md" />
                  </div>
                </CardBody>
              </Card>
            ))
          ) : keys.length === 0 ? (
            <Card>
              <CardBody>
                <div className="flex flex-col items-center py-6 text-center">
                  <Key
                    size={32}
                    style={{ color: "var(--color-text-tertiary)", opacity: 0.5 }}
                  />
                  <p
                    className="mt-3 text-[13px] font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    No legacy API keys
                  </p>
                  <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                    Nothing to clean up — connect external AI tools via the OAuth flow above instead.
                  </p>
                </div>
              </CardBody>
            </Card>
          ) : (
            keys.map((key) => (
              <Card key={key.id}>
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Key size={15} style={{ color: "var(--color-text-tertiary)" }} />
                      <div>
                        <p
                          className="text-[13px] font-medium"
                          style={{ color: "var(--color-text-primary)" }}
                        >
                          {key.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <code
                            className="text-[11px] font-mono"
                            style={{ color: "var(--color-text-tertiary)" }}
                          >
                            {key.keyPrefix}
                          </code>
                          <span
                            className="text-[11px]"
                            style={{ color: "var(--color-text-tertiary)" }}
                          >
                            Created {new Date(key.createdAt).toLocaleDateString()}
                          </span>
                          {key.lastUsedAt && (
                            <Badge variant="info" size="sm">
                              Used {new Date(key.lastUsedAt).toLocaleDateString()}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevoke(key.id)}
                      icon={<Trash2 size={13} />}
                      style={{ color: "var(--color-error)" }}
                    >
                      Revoke
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </div>
      </section>

      {/* Usage instructions */}
      <section className="mt-8">
        <h2
          className="text-[12px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Setup Instructions
        </h2>

        <Card className="mt-3">
          <CardBody className="space-y-4">
            <div>
              <h3
                className="text-[13px] font-semibold"
                style={{ color: "var(--color-text-primary)" }}
              >
                Claude Desktop
              </h3>
              <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                Add this to your Claude Desktop configuration file (claude_desktop_config.json):
              </p>
              <pre
                className="mt-2 rounded p-3 text-[12px] font-mono overflow-x-auto"
                style={{
                  background: "var(--color-bg-emphasis)",
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border-default)",
                }}
              >
{`{
  "mcpServers": {
    "elevay": {
      "url": "${mcpUrl}"
    }
  }
}`}
              </pre>
              <p className="mt-2 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                No API key — Claude Desktop discovers the OAuth connection automatically and opens a browser tab for
                you to sign in and approve on first connect.
              </p>
            </div>

            <div
              style={{
                borderTop: "1px solid var(--color-border-default)",
                paddingTop: "16px",
              }}
            >
              <h3
                className="text-[13px] font-semibold"
                style={{ color: "var(--color-text-primary)" }}
              >
                Claude Code
              </h3>
              <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                Run this command to add Elevay as an MCP server:
              </p>
              <pre
                className="mt-2 rounded p-3 text-[12px] font-mono overflow-x-auto"
                style={{
                  background: "var(--color-bg-emphasis)",
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border-default)",
                }}
              >
{`claude mcp add elevay --transport http --url ${mcpUrl}`}
              </pre>
            </div>

            <div
              style={{
                borderTop: "1px solid var(--color-border-default)",
                paddingTop: "16px",
              }}
            >
              <h3
                className="text-[13px] font-semibold"
                style={{ color: "var(--color-text-primary)" }}
              >
                Check the connection is live
              </h3>
              <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                This confirms LeadSens is advertising the OAuth connection correctly — actually calling a tool
                requires completing the sign-in + approval step through a real MCP client (above), not cURL alone.
              </p>
              <pre
                className="mt-2 rounded p-3 text-[12px] font-mono overflow-x-auto"
                style={{
                  background: "var(--color-bg-emphasis)",
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border-default)",
                }}
              >
{`curl ${typeof window !== "undefined" ? window.location.origin : "https://your-domain.com"}/.well-known/oauth-authorization-server`}
              </pre>
            </div>

            <div
              style={{
                borderTop: "1px solid var(--color-border-default)",
                paddingTop: "16px",
              }}
            >
              <h3
                className="text-[13px] font-semibold"
                style={{ color: "var(--color-text-primary)" }}
              >
                Available Tools
              </h3>
              <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                40+ tools spanning contacts, accounts, deals, notes, activities, and search — scoped to your role
                (the same permissions you have in the LeadSens app). Destructive actions (delete/merge) are never
                available over MCP.
              </p>
            </div>
          </CardBody>
        </Card>
      </section>

      <ConfirmDialog
        open={revokeKeyId !== null}
        title="Revoke this legacy API key?"
        description="This key no longer works against the MCP connection (which now uses OAuth) — revoking just removes it from this list."
        confirmLabel="Revoke key"
        variant="destructive"
        onConfirm={confirmRevoke}
        onCancel={() => setRevokeKeyId(null)}
        busy={revoking}
      />
    </>
  );
}
