"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Save } from "lucide-react";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

interface BudgetStatus {
  allowed: boolean;
  spentUsd: number;
  capUsd: number;
  percentUsed: number | null;
  reason?: string;
}

interface BudgetResponse {
  status: BudgetStatus;
  breakdown: {
    totalCost: number;
    totalTokens: number;
    byFeature: Record<string, number>;
  };
  monthStart: string;
}

export default function LlmBudgetPage() {
  const { toast } = useToast();
  const [data, setData] = useState<BudgetResponse | null>(null);
  const [capInput, setCapInput] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/llm-budget");
      if (!res.ok) {
        toast("Couldn't load LLM budget", "error");
        return;
      }
      const payload = (await res.json()) as BudgetResponse;
      setData(payload);
      setCapInput(payload.status.capUsd > 0 ? String(payload.status.capUsd) : "");
    } catch (err) {
      console.warn("llm-budget: load failed", err);
      toast("Couldn't load LLM budget", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      const trimmed = capInput.trim();
      const capUsd = trimmed === "" ? null : Number(trimmed);
      if (trimmed !== "" && (Number.isNaN(capUsd as number) || (capUsd as number) < 0)) {
        toast("Enter a non-negative number, or leave blank to disable the cap", "error");
        return;
      }
      const res = await fetch("/api/settings/llm-budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capUsd }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error ?? "Couldn't save", "error");
        return;
      }
      toast("LLM budget saved", "success");
      await load();
    } catch (err) {
      console.warn("llm-budget: save failed", err);
      toast("Couldn't save", "error");
    } finally {
      setSaving(false);
    }
  }

  const status = data?.status;
  const byFeatureEntries = data
    ? Object.entries(data.breakdown.byFeature).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div>
      <SettingsHeader
        title="LLM budget"
        subtitle="Monthly spend cap that blocks AI calls before they fire"
      />

      <div>
        {loading || !status ? (
          <Card><CardBody><div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
            <Loader2 size={14} className="animate-spin" /> Loading budget…
          </div></CardBody></Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card>
                <CardBody>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>This month</p>
                  <p className="mt-2 text-[28px] font-bold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                    ${status.spentUsd.toFixed(2)}
                  </p>
                  <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                    {data.breakdown.totalTokens.toLocaleString()} tokens · since {new Date(data.monthStart).toLocaleDateString()}
                  </p>
                </CardBody>
              </Card>

              <Card>
                <CardBody>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Cap</p>
                  {status.capUsd > 0 ? (
                    <>
                      <p className="mt-2 text-[28px] font-bold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                        ${status.capUsd.toFixed(2)}
                      </p>
                      <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                        {status.percentUsed != null ? `${status.percentUsed.toFixed(0)}% used` : "—"}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mt-2 text-[18px] font-semibold" style={{ color: "var(--color-text-tertiary)" }}>
                        No cap
                      </p>
                      <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                        AI calls are never blocked
                      </p>
                    </>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardBody>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Status</p>
                  <div className="mt-2 flex items-center gap-2">
                    {status.allowed ? (
                      <>
                        <CheckCircle2 size={18} style={{ color: "var(--color-success)" }} />
                        <span className="text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Allowed</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={18} style={{ color: "var(--color-error)" }} />
                        <span className="text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Blocked</span>
                      </>
                    )}
                  </div>
                  {status.reason && (
                    <p className="mt-1 text-[11px]" style={{ color: "var(--color-error)" }}>
                      {status.reason}
                    </p>
                  )}
                </CardBody>
              </Card>
            </div>

            <Card className="mt-6">
              <CardBody>
                <h2 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Set a monthly cap</h2>
                <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  New AI calls are rejected with a human-readable reason once spend reaches the cap. Leave blank to disable. Changes take effect immediately (30s cache invalidated on save).
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[14px]" style={{ color: "var(--color-text-tertiary)" }}>$</span>
                    <Input
                      value={capInput}
                      onChange={(e) => setCapInput(e.target.value)}
                      placeholder="e.g. 50"
                      type="number"
                      step="any"
                      min="0"
                      className="w-32"
                    />
                    <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>/ month</span>
                  </div>
                  <Button onClick={save} disabled={saving}>
                    {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save</>}
                  </Button>
                </div>
              </CardBody>
            </Card>

            {byFeatureEntries.length > 0 && (
              <Card className="mt-6">
                <CardBody>
                  <h2 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Spend by feature</h2>
                  <div className="mt-3 space-y-2">
                    {byFeatureEntries.map(([feature, cost]) => {
                      const pct = data.breakdown.totalCost > 0 ? (cost / data.breakdown.totalCost) * 100 : 0;
                      return (
                        <div key={feature} className="flex items-center gap-3">
                          <span className="w-32 truncate text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{feature}</span>
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-bg-page)" }}>
                            <div
                              className="h-full"
                              style={{ width: `${Math.min(100, pct)}%`, background: "var(--color-accent)" }}
                            />
                          </div>
                          <span className="w-20 text-right text-[11px] tabular-nums" style={{ color: "var(--color-text-tertiary)" }}>
                            ${cost.toFixed(2)}
                          </span>
                          <Badge variant="neutral" size="sm">{pct.toFixed(0)}%</Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardBody>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
