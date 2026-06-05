"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Copy, Trash2, Plus, Key, ExternalLink } from "lucide-react";

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
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [showNameInput, setShowNameInput] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
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

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/mcp/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() || "Default key" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create key");
      }
      const data = await res.json();
      setRevealedKey(data.key.rawKey);
      setNewKeyName("");
      setShowNameInput(false);
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  }

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
                  Protocol
                </label>
                <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                  JSON-RPC 2.0 over HTTP POST with Bearer token authentication
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      </section>

      {/* Revealed key banner */}
      {revealedKey && (
        <div
          className="mt-6 rounded-lg p-4"
          style={{
            background: "var(--color-success-soft)",
            border: "1px solid var(--color-success)",
          }}
        >
          <p className="text-[13px] font-semibold" style={{ color: "var(--color-success)" }}>
            API key created. Copy it now - it won't be shown again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code
              className="flex-1 rounded px-3 py-1.5 text-[13px] font-mono select-all"
              style={{
                background: "var(--color-bg-card)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-default)",
              }}
            >
              {revealedKey}
            </code>
            <Button
              variant="solid"
              size="sm"
              onClick={() => handleCopy(revealedKey)}
              icon={<Copy size={13} />}
            >
              Copy
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRevealedKey(null)}
            className="mt-2"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* API Keys */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2
            className="text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            API Keys
          </h2>
          {!showNameInput && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNameInput(true)}
              icon={<Plus size={13} />}
            >
              Create key
            </Button>
          )}
        </div>

        {/* Create key form */}
        {showNameInput && (
          <Card className="mt-3">
            <CardBody>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Input
                    label="Key name"
                    placeholder="e.g. Claude Desktop, Cursor"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  />
                </div>
                <Button
                  variant="solid"
                  size="md"
                  onClick={handleCreate}
                  loading={creating}
                >
                  Generate
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => {
                    setShowNameInput(false);
                    setNewKeyName("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {error && (
          <p className="mt-2 text-[13px]" style={{ color: "var(--color-error)" }}>
            {error}
          </p>
        )}

        {/* Key list */}
        <div className="mt-3 space-y-2">
          {loading ? (
            <p className="text-[13px] py-4" style={{ color: "var(--color-text-tertiary)" }}>
              Loading...
            </p>
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
                    No API keys yet
                  </p>
                  <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                    Create an API key to connect external AI tools to your CRM.
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
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`}
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
{`claude mcp add elevay \\
  --transport http \\
  --url ${mcpUrl} \\
  --header "Authorization: Bearer YOUR_API_KEY"`}
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
                Test with cURL
              </h3>
              <pre
                className="mt-2 rounded p-3 text-[12px] font-mono overflow-x-auto"
                style={{
                  background: "var(--color-bg-emphasis)",
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border-default)",
                }}
              >
{`curl -X POST ${mcpUrl} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}
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
              <div className="mt-2 space-y-1.5">
                {[
                  ["search_records", "Search contacts, companies, or deals by name"],
                  ["get_contact", "Get a single contact by ID"],
                  ["get_company", "Get a single company by ID"],
                  ["get_deal", "Get a single deal by ID"],
                  ["list_contacts", "List contacts with optional search"],
                  ["list_companies", "List companies with optional search"],
                  ["list_deals", "List deals with optional stage filter"],
                  ["create_contact", "Create a new contact"],
                  ["create_deal", "Create a new deal"],
                  ["log_note", "Add a note to an entity"],
                  ["list_activities", "List recent activities"],
                  ["search_crm", "Semantic search across all CRM data"],
                ].map(([name, desc]) => (
                  <div key={name} className="flex items-start gap-2">
                    <code
                      className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-mono"
                      style={{
                        background: "var(--color-bg-hover)",
                        color: "var(--color-accent)",
                      }}
                    >
                      {name}
                    </code>
                    <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                      {desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>
      </section>

      <ConfirmDialog
        open={revokeKeyId !== null}
        title="Revoke this API key?"
        description="Any integration using this key will stop working immediately. You can generate a new key anytime."
        confirmLabel="Revoke key"
        variant="destructive"
        onConfirm={confirmRevoke}
        onCancel={() => setRevokeKeyId(null)}
        busy={revoking}
      />
    </>
  );
}
