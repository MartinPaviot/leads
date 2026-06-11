import { Briefcase, X } from "lucide-react";
import { getGrade } from "@/lib/scoring/scoring";
import { industryStyle } from "@/lib/ui/industry-style";
import { seniorityStyle } from "@/lib/ui/title-style";

type BadgeVariant = "success" | "warning" | "error" | "info" | "neutral";
type BadgeSize = "sm" | "md";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

const variantStyles: Record<BadgeVariant, { bg: string; color: string }> = {
  success: { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  warning: { bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
  error: { bg: "var(--color-error-soft)", color: "var(--color-error)" },
  info: { bg: "var(--color-info-soft)", color: "var(--color-info)" },
  neutral: { bg: "var(--color-bg-hover)", color: "var(--color-text-secondary)" },
};

export function Badge({ children, variant = "neutral", size = "sm", className = "" }: BadgeProps) {
  const s = variantStyles[variant];
  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-[12px]"
      } ${className}`}
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}20` }}
    >
      {children}
    </span>
  );
}

/* ── Score Badge ── */
interface ScoreBadgeProps {
  score: number | null;
  className?: string;
}

export function ScoreBadge({ score, className = "" }: ScoreBadgeProps) {
  if (score == null) return <span style={{ color: "var(--color-text-tertiary)" }}>--</span>;

  const g = getGrade(score);
  const grade = g.grade;
  const variantMap: Record<string, BadgeVariant> = { Burning: "success", Warm: "warning", Cool: "info", Cold: "neutral" };
  const variant: BadgeVariant = variantMap[g.heat] || "neutral";

  return (
    <Badge variant={variant} size="sm" className={className}>
      {grade} ({score})
    </Badge>
  );
}

/* ── Tag (removable) ── */
interface TagProps {
  children: React.ReactNode;
  onRemove?: () => void;
  color?: string;
  bg?: string;
}

export function Tag({ children, onRemove, color, bg }: TagProps) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        background: bg || "var(--color-bg-hover)",
        color: color || "var(--color-text-secondary)",
        border: `1px solid ${color || "var(--color-border-default)"}20`,
      }}
    >
      {children}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 rounded-sm hover:opacity-70"
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}

/* ── Property Badge (auto-colored from category string) ── */
interface PropertyBadgeProps {
  value: string;
  className?: string;
}

const BADGE_PALETTE = [
  { bg: "var(--color-badge-0-bg)", color: "var(--color-badge-0)" },
  { bg: "var(--color-badge-1-bg)", color: "var(--color-badge-1)" },
  { bg: "var(--color-badge-2-bg)", color: "var(--color-badge-2)" },
  { bg: "var(--color-badge-3-bg)", color: "var(--color-badge-3)" },
  { bg: "var(--color-badge-4-bg)", color: "var(--color-badge-4)" },
  { bg: "var(--color-badge-5-bg)", color: "var(--color-badge-5)" },
  { bg: "var(--color-badge-6-bg)", color: "var(--color-badge-6)" },
  { bg: "var(--color-badge-7-bg)", color: "var(--color-badge-7)" },
  { bg: "var(--color-badge-8-bg)", color: "var(--color-badge-8)" },
  { bg: "var(--color-badge-9-bg)", color: "var(--color-badge-9)" },
];

function hashColor(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % BADGE_PALETTE.length;
}

export function PropertyBadge({ value, className = "" }: PropertyBadgeProps) {
  const palette = BADGE_PALETTE[hashColor(value)];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}
      style={{
        background: palette.bg,
        color: palette.color,
        border: `1px solid ${palette.color}20`,
      }}
    >
      {value}
    </span>
  );
}

/* ── Industry Badge (sector icon + theme-aware sector hue) ── */
interface IndustryBadgeProps {
  value: string;
  className?: string;
}

export function IndustryBadge({ value, className = "" }: IndustryBadgeProps) {
  const s = industryStyle(value);
  const Icon = s.icon;
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${className}`}
      style={{
        background: s.bg,
        color: s.color,
        border: `1px solid color-mix(in srgb, ${s.color} 25%, transparent)`,
      }}
      title={value}
    >
      <Icon size={11} strokeWidth={1.75} aria-hidden className="shrink-0" style={{ opacity: 0.85 }} />
      <span className="truncate">{value}</span>
    </span>
  );
}

/* ── Title Badge (one sober Briefcase on every chip; seniority tier carries
      the hue + tooltip label, from the stored Apollo enum — never parsed
      from the title text) ── */
interface TitleBadgeProps {
  title: string;
  seniority?: string | null;
  className?: string;
}

export function TitleBadge({ title, seniority, className = "" }: TitleBadgeProps) {
  const s = seniorityStyle(seniority);
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}
      style={{
        background: s.bg,
        color: s.color,
        border: `1px solid color-mix(in srgb, ${s.color} 25%, transparent)`,
      }}
      title={s.label ? `${title} — ${s.label}` : title}
    >
      <Briefcase size={11} strokeWidth={1.75} aria-hidden className="shrink-0" style={{ opacity: 0.85 }} />
      <span className="truncate">{title}</span>
    </span>
  );
}
