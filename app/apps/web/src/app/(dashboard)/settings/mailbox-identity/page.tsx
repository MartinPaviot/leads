"use client";

/**
 * Mailbox identity (A3) — per-mailbox display-name, signature, and an optional
 * writing-voice override. Saved owner-scoped (user_preferences, no migration).
 * The display-name shows in the rail + From selector; the signature is injected
 * when composing from that box; the voice override layers on the per-user style.
 */

import { useCallback, useEffect, useState } from "react";
import { Mail, Loader2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { colorForMailbox } from "@/lib/inbox/mailbox-color";

interface Box {
  id: string;
  emailAddress: string;
  displayName: string | null;
  status: string;
}
interface Identity {
  displayName?: string;
  signature?: string;
  voice?: string;
}

const inputStyle = {
  borderColor: "var(--color-border-default)",
  background: "var(--color-bg-page)",
  color: "var(--color-text-primary)",
} as const;

export default function MailboxIdentityPage() {
  const { toast } = useToast();
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [identities, setIdentities] = useState<Record<string, Identity>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [br, ir] = await Promise.all([
        fetch("/api/settings/mailboxes"),
        fetch("/api/inbox/mailbox-identity"),
      ]);
      // The mailboxes fetch is load-bearing — without it there are no rows, so a
      // failure used to render "No connected mailbox yet" (masked the 500).
      if (!br.ok) { setLoadError(true); return; }
      const b = (await br.json()) as { mailboxes?: Box[] };
      setBoxes((b.mailboxes ?? []).filter((m) => m.status === "active"));
      // identities are secondary — default to {} on failure, don't block.
      if (ir.ok) {
        const i = (await ir.json()) as { identities?: Record<string, Identity> };
        setIdentities(i.identities ?? {});
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function patch(id: string, field: keyof Identity, value: string) {
    setIdentities((m) => ({ ...m, [id]: { ...m[id], [field]: value } }));
    setSavedId(null);
  }

  async function save(box: Box) {
    setSavingId(box.id);
    setSavedId(null);
    try {
      const idn = identities[box.id] ?? {};
      const r = await fetch("/api/inbox/mailbox-identity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailboxId: box.id, displayName: idn.displayName ?? "", signature: idn.signature ?? "", voice: idn.voice ?? "" }),
      });
      if (r.ok) {
        const data = (await r.json()) as { identity: Identity | null };
        setIdentities((m) => ({ ...m, [box.id]: data.identity ?? {} }));
        setSavedId(box.id);
      } else {
        toast("Couldn't save this mailbox's identity.", "error");
      }
    } catch {
      toast("Couldn't save this mailbox's identity.", "error");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 size={18} className="animate-spin" style={{ color: "var(--color-text-tertiary)" }} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="mx-auto max-w-2xl p-6">
        <h1 className="flex items-center gap-2 text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          <PenLine size={16} /> Mailbox identity
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
          Couldn&apos;t load your mailboxes. This is not the same as having none — the request failed.
        </p>
        <Button size="sm" onClick={() => void load()} className="mt-3">Retry</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="flex items-center gap-2 text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
        <PenLine size={16} /> Mailbox identity
      </h1>
      <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
        A display name, signature, and optional writing voice per connected mailbox. The signature is added only when you send from that box.
      </p>

      {boxes.length === 0 ? (
        <p className="mt-6 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
          No connected mailbox yet. Connect one in Mail &amp; Calendar.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {boxes.map((box) => {
            const idn = identities[box.id] ?? {};
            return (
              <div key={box.id} className="rounded-lg border p-4" style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}>
                <div className="flex items-center gap-2">
                  <span className="relative inline-flex items-center" style={{ color: "var(--color-text-tertiary)" }}>
                    <Mail size={14} />
                    <span aria-hidden className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full"
                      style={{ background: colorForMailbox(box.id), boxShadow: "0 0 0 1.5px var(--color-bg-card)" }} />
                  </span>
                  <span className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                    {idn.displayName?.trim() || box.displayName || box.emailAddress}
                  </span>
                  <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>{box.emailAddress}</span>
                </div>

                <div className="mt-3 space-y-2">
                  <div>
                    <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>Display name</label>
                    <input value={idn.displayName ?? ""} maxLength={120} onChange={(e) => patch(box.id, "displayName", e.target.value)}
                      placeholder={box.displayName || box.emailAddress} className="mt-1 w-full rounded-md border px-2 py-1.5 text-[12px] outline-none" style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>Signature</label>
                    <textarea value={idn.signature ?? ""} maxLength={2000} onChange={(e) => patch(box.id, "signature", e.target.value)} rows={3}
                      placeholder={"Best,\nYour name\nFounder at Acme"} className="mt-1 w-full rounded-md border px-2 py-1.5 text-[12px] outline-none" style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>Voice override (optional)</label>
                    <textarea value={idn.voice ?? ""} maxLength={2000} onChange={(e) => patch(box.id, "voice", e.target.value)} rows={2}
                      placeholder="How drafts from this box should sound (layers on your writing style)." className="mt-1 w-full rounded-md border px-2 py-1.5 text-[12px] outline-none" style={inputStyle} />
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <Button size="sm" onClick={() => void save(box)} disabled={savingId === box.id} className="gap-1.5">
                    {savingId === box.id ? <Loader2 size={13} className="animate-spin" /> : null}
                    {savingId === box.id ? "Saving…" : "Save"}
                  </Button>
                  {savedId === box.id && <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>Saved.</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
