"use client";

/**
 * Call Mode actions on the focal prospect: draft an email (AI) and book the
 * discovery meeting — both without leaving the cockpit. The email reuses the
 * email-drafting skill via /api/calls/draft-email then opens the shared
 * composer; the meeting uses the shared MeetingSchedulerCard
 * (components/meeting-scheduler.tsx, also used by the Inbox).
 */

import { useState } from "react";
import { Mail, CalendarPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { EmailComposerPanel, type EmailComposerDraft } from "@/components/email-composer-panel";
import { MeetingSchedulerCard } from "@/components/meeting-scheduler";

export function CallActions({
  contactId,
  contactName,
  email,
}: {
  contactId: string;
  contactName: string;
  email: string | null;
}) {
  const { toast } = useToast();
  const [drafting, setDrafting] = useState(false);
  const [composer, setComposer] = useState<EmailComposerDraft | null>(null);
  const [schedOpen, setSchedOpen] = useState(false);

  const firstName = contactName.split(" ")[0] || "";

  async function writeEmail() {
    setDrafting(true);
    try {
      const res = await fetch("/api/calls/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, purpose: "meeting_request" }),
      });
      const data = (await res.json().catch(() => ({}))) as { subject?: string; body?: string; error?: string };
      if (!res.ok) {
        // The AI draft failed — still open the composer so the user can write
        // by hand rather than hitting a dead end.
        toast(data.error ?? "Couldn't draft the email — opening a blank one.", "warning");
        setComposer({ to: email ?? "", subject: "", body: `Bonjour ${firstName},\n\n`, contactId });
      } else {
        setComposer({ to: email ?? "", subject: data.subject ?? "", body: data.body ?? "", contactId });
        if (!email) toast("Drafted — add a recipient email to send.", "info");
      }
    } catch {
      toast("Network error while drafting.", "error");
    } finally {
      setDrafting(false);
    }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={writeEmail} disabled={drafting} className="gap-1.5">
          {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
          {drafting ? "Drafting…" : "Write email"}
        </Button>
        <Button
          variant={schedOpen ? "solid" : "outline"}
          size="sm"
          onClick={() => setSchedOpen((v) => !v)}
          className="gap-1.5"
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          Book meeting
        </Button>
      </div>

      {schedOpen && (
        <MeetingSchedulerCard
          contactId={contactId}
          firstName={firstName}
          onClose={() => setSchedOpen(false)}
        />
      )}

      {composer && <EmailComposerPanel draft={composer} onClose={() => setComposer(null)} />}
    </div>
  );
}
