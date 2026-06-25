"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Download,
  Trash2,
  Shield,
  Eye,
  EyeOff,
  Globe,
  Server,
  Clock,
  CheckCircle,
  AlertTriangle,
  FileText,
  Users,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DestructiveConfirm } from "@/components/ui/destructive-confirm";

type DpaStatus = "not_started" | "requested" | "signed";

interface ComplianceData {
  dpaStatus: Record<string, DpaStatus>;
  gdpr: {
    contactCreationMode: string;
    backsyncRange: string;
    doNotTrackDomains: string[];
    defaultDataVisibility: "everyone" | "team" | "private";
  };
}

const DPA_PROVIDER_LABELS: Record<string, { name: string; description: string }> = {
  anthropic: { name: "Anthropic", description: "LLM inference (Claude)" },
  neon: { name: "Neon", description: "PostgreSQL database hosting" },
  resend: { name: "Resend", description: "Transactional email delivery" },
  recall: { name: "Recall.ai", description: "Meeting recording and transcription" },
  stripe: { name: "Stripe", description: "Payment processing and billing" },
};

const DPA_STATUS_CONFIG: Record<
  DpaStatus,
  { label: string; variant: "success" | "warning" | "neutral" }
> = {
  signed: { label: "Signed", variant: "success" },
  requested: { label: "Requested", variant: "warning" },
  not_started: { label: "Not started", variant: "neutral" },
};

const VISIBILITY_OPTIONS: {
  value: "everyone" | "team" | "private";
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "everyone",
    label: "Everyone",
    description: "All workspace members can see all records.",
    icon: <Globe size={15} />,
  },
  {
    value: "team",
    label: "Team",
    description: "Members see records they own or are assigned to, plus their team's.",
    icon: <Users size={15} />,
  },
  {
    value: "private",
    label: "Private",
    description: "Users see only records they own or are assigned to.",
    icon: <EyeOff size={15} />,
  },
];

