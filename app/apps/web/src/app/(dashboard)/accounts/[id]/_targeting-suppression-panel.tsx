"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

/**
 * Spec 35 — Account-page targeting + suppression panel.
 * - Shows the reversible targeting_status.
 * - Shows a READ-ONLY badge for each active suppression (type, scope, date,
 *   source). opt_out / complaint are permanent: no action is offered (R7.3).
 *   manual_dnc / existing_customer / hard_bounce can be deactivated (server
 *   enforces admin; a 403 surfaces as a toast) (R7.6).
 * - Manual "Do not contact" (R7.5): an inline reason form -> POST
 *   /api/accounts/suppress (value resolved server-side from companyId).
 */

export interface SuppressionBadge {
  type: string;
  level: string; // address | domain | account
  value: string;
  reason: string | null;
  source: string | null;
  createdAt: string | null;
}

const PERMANENT = new Set(["opt_out", "complaint"]);

const TYPE_LABEL: Record<string, string> = {
  opt_out: "Opt-out",
  complaint: "Complaint",
  manual_dnc: "Manual do-not-contact",
  existing_customer: "Already a customer",
  hard_bounce: "Hard bounce",
  competitor: "Competitor",
};

const SCOPE_LABEL: Record<string, string> = {
  address: "Email",
  domain: "Domain",
  account: "Account",
};

const TARGETING_LABEL: Record<string, string> = {
  unreviewed: "Unreviewed",
  targeted: "Targeted",
  archived: "Archived",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

export function TargetingSuppressionPanel({
  companyId,
  targetingStatus,
  suppressions,
  onChange,
}: {
  companyId: string;
  targetingStatus: string | null;
  suppressions: SuppressionBadge[];
  onChange: () => void;
}) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const hasSuppression = suppressions.length > 0;

  async function addDnc() {
    if (!reason.trim()) {
      toast("A reason is required", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/accounts/suppress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: "account", companyId, reason: reason.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast(e.error || "Failed to add to suppression list", "error");
        return;
      }
      toast("Account added to the suppression list", "success");
      setAdding(false);
      setReason("");
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(s: SuppressionBadge) {
    setBusy(true);
    try {
      const res = await fetch("/api/accounts/suppress/deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: s.level, value: s.value }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast(e.error || "Could not deactivate this suppression", "error");
        return;
      }
      toast("Suppression deactivated", "success");
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Targeting</span>
        <Badge variant={targetingStatus === "targeted" ? "success" : targetingStatus === "archived" ? "neutral" : "warning"}>
          {TARGETING_LABEL[targetingStatus ?? "unreviewed"] ?? "Unreviewed"}
        </Badge>
      </div>

      {hasSuppression ? (
        <div className="flex flex-col gap-2">
          {suppressions.map((s, i) => (
            <div
              key={`${s.level}:${s.value}:${i}`}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  Do not contact — {TYPE_LABEL[s.type] ?? s.type}
                </span>
                <span className="text-xs text-muted-foreground">
                  {SCOPE_LABEL[s.level] ?? s.level}
                  {s.createdAt ? ` · ${fmtDate(s.createdAt)}` : ""}
                  {s.source ? ` · ${s.source}` : ""}
                  {s.reason ? ` · ${s.reason}` : ""}
                </span>
              </div>
              {PERMANENT.has(s.type) ? (
                <span className="text-xs text-muted-foreground">Permanent</span>
              ) : (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => deactivate(s)}>
                  Deactivate
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : adding ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="dnc-reason">
            Reason for do-not-contact
          </label>
          <input
            id="dnc-reason"
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. asked not to be contacted"
            maxLength={500}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={addDnc}>
              Add to suppression list
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setAdding(false); setReason(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          Do not contact
        </Button>
      )}
    </div>
  );
}
