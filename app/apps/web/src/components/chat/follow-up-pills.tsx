"use client";

import { Sparkles } from "lucide-react";

interface FollowUpPillsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  disabled?: boolean;
}

export function FollowUpPills({ suggestions, onSelect, disabled }: FollowUpPillsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {suggestions.slice(0, 3).map((suggestion, i) => (
        <button
          key={i}
          onClick={() => onSelect(suggestion)}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all hover:brightness-95 disabled:opacity-50"
          style={{
            background: "var(--color-bg-card)",
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-border-default)",
            animationDelay: `${i * 100}ms`,
          }}
        >
          <Sparkles size={10} style={{ color: "var(--color-accent)", opacity: 0.6 }} />
          {suggestion}
        </button>
      ))}
    </div>
  );
}

/**
 * Extract follow-up suggestions from the AI response text.
 * The AI is instructed to include these as HTML comments:
 * <!-- followups: ["suggestion1", "suggestion2"] -->
 *
 * Falls back to generating contextual suggestions from the response content.
 */
export function extractFollowUps(text: string): string[] {
  // Try to parse structured followups from the response
  const match = text.match(/<!--\s*followups:\s*(\[.*?\])\s*-->/);
  if (match) {
    try {
      return JSON.parse(match[1]) as string[];
    } catch {
      // Parse failed
    }
  }

  // Contextual fallback based on response content
  const suggestions: string[] = [];
  const lower = text.toLowerCase();

  if (lower.includes("deal") || lower.includes("opportunity") || lower.includes("pipeline")) {
    if (!lower.includes("risk")) suggestions.push("Which deals are at risk?");
    if (!lower.includes("coach")) suggestions.push("Coach me on the top deal");
  }
  if (lower.includes("contact") || lower.includes("account")) {
    if (!lower.includes("email")) suggestions.push("Draft an email to them");
    if (!lower.includes("meeting")) suggestions.push("Prepare me for a meeting");
  }
  if (lower.includes("email") || lower.includes("follow")) {
    suggestions.push("Show me the full activity history");
  }

  return suggestions.slice(0, 3);
}
