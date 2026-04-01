import { Calendar } from "lucide-react";
import Link from "next/link";

export default function MeetingsPage() {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-6" style={{ height: "var(--header-height)", borderBottom: "0.5px solid var(--color-border-default)" }}>
        <Calendar size={16} style={{ color: "var(--color-text-tertiary)" }} />
        <h1 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Meetings</h1>
        <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>0</span>
      </div>

      {/* Empty state */}
      <div className="flex flex-1 flex-col items-center justify-center">
        <Calendar size={32} style={{ color: "var(--color-text-muted)" }} />
        <p className="mt-3 text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>No meetings</p>
        <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          LeadSens automatically syncs meetings from your calendar activity.
        </p>
        <Link href="/settings" className="mt-4 flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors"
          style={{ border: "0.5px solid var(--color-border-moderate)", color: "var(--color-text-primary)", boxShadow: "var(--shadow-button)" }}>
          Go to settings <span>→</span>
        </Link>
      </div>
    </div>
  );
}
