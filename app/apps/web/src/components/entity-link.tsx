"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { IndustryBadge, TitleBadge } from "./ui/badge";
import { SlideOver, PropertyRow } from "./slide-over";
import { GeneratedCompanyAvatar } from "./ui/generated-company-avatar";

type EntityType = "contact" | "account" | "deal";

interface EntityLinkProps {
  type: EntityType;
  id: string;
  name: string;
  /** Account domain for logo fetching (e.g. "acme.com") */
  domain?: string;
}

/** Stable color from a string — gives each entity a consistent hue */
function hashColor(str: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return {
    bg: `oklch(0.92 0.04 ${hue})`,
    text: `oklch(0.45 0.12 ${hue})`,
  };
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const typeConfig: Record<EntityType, { color: string; bg: string; label: string; href: (id: string) => string }> = {
  account: {
    color: "var(--color-accent)",
    bg: "var(--color-accent-soft)",
    label: "Account",
    href: (id) => `/accounts/${id}`,
  },
  contact: {
    color: "oklch(0.65 0.15 160)",
    bg: "oklch(0.95 0.03 160)",
    label: "Contact",
    href: (id) => `/contacts/${id}`,
  },
  deal: {
    color: "oklch(0.6 0.15 280)",
    bg: "oklch(0.95 0.03 280)",
    label: "Deal",
    href: (id) => `/opportunities/${id}`,
  },
};

/** Detect entity type from a markdown link href.
 *  Supports optional query params: /accounts/id?d=domain.com */
export function parseEntityHref(href: string): { type: EntityType; id: string; domain?: string } | null {
  const [path, qs] = href.split("?");
  const params = new URLSearchParams(qs || "");
  const domain = params.get("d") || undefined;

  const contactMatch = path.match(/^\/contacts\/(.+)/);
  if (contactMatch) return { type: "contact", id: contactMatch[1] };
  const accountMatch = path.match(/^\/accounts\/(.+)/);
  if (accountMatch) return { type: "account", id: accountMatch[1], domain };
  const dealMatch = path.match(/^\/opportunities\/(.+)/);
  if (dealMatch) return { type: "deal", id: dealMatch[1] };
  return null;
}

export function EntityLink({ type, id, name }: EntityLinkProps) {
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [entityData, setEntityData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const config = typeConfig[type];
  const initials = getInitials(name);
  const avatarColors = hashColor(name);

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
        aria-label={`View ${config.label}: ${name}`}
      >
        {type === "deal" ? (
          <TrendingUp size={12} style={{ flexShrink: 0 }} />
        ) : type === "account" ? (
          <GeneratedCompanyAvatar companyName={name} size={16} />
        ) : (
          <span
            className="inline-flex items-center justify-center rounded-full text-[9px] font-semibold"
            style={{
              width: 18,
              height: 18,
              flexShrink: 0,
              background: avatarColors.bg,
              color: avatarColors.text,
              border: `1px solid ${avatarColors.text}20`,
            }}
          >
            {initials}
          </span>
        )}
        <span>{name}</span>
      </button>

      <SlideOver
        open={slideOverOpen}
        onClose={() => setSlideOverOpen(false)}
        title={name}
        subtitle={config.label}
        expandHref={config.href(id)}
        avatar={type !== "deal" ? { initials, bg: avatarColors.bg, color: avatarColors.text } : undefined}
      >
        {loading && (
          <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            Loading...
          </p>
        )}
        {entityData && type === "contact" && (
          <div>
            <PropertyRow label="Email" value={entityData.email as string} />
            <PropertyRow label="Title" value={entityData.title ? (
              <TitleBadge
                title={entityData.title as string}
                seniority={(entityData.properties as Record<string, unknown> | null)?.seniority as string | undefined}
              />
            ) : null} />
            <PropertyRow label="Phone" value={entityData.phone as string} />
          </div>
        )}
        {entityData && type === "account" && (
          <div>
            <PropertyRow label="Domain" value={entityData.domain as string} />
            <PropertyRow label="Industry" value={entityData.industry ? <IndustryBadge value={entityData.industry as string} /> : null} />
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
