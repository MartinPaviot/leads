"use client";

import { useState } from "react";
import { Building2, User, TrendingUp } from "lucide-react";
import { SlideOver, PropertyRow } from "./slide-over";

type EntityType = "contact" | "account" | "deal";

interface EntityLinkProps {
  type: EntityType;
  id: string;
  name: string;
}

const typeConfig: Record<EntityType, { icon: typeof Building2; color: string; bg: string; label: string; href: (id: string) => string }> = {
  account: {
    icon: Building2,
    color: "var(--color-accent)",
    bg: "var(--color-accent-soft)",
    label: "Account",
    href: (id) => `/accounts/${id}`,
  },
  contact: {
    icon: User,
    color: "oklch(0.65 0.15 160)",
    bg: "oklch(0.95 0.03 160)",
    label: "Contact",
    href: (id) => `/contacts/${id}`,
  },
  deal: {
    icon: TrendingUp,
    color: "oklch(0.6 0.15 280)",
    bg: "oklch(0.95 0.03 280)",
    label: "Deal",
    href: (id) => `/opportunities/${id}`,
  },
};

/** Detect entity type from a markdown link href */
export function parseEntityHref(href: string): { type: EntityType; id: string } | null {
  const contactMatch = href.match(/^\/contacts\/(.+)/);
  if (contactMatch) return { type: "contact", id: contactMatch[1] };
  const accountMatch = href.match(/^\/accounts\/(.+)/);
  if (accountMatch) return { type: "account", id: accountMatch[1] };
  const dealMatch = href.match(/^\/opportunities\/(.+)/);
  if (dealMatch) return { type: "deal", id: dealMatch[1] };
  return null;
}

export function EntityLink({ type, id, name }: EntityLinkProps) {
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [entityData, setEntityData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const config = typeConfig[type];
  const Icon = config.icon;

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSlideOverOpen(true);

    if (!entityData && !loading) {
      setLoading(true);
      try {
        const endpoint = type === "contact" ? `/api/contacts/${id}`
          : type === "account" ? `/api/accounts/${id}`
          : `/api/deals/${id}`;
        const res = await fetch(endpoint);
        if (res.ok) {
          const data = await res.json();
          setEntityData(data);
        }
      } catch {
        // Slide-over will show name only
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        className="mx-0.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-medium transition-colors"
        style={{
          color: config.color,
          background: config.bg,
          border: "none",
          cursor: "pointer",
          verticalAlign: "baseline",
        }}
        title={`View ${config.label}: ${name}`}
      >
        <Icon size={12} style={{ flexShrink: 0 }} />
        <span>{name}</span>
      </button>

      <SlideOver
        open={slideOverOpen}
        onClose={() => setSlideOverOpen(false)}
        title={name}
        subtitle={config.label}
        expandHref={config.href(id)}
      >
        {loading && (
          <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            Loading...
          </p>
        )}
        {entityData && type === "contact" && (
          <div>
            <PropertyRow label="Email" value={entityData.email as string} />
            <PropertyRow label="Title" value={entityData.title as string} />
            <PropertyRow label="Phone" value={entityData.phone as string} />
          </div>
        )}
        {entityData && type === "account" && (
          <div>
            <PropertyRow label="Domain" value={entityData.domain as string} />
            <PropertyRow label="Industry" value={entityData.industry as string} />
            <PropertyRow label="Size" value={entityData.size as string} />
            <PropertyRow label="Revenue" value={entityData.revenue as string} />
            <PropertyRow label="Score" value={String(entityData.score ?? "—")} />
          </div>
        )}
        {entityData && type === "deal" && (
          <div>
            <PropertyRow label="Stage" value={entityData.stage as string} />
            <PropertyRow label="Value" value={entityData.value ? `$${Number(entityData.value).toLocaleString()}` : "—"} />
            <PropertyRow label="Close Date" value={entityData.expectedCloseDate as string} />
          </div>
        )}
        {!loading && !entityData && (
          <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            Could not load details.
          </p>
        )}
      </SlideOver>
    </>
  );
}
