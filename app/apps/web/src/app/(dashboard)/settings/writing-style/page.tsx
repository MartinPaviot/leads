"use client";

/**
 * Writing Style & Tone (B2) — the unified "sounds like you" surface.
 *
 * About-me / role / scheduling link / sign-off, the EDITABLE writing-style prompt
 * (shown + used verbatim, with Reset to default), "Fill it up for me!" (derive
 * from sent mail → reviewable proposal), per-audience variants with a routing
 * preview, and the tone preset folded in from the voice record. Saved owner-scoped
 * (user_preferences); the draft engine prepends buildWritingStylePrompt(style).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PenLine, Loader2, Sparkles, RotateCcw, Plus, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { Audience, AudienceMatch, WritingStyle, StyleProposal } from "@/lib/inbox/writing-style";

type VoiceTone = "neutral" | "warm" | "direct" | "formal" | "concise";
interface VoiceOption { id: VoiceTone; label: string; hint: string }

const MATCH_KINDS: Array<{ id: AudienceMatch["kind"]; label: string; placeholder?: string }> = [
  { id: "domain", label: "Email domain", placeholder: "acme.com" },
  { id: "title", label: "Title contains", placeholder: "investor" },
  { id: "contact_tag", label: "Contact tag", placeholder: "vip" },
  { id: "all", label: "Everyone" },
];

const inputStyle = {
  borderColor: "var(--color-border-default)",
  background: "var(--color-bg-page)",
  color: "var(--color-text-primary)",
} as const;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
      {children}
    </label>
  );
}

export default function WritingStylePage() {
  const { toast } = useToast();
  const [style, setStyle] = useState<WritingStyle | null>(null);
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  const [tone, setTone] = useState<VoiceTone>("neutral");
  // Folded in from the retired /settings/inbox-voice page (Settings IA voice merge):
  // free-form voice guidance (saved alongside tone in the voice record) + the
  // auto-draft toggle (resource inbox, key auto_draft). One canonical voice surface.
  const [customGuidance, setCustomGuidance] = useState("");
  const [autoDraft, setAutoDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [proposal, setProposal] = useState<StyleProposal>({ status: "idle" });
  const [preview, setPreview] = useState<{ email: string; label: string | null } | null>(null);
  const [previewEmail, setPreviewEmail] = useState("");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [wsRes, voiceRes, derRes, autoRes] = await Promise.all([
        fetch("/api/inbox/writing-style"),
        fetch("/api/inbox/voice"),
        fetch("/api/inbox/writing-style/derive"),
        fetch("/api/inbox/auto-draft"),
      ]);
      if (!wsRes.ok) {
        // Writing-style is load-bearing — the form can't render without it. The
        // old Promise.all rejected on this and the .catch swallowed it, leaving
        // `style` null → an INFINITE spinner (loading||!style) with no error.
        setLoadError(true);
        return;
      }
      const ws = (await wsRes.json()) as { style: WritingStyle; defaultPrompt: string };
      setStyle(ws.style);
      setDefaultPrompt(ws.defaultPrompt);
      // voice + derive are best-effort: default on failure, never block the page.
      if (voiceRes.ok) {
        const voice = (await voiceRes.json()) as { options?: VoiceOption[]; voice?: { tone?: VoiceTone; customGuidance?: string } };
        setVoiceOptions(voice.options ?? []);
        if (voice.voice?.tone) setTone(voice.voice.tone);
        setCustomGuidance(voice.voice?.customGuidance ?? "");
      }
      if (derRes.ok) {
        const der = (await derRes.json()) as { proposal?: StyleProposal };
        if (der.proposal) setProposal(der.proposal);
      }
      // auto-draft is non-critical (defaults off); never block the page on it.
      if (autoRes.ok) {
        const data = (await autoRes.json()) as { autoDraft?: { enabled?: boolean } };
        setAutoDraft(data.autoDraft?.enabled === true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  function patch(over: Partial<WritingStyle>) {
    setStyle((s) => (s ? { ...s, ...over } : s));
    setSaved(false);
  }

  async function save() {
    if (!style) return;
    setSaving(true);
    setSaved(false);
    try {
      const [ws] = await Promise.all([
        fetch("/api/inbox/writing-style", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(style),
        }),
        fetch("/api/inbox/voice", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tone, customGuidance }),
        }),
        fetch("/api/inbox/auto-draft", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: autoDraft }),
        }),
      ]);
      if (ws.ok) {
        const data = (await ws.json()) as { style?: WritingStyle };
        if (data.style) setStyle(data.style);
        setSaved(true);
      } else {
        toast("Couldn't save your writing style.", "error");
      }
    } catch {
      toast("Couldn't save your writing style.", "error");
    } finally {
      setSaving(false);
    }
  }

  function pollProposal(tries = 0) {
    pollRef.current = setTimeout(async () => {
      try {
        const r = await fetch("/api/inbox/writing-style/derive");
        const data = (await r.json()) as { proposal: StyleProposal };
        setProposal(data.proposal);
        if (data.proposal.status === "pending" && tries < 20) pollProposal(tries + 1);
      } catch {
        // leave the pending state; the user can retry
      }
    }, 2000);
  }

  async function fillItUp() {
    setProposal({ status: "pending" });
    try {
      const r = await fetch("/api/inbox/writing-style/derive", { method: "POST" });
      const data = (await r.json()) as { proposal: StyleProposal };
      setProposal(data.proposal);
      if (data.proposal.status === "pending") pollProposal(0);
    } catch {
      setProposal({ status: "idle" });
      toast("Couldn't start the derive. Try again.", "error");
    }
  }

  async function dismissProposal() {
    if (pollRef.current) clearTimeout(pollRef.current);
    await fetch("/api/inbox/writing-style/derive", { method: "DELETE" }).catch(() => {});
    setProposal({ status: "idle" });
  }

  async function acceptProposal() {
    if (!style || proposal.status !== "ready" || !proposal.prompt) return;
    const next: WritingStyle = {
      ...style,
      prompt: proposal.prompt,
      aboutMe: proposal.aboutMe ?? style.aboutMe,
      signOff: proposal.signOff ?? style.signOff,
      derivedAt: new Date().toISOString(),
    };
    setStyle(next);
    setSaving(true);
    try {
      const ws = await fetch("/api/inbox/writing-style", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (ws.ok) {
        const data = (await ws.json()) as { style?: WritingStyle };
        if (data.style) setStyle(data.style);
        await fetch("/api/inbox/writing-style/derive", { method: "DELETE" }).catch(() => {});
        setProposal({ status: "idle" });
        toast("Applied the derived writing style.", "success");
      } else {
        toast("Couldn't apply the proposal.", "error");
      }
    } catch {
      toast("Couldn't apply the proposal.", "error");
    } finally {
      setSaving(false);
    }
  }

  function addAudience() {
    const a: Audience = { id: crypto.randomUUID(), label: "", match: { kind: "domain", value: "" }, prompt: "" };
    patch({ audiences: [...(style?.audiences ?? []), a] });
  }
  function updateAudience(id: string, over: Partial<Audience>) {
    patch({ audiences: (style?.audiences ?? []).map((a) => (a.id === id ? { ...a, ...over } : a)) });
  }
  function removeAudience(id: string) {
    patch({ audiences: (style?.audiences ?? []).filter((a) => a.id !== id) });
  }

  async function runPreview() {
    const email = previewEmail.trim();
    if (!email) return;
    try {
      const r = await fetch("/api/inbox/writing-style/audience-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await r.json()) as { audience: { label: string } | null };
      setPreview({ email, label: data.audience?.label ?? null });
    } catch {
      toast("Couldn't preview the audience.", "error");
    }
  }

  if (loadError) {
    return (
      <div role="alert" className="mx-auto max-w-2xl p-6">
        <h1 className="flex items-center gap-2 text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          <PenLine size={16} /> Writing Style &amp; Tone
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
          Couldn&apos;t load your writing style. This is not a reset — the request failed.
        </p>
        <Button size="sm" onClick={() => void load()} className="mt-3">Retry</Button>
      </div>
    );
  }

  if (loading || !style) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 size={18} className="animate-spin" style={{ color: "var(--color-text-tertiary)" }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="flex items-center gap-2 text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
        <PenLine size={16} /> Writing Style &amp; Tone
      </h1>
      <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
        These settings define the personalized prompt that makes the AI sound like you. Drafts stay grounded in the thread and are never sent on their own.
      </p>

      {/* About me + role */}
      <div className="mt-5 space-y-3">
        <div>
          <Label>About me</Label>
          <textarea
            value={style.aboutMe}
            maxLength={600}
            onChange={(e) => patch({ aboutMe: e.target.value })}
            placeholder="A line or two about you and what you do, so drafts have context."
            rows={2}
            className="mt-1 w-full rounded-md border px-2 py-1.5 text-[12px] outline-none"
            style={inputStyle}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Role</Label>
            <input value={style.role} maxLength={120} onChange={(e) => patch({ role: e.target.value })}
              placeholder="Founder at Acme" className="mt-1 w-full rounded-md border px-2 py-1.5 text-[12px] outline-none" style={inputStyle} />
          </div>
          <div>
            <Label>Sign off</Label>
            <input value={style.signOff} maxLength={120} onChange={(e) => patch({ signOff: e.target.value })}
              placeholder="Best / Thanks" className="mt-1 w-full rounded-md border px-2 py-1.5 text-[12px] outline-none" style={inputStyle} />
          </div>
        </div>
        <div>
          <Label>Scheduling link</Label>
          <input value={style.schedulingLink} maxLength={120} onChange={(e) => patch({ schedulingLink: e.target.value })}
            placeholder="www.calendly.com/meeting" className="mt-1 w-full rounded-md border px-2 py-1.5 text-[12px] outline-none" style={inputStyle} />
          <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            Inserted only when a draft proposes a meeting or call. A link that isn&apos;t a valid URL is dropped on save.
          </p>
        </div>
      </div>

      {/* The editable prompt */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <Label>Writing style prompt</Label>
          <button onClick={() => patch({ prompt: defaultPrompt })}
            className="flex items-center gap-1 text-[11px] hover:underline" style={{ color: "var(--color-text-secondary)" }}>
            <RotateCcw size={11} /> Reset to default
          </button>
        </div>
        <textarea
          value={style.prompt}
          maxLength={2000}
          onChange={(e) => patch({ prompt: e.target.value })}
          rows={7}
          className="mt-1 w-full rounded-md border px-2 py-1.5 text-[12px] leading-relaxed outline-none"
          style={inputStyle}
        />
        <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          This is the exact prompt the drafter uses — edit it freely. Auto-send or skip-approval phrasing is ignored.
        </p>
        {/* Fill it up — the single gradient CTA + the derive proposal */}
        <div className="mt-2">
          <Button variant="gradient" size="sm" onClick={() => void fillItUp()} disabled={proposal.status === "pending"}
            icon={proposal.status === "pending" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}>
            {proposal.status === "pending" ? "Reading your sent mail…" : "Fill it up for me!"}
          </Button>
          {proposal.status === "ready" && proposal.prompt && (
            <div className="mt-2 rounded-lg border p-3" style={{ borderColor: "var(--color-accent)", background: "var(--color-accent-soft)" }}>
              <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-accent)" }}>
                Proposed from your sent mail
              </span>
              <pre className="mt-1.5 whitespace-pre-wrap text-[12px]" style={{ color: "var(--color-text-secondary)", fontFamily: "inherit" }}>
                {proposal.prompt}
              </pre>
              <div className="mt-2 flex items-center gap-2">
                <Button size="sm" onClick={() => void acceptProposal()} disabled={saving} icon={<Check size={12} />}>Use this</Button>
                <Button size="sm" variant="outline" onClick={() => void dismissProposal()} icon={<X size={12} />}>Dismiss</Button>
              </div>
            </div>
          )}
          {(proposal.status === "rejected" || proposal.status === "insufficient") && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px]"
              style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)", color: "var(--color-text-secondary)" }}>
              <span className="flex-1">{proposal.reason ?? "Couldn't derive a style this time."}</span>
              <button onClick={() => void dismissProposal()} style={{ color: "var(--color-text-muted)" }}><X size={13} /></button>
            </div>
          )}
        </div>
      </div>

      {/* Tone preset (folded in from the voice record) */}
      {voiceOptions.length > 0 && (
        <div className="mt-5">
          <Label>Tone</Label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {voiceOptions.map((o) => {
              const active = tone === o.id;
              return (
                <button key={o.id} type="button" onClick={() => { setTone(o.id); setSaved(false); }} title={o.hint}
                  className="rounded-full px-2.5 py-1 text-[12px] font-medium"
                  style={{
                    border: "1px solid var(--color-border-default)",
                    background: active ? "var(--color-accent-soft)" : "transparent",
                    color: active ? "var(--color-accent)" : "var(--color-text-secondary)",
                  }}>
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Extra voice guidance + auto-draft — folded in from the retired
          /settings/inbox-voice page so "how the AI writes" lives in one place. */}
      <div className="mt-4">
        <Label>Extra guidance (optional)</Label>
        <textarea
          value={customGuidance}
          maxLength={300}
          onChange={(e) => { setCustomGuidance(e.target.value); setSaved(false); }}
          placeholder="e.g. Use the prospect's first name and always offer a short call."
          rows={3}
          className="mt-1 w-full rounded-md border px-2 py-1.5 text-[12px] outline-none"
          style={inputStyle}
        />
      </div>

      <label
        className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border p-3"
        style={{
          borderColor: autoDraft ? "var(--color-accent)" : "var(--color-border-default)",
          background: autoDraft ? "var(--color-accent-soft)" : "var(--color-bg-card)",
        }}
      >
        <input
          type="checkbox"
          checked={autoDraft}
          onChange={() => { setAutoDraft((v) => !v); setSaved(false); }}
          className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
        />
        <span className="min-w-0">
          <span className="block text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            Pre-draft replies on open
          </span>
          <span className="block text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            When you open a thread that warrants a reply, prepare a voice-matched draft automatically. It is never sent on its own, and threads that don&apos;t need a reply are left untouched.
          </span>
        </span>
      </label>

      {/* Audiences */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <Label>Audiences</Label>
          <Button size="sm" variant="outline" onClick={addAudience} icon={<Plus size={12} />}>Add audience</Button>
        </div>
        <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          Optional style variants per recipient segment. The first match wins; otherwise the base prompt is used.
        </p>
        {(style.audiences ?? []).length === 0 ? (
          <p className="mt-2 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>No audiences yet — every recipient gets the base style.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {style.audiences.map((a) => (
              <div key={a.id} className="rounded-lg border p-3" style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}>
                <div className="flex items-center gap-2">
                  <input value={a.label} maxLength={60} onChange={(e) => updateAudience(a.id, { label: e.target.value })}
                    placeholder="Audience name (e.g. Investors)" className="flex-1 rounded-md border px-2 py-1 text-[12px] outline-none" style={inputStyle} />
                  <button onClick={() => removeAudience(a.id)} style={{ color: "var(--color-text-muted)" }} aria-label="Remove audience"><Trash2 size={14} /></button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <select value={a.match.kind}
                    onChange={(e) => updateAudience(a.id, { match: { kind: e.target.value as AudienceMatch["kind"], value: a.match.value } })}
                    className="rounded-md border px-2 py-1 text-[12px] outline-none" style={inputStyle}>
                    {MATCH_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                  </select>
                  {a.match.kind !== "all" && (
                    <input value={a.match.value ?? ""} maxLength={120}
                      onChange={(e) => updateAudience(a.id, { match: { kind: a.match.kind, value: e.target.value } })}
                      placeholder={MATCH_KINDS.find((k) => k.id === a.match.kind)?.placeholder}
                      className="flex-1 rounded-md border px-2 py-1 text-[12px] outline-none" style={inputStyle} />
                  )}
                </div>
                <textarea value={a.prompt} maxLength={2000} onChange={(e) => updateAudience(a.id, { prompt: e.target.value })}
                  rows={3} placeholder="How drafts to this audience should read (replaces the base style)."
                  className="mt-2 w-full rounded-md border px-2 py-1.5 text-[12px] outline-none" style={inputStyle} />
              </div>
            ))}
          </div>
        )}
        {/* Routing preview (R4.5) */}
        <div className="mt-3 flex items-center gap-2">
          <input value={previewEmail} onChange={(e) => setPreviewEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void runPreview(); }}
            placeholder="Test a recipient email to see which audience applies"
            className="flex-1 rounded-md border px-2 py-1 text-[12px] outline-none" style={inputStyle} />
          <Button size="sm" variant="outline" onClick={() => void runPreview()} disabled={!previewEmail.trim()}>Preview</Button>
        </div>
        {preview && (
          <p className="mt-1.5 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            {preview.email} resolves to{" "}
            <span className="font-medium" style={{ color: "var(--color-accent)" }}>{preview.label ?? "the base style"}</span>.
          </p>
        )}
      </div>

      {/* Save */}
      <div className="mt-6 flex items-center gap-3">
        <Button size="sm" onClick={() => void save()} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 size={13} className="animate-spin" /> : null}
          {saving ? "Saving…" : "Save"}
        </Button>
        {saved && <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>Saved.</span>}
      </div>
    </div>
  );
}
