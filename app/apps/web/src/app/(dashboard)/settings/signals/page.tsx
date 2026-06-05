"use client";

import { useEffect, useState } from "react";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Radio, Plus, Loader2, Check } from "lucide-react";

interface CustomSignal {
  id: string;
  name: string;
  description: string;
  colorIndex: number | null;
  backfilledAt: string | null;
  createdAt: string;
}

/**
 * Custom-signal settings page.
 *
 * Monaco shows "custom boolean columns" configured per workspace
 * (Common Investor / Sales-led / YC) — their version presumably goes
 * through a forward-deployed AE. Ours is self-serve: the user types
 * a plain-language description, the LLM generates a three-tier
 * detection plan, and a backfill runs against the whole TAM.
 *
 * Page intentionally lean — list + inline create form. No edit flow
 * yet (edit = delete + recreate); that lives behind a later sprint.
 */
export default function CustomSignalsPage() {
  const [signals, setSignals] = useState<CustomSignal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/custom-signals");
      if (!res.ok) return;
      const data = await res.json();
      setSignals(data.signals ?? []);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Poll every 5s while any signal is still backfilling so the chip
  // flips from "Backfilling…" to "Ready" without a page refresh.
  useEffect(() => {
    const hasPending = signals.some((s) => !s.backfilledAt);
    if (!hasPending) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [signals]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (name.trim().length === 0 || description.trim().length < 3) {
      setError("Give the signal a name and describe what to detect.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/custom-signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `Failed to create (HTTP ${res.status})`);
        return;
      }
      setJustCreatedId(body.signal?.id ?? null);
      setName("");
      setDescription("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  if (!loaded) return null;

  return (
    <>
      <SettingsHeader
        title="Custom signals"
        subtitle="Define boolean signals — they appear as columns on every account. Describe what you'd like detected; the plan is generated and run against your whole TAM automatically."
      />

      {/* Create form */}
      <section
        className="mt-8 rounded-lg p-4"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
        }}
      >
        <div className="flex items-center gap-2">
          <Plus size={14} style={{ color: "var(--color-accent)" }} />
          <h2
            className="text-[13px] font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            New signal
          </h2>
        </div>

        <form onSubmit={handleCreate} className="mt-4 space-y-3">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Public status page"
            maxLength={40}
          />
          <Textarea
            label="Detect when"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. The company publishes a Status page or uptime dashboard at a known path (/status, /trust) or mentions Statuspage.io / Atlassian Statuspage in their profile."
            autoResize
            maxLength={600}
          />

          <div className="flex items-center gap-3">
            <Button
              variant="solid"
              size="sm"
              type="submit"
              disabled={creating}
              icon={creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            >
              {creating ? "Generating plan…" : "Create & backfill"}
            </Button>
            {error && (
              <p className="text-[12px]" style={{ color: "var(--color-error)" }}>
                {error}
              </p>
            )}
          </div>

          <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            When you create a signal, it&apos;s evaluated against every
            company in your TAM. Results show up as a chip column on the
            Accounts page. Backfill takes 1–3 minutes for a 500-company
            TAM.
          </p>
        </form>
      </section>

      {/* Existing signals */}
      <section className="mt-8">
        <h2
          className="text-[12px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Your signals
        </h2>

        {signals.length === 0 ? (
          <p
            className="mt-4 text-[13px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            You haven&apos;t defined any custom signals yet.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {signals.map((s) => (
              <div
                key={s.id}
                className="rounded-lg p-3 flex items-start gap-3"
                style={{
                  background: "var(--color-bg-card)",
                  border: `1px solid ${
                    s.id === justCreatedId
                      ? "var(--color-accent)"
                      : "var(--color-border-default)"
                  }`,
                }}
              >
                <Radio
                  size={14}
                  className="mt-[2px] shrink-0"
                  style={{ color: "var(--color-accent)" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3
                      className="text-[13px] font-semibold"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {s.name}
                    </h3>
                    {s.backfilledAt ? (
                      <Badge variant="success" size="sm">
                        <Check size={10} className="mr-0.5" /> Ready
                      </Badge>
                    ) : (
                      <Badge variant="warning" size="sm">
                        <Loader2 size={10} className="mr-0.5 animate-spin" />
                        Backfilling
                      </Badge>
                    )}
                  </div>
                  <p
                    className="mt-1 text-[12px]"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {s.description}
                  </p>
                  <p
                    className="mt-1 text-[10px]"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    Created {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
