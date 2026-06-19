"use client";

import { useState } from "react";
import { Building2, User, TrendingUp, Check, X, ArrowRight, Pencil } from "lucide-react";

type ActionType = "create" | "update";
type EntityType = "contact" | "account" | "deal";

interface ActionCardProps {
  actionType: ActionType;
  entityType: EntityType;
  entityName: string;
  fields: Record<string, string | number | null | undefined>;
  /** For updates: the old values to show diff */
  oldFields?: Record<string, string | number | null | undefined>;
  status: "pending" | "approved" | "dismissed";
  onApprove?: (editedFields: Record<string, string | number | null>) => void;
  onDismiss?: () => void;
  /** Campaign, contact, account, deal — affects card rendering */
  proposalAction?: string;
}

const entityIcons: Record<EntityType, typeof Building2> = {
  account: Building2,
  contact: User,
  deal: TrendingUp,
};

const entityLabels: Record<EntityType, string> = {
  account: "Account",
  contact: "Contact",
  deal: "Opportunity",
};

/** Stable color from entity name */
function hashColor(str: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return { bg: `oklch(0.92 0.04 ${hue})`, text: `oklch(0.45 0.12 ${hue})` };
}

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export function ActionCard({
  actionType,
  entityType,
  entityName,
  fields,
  oldFields,
  status,
  onApprove,
  onDismiss,
  proposalAction,
}: ActionCardProps) {
  const isCampaign = proposalAction === "campaign";
  const Icon = entityIcons[entityType];
  const label = isCampaign ? "Campaign" : entityLabels[entityType];
  const isUpdate = actionType === "update";
  const isPending = status === "pending";

  // Editable fields state — initialized from props
  const [editedFields, setEditedFields] = useState<Record<string, string | number | null>>(() => {
    const init: Record<string, string | number | null> = {};
    for (const [key, value] of Object.entries(fields)) {
      init[key] = value ?? null;
    }
    return init;
  });
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const avatarColors = hashColor(entityName);
  const initials = getInitials(entityName);

  function handleFieldChange(key: string, value: string) {
    setEditedFields((prev) => ({ ...prev, [key]: value || null }));
  }

  return (
    <div
      className="my-2 rounded-lg"
      style={{
        border: `0.5px solid ${isPending ? "var(--color-accent)" : "var(--color-border-moderate)"}`,
        background: "var(--color-bg-surface)",
        opacity: status === "dismissed" ? 0.5 : 1,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 text-[12px] font-medium"
        style={{
          color: "var(--color-text-secondary)",
          borderBottom: "0.5px solid var(--color-border-default)",
        }}
      >
        {entityType === "deal" ? (
          <Icon size={14} style={{ color: "var(--color-accent)" }} />
        ) : (
          <span
            className="inline-flex items-center justify-center rounded-full text-[8px] font-semibold"
            style={{
              width: 20,
              height: 20,
              flexShrink: 0,
              background: avatarColors.bg,
              color: avatarColors.text,
              border: `1px solid ${avatarColors.text}20`,
            }}
          >
            {initials}
          </span>
        )}
        <span>
          {isUpdate ? `Update ${label}` : `Create ${label}`}
        </span>
        {status === "approved" && (
          <span
            className="ml-auto flex items-center gap-1 text-[11px]"
            style={{ color: "oklch(0.6 0.15 145)" }}
          >
            <Check size={11} />
            {isUpdate ? "Updated" : "Created"}
          </span>
        )}
        {status === "dismissed" && (
          <span
            className="ml-auto text-[11px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            Dismissed
          </span>
        )}
      </div>

      {/* Entity name + fields */}
      <div className="px-3 py-2">
        <div
          className="mb-2 text-[14px] font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {entityName}
        </div>

        {/* Campaign-specific rendering */}
        {isCampaign && (
          <div className="space-y-2 mb-2">
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className="text-[18px] font-bold" style={{ color: "var(--color-accent)" }}>{fields.targets}</div>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Targets</div>
              </div>
              <div className="h-6" style={{ width: 1, background: "var(--color-border-default)" }} />
              <div className="text-center">
                <div className="text-[18px] font-bold" style={{ color: "var(--color-text-primary)" }}>{fields.steps}</div>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Steps</div>
              </div>
            </div>
            {fields.goal && (
              <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                Goal: {fields.goal}
              </p>
            )}
          </div>
        )}

        <div className="space-y-1">
          {Object.entries(isPending ? editedFields : fields).filter(([key]) => !isCampaign || !["targets", "steps", "goal", "sequenceId"].includes(key)).map(([key, value]) => {
            if (value === undefined) return null;
            const oldValue = oldFields?.[key];
            const hasChanged = isUpdate && oldValue !== undefined && oldValue !== value;
            const isEditing = editingKey === key && isPending;

            return (
              <div
                key={key}
                className="group flex items-center gap-2 text-[12px]"
              >
                <span
                  className="w-24 shrink-0 capitalize"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  {key.replace(/([A-Z])/g, " $1").trim()}
                </span>
                {isEditing ? (
                  <input
                    autoFocus
                    className="flex-1 rounded border px-1.5 py-0.5 text-[12px] outline-none"
                    style={{
                      borderColor: "var(--color-accent)",
                      color: "var(--color-text-primary)",
                      background: "var(--color-bg-card)",
                    }}
                    value={String(value ?? "")}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    onBlur={() => setEditingKey(null)}
                    onKeyDown={(e) => { if (e.key === "Enter") setEditingKey(null); }}
                  />
                ) : hasChanged ? (
                  <span className="flex items-center gap-1.5">
                    <span style={{ color: "var(--color-text-muted)", textDecoration: "line-through" }}>
                      {String(oldValue)}
                    </span>
                    <ArrowRight size={10} style={{ color: "var(--color-text-muted)" }} />
                    <span style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>
                      {String(value)}
                    </span>
                  </span>
                ) : (
                  <span
                    className="flex items-center gap-1"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {value !== null ? String(value) : "—"}
                    {isPending && (
                      <button
                        onClick={() => setEditingKey(key)}
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                        style={{ color: "var(--color-text-muted)" }}
                        title="Edit field"
                      >
                        <Pencil size={10} />
                      </button>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action bar */}
      {isPending && (
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{ borderTop: "0.5px solid var(--color-border-default)" }}
        >
          {/* CLE-05 (AC-10): the dead approval-mode dropdown was removed — its
              value was never read, and a client-only per-action autonomy toggle
              would be a fifth approval vocabulary. The real lever is
              decideAction / approval-mode (CLE-10/CLE-16). */}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onDismiss}
              className="rounded-md px-3 py-1 text-[12px] font-medium transition-colors"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Dismiss
            </button>
            <button
              onClick={() => onApprove?.(editedFields)}
              className="flex items-center gap-1 rounded-md px-3 py-1 text-[12px] font-medium text-white transition-colors"
              style={{ background: "var(--color-accent)" }}
            >
              <Check size={12} />
              {isCampaign ? "Review & Launch" : isUpdate ? "Approve" : "Create"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Parse a tool call result to extract fields for the ActionCard */
export function parseToolResultForCard(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
): { actionType: ActionType; entityType: EntityType; entityName: string; fields: Record<string, string | number | null>; isProposal: boolean; proposalAction?: string } | null {
  // Check if this is a proposal (approval mode)
  const r = result as Record<string, unknown> | null;
  if (r?.proposal === true) {
    const fields = (r.fields || {}) as Record<string, string | number | null>;
    return {
      actionType: "create",
      entityType: (r.entityType as EntityType) || "contact",
      entityName: (r.entityName as string) || "New Record",
      fields,
      isProposal: true,
      proposalAction: r.action as string,
    };
  }
  if (toolName === "createContact") {
    const name = [args.firstName, args.lastName].filter(Boolean).join(" ") || "New Contact";
    return {
      actionType: "create",
      entityType: "contact",
      entityName: name,
      fields: {
        email: (args.email as string) || null,
        title: (args.title as string) || null,
        phone: (args.phone as string) || null,
      },
      isProposal: false,
    };
  }
  if (toolName === "createAccount") {
    return {
      actionType: "create",
      entityType: "account",
      entityName: (args.name as string) || "New Account",
      fields: {
        domain: (args.domain as string) || null,
        industry: (args.industry as string) || null,
      },
      isProposal: false,
    };
  }
  if (toolName === "createDeal") {
    return {
      actionType: "create",
      entityType: "deal",
      entityName: (args.name as string) || "New Deal",
      fields: {
        stage: (args.stage as string) || null,
        value: args.value ? `$${Number(args.value).toLocaleString()}` : null,
      },
      isProposal: false,
    };
  }
  if (toolName === "updateDealStage") {
    const ur = result as Record<string, unknown> | null;
    const updated = (ur?.updated || {}) as Record<string, unknown>;
    return {
      actionType: "update",
      entityType: "deal",
      entityName: (updated.name as string) || "Deal",
      fields: {
        stage: (updated.newStage as string) || null,
      },
      isProposal: false,
    };
  }
  if (toolName === "createTask") {
    return {
      actionType: "create",
      entityType: "contact" as EntityType,
      entityName: (args.title as string) || "New Task",
      fields: {
        dueDate: (args.dueDate as string) || null,
        priority: (args.priority as string) || null,
      },
      isProposal: false,
    };
  }
  if (toolName === "bulkUpdateDeals" || toolName === "bulkUpdateContacts") {
    const br = result as Record<string, unknown> | null;
    const bulk = (br?.bulkUpdated || {}) as Record<string, unknown>;
    return {
      actionType: "update",
      entityType: toolName === "bulkUpdateDeals" ? "deal" : "contact",
      entityName: `${bulk.count || 0} records`,
      fields: {
        action: (args.action as string) || null,
      },
      isProposal: false,
    };
  }
  if (toolName === "proposeCampaign") {
    const cr = result as Record<string, unknown> | null;
    if (cr?.type === "campaign_proposal" && cr?.status === "proposed") {
      return {
        actionType: "create",
        entityType: "deal" as EntityType,
        entityName: (cr.sequenceName as string) || "New Campaign",
        fields: {
          targets: `${cr.targetCount} accounts`,
          steps: `${cr.stepCount} email steps`,
          goal: (cr.goal as string) || null,
          sequenceId: (cr.sequenceId as string) || null,
        },
        isProposal: true,
        proposalAction: "campaign",
      };
    }
    // No matches case
    if (cr?.status === "no_matches") {
      return null;
    }
  }
  return null;
}
