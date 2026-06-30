"use client";

/**
 * Mailbox identity (A3) — folded into Mail & Calendar (Settings IA). A display
 * name, signature, and optional writing-voice override per connected mailbox.
 * Self-contained: it loads its own active mailboxes + identities and saves
 * per-box via PATCH /api/inbox/mailbox-identity, so it doesn't entangle the
 * dense Mail & Calendar page state. Rendered as a section below the accounts.
 */

import { useCallback, useEffect, useState } from "react";
import { Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
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

export function MailboxIdentitySection() {
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
      if (!br.ok) { setLoadError(true); return; }
      const b = (await br.json()) as { mailboxes?: Box[] };
      setBoxes((b.mailboxes ?? []).filter((m) => m.status === "active"));
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

  // Hide-when-empty section: during the initial load we don't yet know whether
  // any mailbox exists, so stay invisible rather than flash a skeleton card that
  // then collapses to null once an empty result lands.
  if (loading && boxes.length === 0 && !loadError) return null;

  // On a re-load over mailboxes already known to exist, reserve the section's
  // footprint with one skeleton card sized to a mailbox-identity card, so real
  // data swaps in without reflow.
  if (loading && boxes.length > 0) {
    return (
      <section className="mt-10">
        <h2 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
          Mailbox identity
        </h2>
        <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          A display name, signature, and optional writing voice per connected mailbox. The signature is added only when you send from that box.
        </p>
        <div className="mt-4">
          <div className="rounded-lg border p-4" style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}>
            <div className="flex items-center gap-2">
              <Skeleton className="h-3.5 w-3.5 rounded" />
              <Skeleton className="h-3.5 w-40 rounded" />
              <Skeleton className="h-3 w-48 rounded" />
            </div>
            <div className="mt-3 space-y-2">
              <div>
                <Skeleton className="h-2.5 w-20 rounded" />
                <Skeleton className="mt-1 h-8 w-full rounded-md" />
              </div>
              <div>
                <Skeleton className="h-2.5 w-16 rounded" />
                <Skeleton className="mt-1 h-16 w-full rounded-md" />
              </div>
              <div>
                <Skeleton className="h-2.5 w-32 rounded" />
                <Skeleton className="mt-1 h-12 w-full rounded-md" />
              </div>
            </div>
            <div className="mt-3">
              <Skeleton className="h-7 w-16 rounded-md" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Nothing to show until at least one mailbox is connected — the accounts list
  // above is the place to add one, so stay quiet rather than show an empty box.
  if (!loadError && boxes.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
        Mailbox identity
      </h2>
      <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
        A display name, signature, and optional writing voice per connected mailbox. The signature is added only when you send from that box.
      </p>

      {loadError ? (
        <div role="alert" className="mt-3 flex items-center gap-3 rounded-lg p-3 text-[12px]"
          style={{ background: "var(--color-error-soft, rgba(220,38,38,0.08))", color: "var(--color-error, #b91c1c)" }}>
          <span>Couldn&apos;t load your mailbox identities — the request failed.</span>
          <button onClick={() => void load()} className="ml-auto shrink-0 font-medium underline">Retry</button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
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
    </section>
  );
}
