"use client";

/**
 * Call Mode actions on the focal prospect: draft an email (AI) and book the
 * discovery meeting — both without leaving the cockpit. The email reuses the
 * email-drafting skill via /api/calls/draft-email then opens the shared
 * composer; the meeting uses the shared MeetingSchedulerCard
 * (components/meeting-scheduler.tsx, also used by the Inbox).
 */

import { useImperativeHandle, useState } from "react";
import type { Ref } from "react";
import { Mail, CalendarPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { EmailComposerPanel, type EmailComposerDraft } from "@/components/email-composer-panel";
import {
  MeetingSchedulerCard,
  bookMeetingRequest,
  type BookMeetingSlot,
  type BookMeetingResult,
} from "@/components/meeting-scheduler";

/**
 * CLE-09 §4 lift: the imperative handle CallActions exposes to the Call Mode
 * page so a registered page action can run the SAME prepare-not-execute flows
 * the buttons run — draft the email (opens the composer, no send) and book the
 * meeting (one shared POST). The page reads this via `apiRef`; it is non-null
 * only while a prospect is selected (CallActions mounted), so the actions fail
 * cleanly (E-5b) when no prospect is open.
 */
export interface CallActionsApi {
  /** Draft the meeting-request email and open the composer (does NOT send). */
  writeDraft: (contactId: string) => Promise<{ ok: boolean; drafted: boolean; error?: string }>;
  /** Book the discovery meeting (calendar event + invite) via the shared POST. */
  book: (slot: BookMeetingSlot) => Promise<BookMeetingResult>;
}

export function CallActions({
  contactId,
  contactName,
  email,
  apiRef,
}: {
  contactId: string;
  contactName: string;
  email: string | null;
  /** CLE-09: set by the page to drive writeEmail/book from the chat. */
  apiRef?: Ref<CallActionsApi | null>;
}) {
  const { toast } = useToast();
  const [drafting, setDrafting] = useState(false);
  const [composer, setComposer] = useState<EmailComposerDraft | null>(null);
  const [schedOpen, setSchedOpen] = useState(false);

  const firstName = contactName.split(" ")[0] || "";

  // CLE-09 §4: the email draft + composer-open, extracted so the button and the
  // agent path share one copy. Returns whether a real AI draft was produced so
  // the action can report "drafted" vs the blank-on-failure fallback. The
  // composer is opened in BOTH cases (the existing dead-end-avoidance behaviour).
  async function writeEmailFor(forContactId: string): Promise<{ ok: boolean; drafted: boolean; error?: string }> {
    setDrafting(true);
    try {
      const res = await fetch("/api/calls/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: forContactId, purpose: "meeting_request" }),
      });
      const data = (await res.json().catch(() => ({}))) as { subject?: string; body?: string; error?: string };
      if (!res.ok) {
        // The AI draft failed — still open the composer so the user can write
        // by hand rather than hitting a dead end.
        toast(data.error ?? "Couldn't draft the email — opening a blank one.", "warning");
        setComposer({ to: email ?? "", subject: "", body: `Bonjour ${firstName},\n\n`, contactId: forContactId });
        return { ok: true, drafted: false, error: data.error };
      }
      setComposer({ to: email ?? "", subject: data.subject ?? "", body: data.body ?? "", contactId: forContactId });
      if (!email) toast("Drafted — add a recipient email to send.", "info");
      return { ok: true, drafted: true };
    } catch {
      toast("Network error while drafting.", "error");
      return { ok: false, drafted: false, error: "Network error while drafting." };
    } finally {
      setDrafting(false);
    }
  }

  // The button keeps its exact behaviour — it drafts for the focal contact.
  async function writeEmail() {
    await writeEmailFor(contactId);
  }

  // CLE-09: expose writeDraft + book to the page. One copy of each request:
  // writeDraft reuses writeEmailFor (opens the composer, no send); book reuses
  // the shared bookMeetingRequest the card also calls.
  useImperativeHandle(
    apiRef,
    (): CallActionsApi => ({
      writeDraft: (id: string) => writeEmailFor(id),
      book: (slot: BookMeetingSlot) => bookMeetingRequest(slot),
    }),
    // email/contactId are read live inside the closures; re-expose when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [email, contactId, firstName],
  );

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
