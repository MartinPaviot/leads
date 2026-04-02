import { Calendar } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export default function MeetingsPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<Calendar size={15} />} title="Meetings" subtitle="0" />

      <div className="flex flex-1 flex-col items-center justify-center">
        <EmptyState
          icon={<Calendar size={24} />}
          title="No meetings"
          description="LeadSens automatically syncs meetings from your calendar activity."
          actionLabel="Go to settings"
          onAction={() => window.location.href = "/settings"}
          actionVariant="outline"
        />
      </div>
    </div>
  );
}