export default function PrivacyPage() {
  const { toast } = useToast();
  const [compliance, setCompliance] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [visibilitySaving, setVisibilitySaving] = useState(false);

  const fetchCompliance = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch("/api/settings/compliance");
      if (res.ok) {
        const data: ComplianceData = await res.json();
        setCompliance(data);
      } else {
        // Was silent: a 500 left compliance=null, so the page silently fell back
        // to "everyone" visibility + "Default" region instead of flagging that
        // the real settings never loaded.
        setLoadError(true);
        toast("Couldn't load your privacy settings.", "error");
      }
    } catch {
      setLoadError(true);
      toast("Couldn't load your privacy settings.", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchCompliance();
  }, [fetchCompliance]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/gdpr/export");
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast(data.error ?? "Export failed.", "error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `elevay-export-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Export ready. Check your downloads.", "success");
    } catch (err) {
      console.warn("privacy: export failed", err);
      toast("Network error. Try again.", "error");
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAll() {
    try {
      const res = await fetch("/api/gdpr/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE_ALL_DATA" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast(data.error ?? "Deletion failed. Contact support.", "error");
        return;
      }
      await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
      window.location.href = "/";
    } catch (err) {
      console.warn("privacy: delete failed", err);
      toast("Network error. Try again.", "error");
    }
  }

  async function handleVisibilityChange(
    value: "everyone" | "team" | "private"
  ) {
    setVisibilitySaving(true);
    try {
      const res = await fetch("/api/settings/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultDataVisibility: value }),
      });
      if (res.ok) {
        setCompliance((prev) =>
          prev
            ? {
                ...prev,
                gdpr: { ...prev.gdpr, defaultDataVisibility: value },
              }
            : prev
        );
        toast("Data visibility updated.", "success");
      } else {
        toast("Failed to update visibility.", "error");
      }
    } catch {
      toast("Network error. Try again.", "error");
    } finally {
      setVisibilitySaving(false);
    }
  }

  const currentVisibility =
    compliance?.gdpr?.defaultDataVisibility ?? "everyone";

  const gdprRegionConfigured =
    typeof process.env.NEXT_PUBLIC_GDPR_REGION === "string" &&
    process.env.NEXT_PUBLIC_GDPR_REGION.toLowerCase() === "eu";

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-[24px] font-semibold"
          style={{
            color: "var(--color-text-primary)",
            letterSpacing: "-0.3px",
          }}
        >
          Privacy and data
        </h1>
        <p
          className="mt-1.5 text-[13px]"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          GDPR controls, data processing agreements, and data management.
        </p>
      </header>

      {!loading && loadError && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg p-3 text-[12px]"
          style={{ background: "var(--color-error-soft, rgba(220,38,38,0.08))", color: "var(--color-error, #b91c1c)" }}
        >
          <AlertTriangle size={14} className="shrink-0" />
          <span>Couldn&apos;t load your privacy settings — the values below are defaults, not your saved configuration.</span>
          <button onClick={fetchCompliance} className="ml-auto shrink-0 font-medium underline">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div
          className="flex items-center gap-2 py-12 text-[13px]"
          style={{ color: "var(--color-text-muted)" }}
        >
          <div
            className="h-4 w-4 animate-spin rounded-full border-2 border-current"
            style={{ borderTopColor: "transparent" }}
          />
          Loading privacy settings...
        </div>
      ) : (
        <>
          {/* ── EU Data Region ── */}
          <Card>
            <CardBody className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      background: gdprRegionConfigured
                        ? "var(--color-success-soft)"
                        : "var(--color-bg-hover)",
                      color: gdprRegionConfigured
                        ? "var(--color-success)"
                        : "var(--color-text-muted)",
                    }}
                  >
                    <Globe size={16} />
                  </div>
                  <div>
                    <h2
                      className="text-[14px] font-semibold"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Data region
                    </h2>
                    <p
                      className="mt-1 text-[12px]"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {gdprRegionConfigured
                        ? "Your database is hosted in the EU (eu-central-1). All data stays within the European Economic Area."
                        : "GDPR_REGION is not set to EU. Your data may be stored outside the European Economic Area. Contact your administrator to configure EU data residency."}
                    </p>
                  </div>
                </div>
                <Badge variant={gdprRegionConfigured ? "success" : "neutral"}>
                  {gdprRegionConfigured ? "EU" : "Default"}
                </Badge>
              </div>
            </CardBody>
          </Card>

          {/* ── Data Visibility ── */}
          <div>
            <h3
              className="text-[11px] font-medium uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              Default data visibility
            </h3>
            <p
              className="mt-1 text-[12px]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Controls who can see newly captured records (emails, meetings,
              contacts).
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {VISIBILITY_OPTIONS.map((opt) => {
                const isActive = currentVisibility === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={visibilitySaving}
                    onClick={() => handleVisibilityChange(opt.value)}
                    className="flex items-start gap-3 rounded-xl p-4 text-left transition-all"
                    style={{
                      background: isActive
                        ? "var(--color-accent-soft, rgba(79,70,229,0.08))"
                        : "var(--color-bg-card)",
                      border: isActive
                        ? "1px solid var(--color-accent)"
                        : "1px solid var(--color-border-default)",
                      opacity: visibilitySaving ? 0.6 : 1,
                    }}
                  >
                    <div
                      className="mt-0.5"
                      style={{
                        color: isActive
                          ? "var(--color-accent)"
                          : "var(--color-text-muted)",
                      }}
                    >
                      {opt.icon}
                    </div>
                    <div>
                      <span
                        className="text-[13px] font-semibold"
                        style={{
                          color: isActive
                            ? "var(--color-accent)"
                            : "var(--color-text-primary)",
                        }}
                      >
                        {opt.label}
                      </span>
                      <p
                        className="mt-0.5 text-[12px]"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {opt.description}
                      </p>
                    </div>
                    {isActive && (
                      <CheckCircle
                        size={16}
                        className="ml-auto mt-0.5 shrink-0"
                        style={{ color: "var(--color-accent)" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Sub-processors / DPA Status ── */}
          <div>
            <h3
              className="text-[11px] font-medium uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              Sub-processors
            </h3>
            <p
              className="mt-1 text-[12px]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Third-party services that process your data. Track Data Processing
              Agreement (DPA) status for each.
            </p>
            <div className="mt-3 space-y-2">
              {Object.entries(DPA_PROVIDER_LABELS).map(
                ([key, { name, description }]) => {
                  const status: DpaStatus =
                    compliance?.dpaStatus?.[key] ?? "not_started";
                  const config = DPA_STATUS_CONFIG[status];
                  return (
                    <Card key={key}>
                      <CardBody className="px-5 py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                              style={{
                                background: "var(--color-bg-hover)",
                                color: "var(--color-text-muted)",
                              }}
                            >
                              <Server size={14} />
                            </div>
                            <div>
                              <span
                                className="text-[13px] font-medium"
                                style={{
                                  color: "var(--color-text-primary)",
                                }}
                              >
                                {name}
                              </span>
                              <p
                                className="text-[11px]"
                                style={{
                                  color: "var(--color-text-tertiary)",
                                }}
                              >
                                {description}
                              </p>
                            </div>
                          </div>
                          <Badge variant={config.variant}>{config.label}</Badge>
                        </div>
                      </CardBody>
                    </Card>
                  );
                }
              )}
            </div>
          </div>

          {/* ── Data Retention ── */}
          <Card>
            <CardBody className="p-5">
              <div className="flex items-start gap-3">
                <div
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: "var(--color-bg-hover)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  <Clock size={16} />
                </div>
                <div>
                  <h2
                    className="text-[14px] font-semibold"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Data retention
                  </h2>
                  <p
                    className="mt-1 text-[12px]"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Your data is retained for the duration of your active
                    subscription. Upon cancellation, all data is permanently
                    deleted after a 30-day grace period. During the grace period,
                    you can reactivate your subscription to retain your data.
                  </p>
                  <div
                    className="mt-3 flex items-center gap-1.5 text-[12px]"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    <Shield size={12} />
                    <span>
                      Backups are encrypted at rest (AES-256) and in transit
                      (TLS 1.3)
                    </span>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* ── Data Export (GDPR SAR) ── */}
          <div
            style={{
              borderTop: "1px solid var(--color-border-default)",
              paddingTop: "24px",
            }}
          >
            <h3
              className="text-[11px] font-medium uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              Your data
            </h3>

            <div className="mt-3 space-y-3">
              <Card>
                <CardBody className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{
                          background: "var(--color-bg-hover)",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        <FileText size={16} />
                      </div>
                      <div>
                        <h2
                          className="text-[14px] font-semibold"
                          style={{ color: "var(--color-text-primary)" }}
                        >
                          Export your data
                        </h2>
                        <p
                          className="mt-1 text-[12px]"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          Download a JSON archive of your profile, contacts,
                          companies, deals, activities, notes, and tasks. This
                          satisfies the GDPR Subject Access Request (Article 15).
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Download size={13} />}
                      onClick={handleExport}
                      loading={exporting}
                    >
                      {exporting ? "Preparing..." : "Download JSON"}
                    </Button>
                  </div>
                </CardBody>
              </Card>

              <Card
                style={{
                  border: "1px solid rgba(220,38,38,0.25)",
                }}
              >
                <CardBody className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{
                          background: "rgba(220,38,38,0.08)",
                          color: "var(--color-error, #b91c1c)",
                        }}
                      >
                        <AlertTriangle size={16} />
                      </div>
                      <div>
                        <h2
                          className="text-[14px] font-semibold"
                          style={{
                            color: "var(--color-error, #b91c1c)",
                          }}
                        >
                          Delete all data
                        </h2>
                        <p
                          className="mt-1 text-[12px]"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          Permanently remove all workspace data including
                          contacts, companies, deals, email history, sequences,
                          chat threads, and your user account. This satisfies the
                          GDPR Right to Erasure (Article 17). This action cannot
                          be undone.
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      icon={<Trash2 size={13} />}
                      onClick={() => setDeleteConfirmOpen(true)}
                    >
                      Delete all data
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>
        </>
      )}

      <DestructiveConfirm
        open={deleteConfirmOpen}
        title="Permanently delete all data?"
        description="This will erase every contact, company, deal, email, sequence, chat thread, and your user account. Your tenant will be removed. You will be signed out. This cannot be undone."
        verifyWord="DELETE"
        confirmLabel="Delete all data"
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteAll}
      />
    </div>
  );
}
