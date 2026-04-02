"use client";

import { Building2, User, TrendingUp, Check, X, ArrowRight } from "lucide-react";

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
  onApprove?: () => void;
  onDismiss?: () => void;
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

export function ActionCard({
  actionType,
  entityType,
  entityName,
  fields,
  oldFields,
  status,
  onApprove,
  onDismiss,
}: ActionCardProps) {
  const Icon = entityIcons[entityType];
  const label = entityLabels[entityType];
  const isUpdate = actionType === "update";

  return (
    <div
      className="my-2 rounded-lg"
      style={{
        border: "0.5px solid var(--color-border-moderate)",
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
        <Icon size={14} style={{ color: "var(--color-accent)" }} />
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

        <div className="space-y-1">
          {Object.entries(fields).map(([key, value]) => {
            if (value === undefined || value === null) return null;
            const oldValue = oldFields?.[key];
            const hasChanged = isUpdate && oldValue !== undefined && oldValue !== value;

            return (
              <div
                key={key}
                className="flex items-center gap-2 text-[12px]"
              >
                <span
                  className="w-24 shrink-0 capitalize"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  {key.replace(/([A-Z])/g, " $1").trim()}
                </span>
                {hasChanged ? (
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
                  <span style={{ color: "var(--color-text-primary)" }}>
                    {String(value)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action bar */}
      {status === "pending" && (
        <div
          className="flex items-center justify-end gap-2 px-3 py-2"
          style={{ borderTop: "0.5px solid var(--color-border-default)" }}
        >
          <button
            onClick={onDismiss}
            className="rounded-md px-3 py-1 text-[12px] font-medium transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Dismiss
          </button>
          <button
            onClick={onApprove}
            className="flex items-center gap-1 rounded-md px-3 py-1 text-[12px] font-medium text-white transition-colors"
            style={{ background: "var(--color-accent)" }}
          >
            <Check size={12} />
            {isUpdate ? "Approve" : "Create"}
          </button>
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
): { actionType: ActionType; entityType: EntityType; entityName: string; fields: Record<string, string | number | null> } | null {
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
    };
  }
  return null;
}
