"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight, ArrowLeft, Loader2, Check, Target, Users, Mail,
  Zap, X, Send,
} from "lucide-react";
import { INDUSTRIES, COMPANY_SIZES, GEOGRAPHIES, DECISION_MAKER_ROLES } from "@/lib/config/icp-constants";
import { sanitizeHtml } from "@/lib/infra/sanitize-html";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import { useRegisterPageActions } from "@/lib/chat/page-actions/registry";

/* ── CLE-14: page-action helpers (pure, shared) ── */

const okResult = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const errResult = (error: string, summary?: string): PageActionResult => ({ ok: false, error, summary: summary ?? error });

/** Type a PageAction against its own params schema, then erase P so heterogeneous
 *  actions live in one PageAction[] (the registry stores PageAction<unknown>). */
function definePageAction<P>(a: PageAction<P>): PageAction {
  return a as unknown as PageAction;
}

/**
 * CLE-14 — the wizard IDs we INTENTIONALLY do NOT register. The wizard's
 * "Approve all" (approveAll) and "Launch campaign" (launchCampaign) handlers are
 * SEND-BEARING: they queue/dispatch real outbound email. The agent PREPARES and
 * NAVIGATES the wizard (sequences.wizardAdvance moves steps); the human APPROVES
 * and LAUNCHES. A boundary test asserts the registered wizard set is disjoint
 * from this — adding any of these would be a parity breach (README §2).
 */
export const SEQUENCES_WIZARD_EXCLUDED_IDS = [
  "sequences.wizardApproveAll",
  "sequences.wizardLaunch",
  "sequences.wizardSend",
] as const;

const pill = "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all duration-150 cursor-pointer select-none";

function SearchableSelect({ label, placeholder, options, selected, onToggle }: {
  label: string;
  placeholder: string;
  options: string[];
  selected: string[];
  onToggle: (val: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const filtered = options.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase()) && !selected.includes(o)
  );

  const openDropdown = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    setOpen(true);
  };

  return (
    <div>
      <label className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>{label}</label>
      {selected.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {selected.map((val) => (
            <span key={val} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: "var(--color-accent)", color: "white" }}>
              {val}
              <button type="button" onClick={() => onToggle(val)} className="hover:opacity-70">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="mt-1">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); openDropdown(); }}
          onFocus={openDropdown}
          placeholder={selected.length > 0 ? "Add more..." : placeholder}
          className="w-full rounded-lg px-3 py-2 text-[12px] outline-none"
          style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
        />
        {open && filtered.length > 0 && (
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => { setOpen(false); setSearch(""); }} />
            <div className="fixed z-[9999] max-h-48 overflow-y-auto rounded-lg py-1"
              style={{ top: pos.top, left: pos.left, width: pos.width, background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", boxShadow: "0 8px 30px rgba(0,0,0,0.12)" }}>
              {filtered.slice(0, 20).map((opt) => (
                <button key={opt} type="button" onClick={() => { onToggle(opt); setSearch(""); }}
                  className="w-full text-left px-3 py-1.5 text-[12px] transition-colors"
                  style={{ color: "var(--color-text-primary)" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-bg-hover)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >{opt}</button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface CampaignWizardProps {
  onClose: () => void;
  onComplete: (sequenceId: string) => void;
  /** If provided, use this existing sequence instead of creating a new one */
  sequenceId?: string;
}

type WizardStep = "targets" | "generating" | "review" | "launch";

export function CampaignWizard({ onClose, onComplete, sequenceId: existingSequenceId }: CampaignWizardProps) {
  const [step, setStep] = useState<WizardStep>("targets");

  // ── Step 1: Target selection ──
  const [campaignName, setCampaignName] = useState("");
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedGeographies, setSelectedGeographies] = useState<string[]>([]);
  const [minScore, setMinScore] = useState(0);
  const [maxCompanies, setMaxCompanies] = useState(50);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(["CEO", "CTO", "VP Engineering", "VP Sales", "Head of Growth"]);
  const [maxContactsPerCompany, setMaxContactsPerCompany] = useState(3);

  // ── Preview ──
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // ── Step 2: Generation progress ──
  const [sequenceId, setSequenceId] = useState<string | null>(existingSequenceId || null);
  const [genStatus, setGenStatus] = useState<string>("idle");
  const [genStats, setGenStats] = useState<{ companiesSelected?: number; contactsFound?: number; emailsDrafted?: number }>({});
  const [error, setError] = useState<string | null>(null);

  // ── Step 3: Review ──
  const [emails, setEmails] = useState<Array<{
    id: string; toAddress: string; subject: string; bodyHtml: string; status: string; stepNumber: number | null;
    contact: { firstName: string | null; lastName: string | null; title: string | null } | null;
  }>>([]);
  const [reviewFilter, setReviewFilter] = useState<"draft" | "queued">("draft");

  // Toggle pill helper
  const toggle = (list: string[], val: string, setter: (v: string[]) => void) => {
    setter(list.includes(val) ? list.filter((v) => v !== val) : [...list, val]);
  };

  // ── Fetch preview count ──
  const fetchPreview = useCallback(async () => {
    if (!sequenceId && !existingSequenceId) return;
    setLoadingPreview(true);
    try {
      const params = new URLSearchParams();
      selectedIndustries.forEach((i) => params.append("industry", i));
      selectedSizes.forEach((s) => params.append("size", s));
      selectedGeographies.forEach((g) => params.append("geography", g));
      if (minScore > 0) params.set("minScore", String(minScore));

      // Use any sequenceId for the preview endpoint (it just needs tenant context)
      const sid = sequenceId || existingSequenceId || "preview";
      const res = await fetch(`/api/campaigns/${sid}/preview?${params}`);
      if (res.ok) {
        const data = await res.json();
        setMatchCount(data.matchingCompanies);
      }
    } catch (e) {
      console.warn("campaign-wizard: preview fetch failed", e);
    }
    setLoadingPreview(false);
  }, [selectedIndustries, selectedSizes, selectedGeographies, minScore, sequenceId, existingSequenceId]);

  // ── Step 2: Create sequence + launch preparation ──
  async function startCampaign() {
    setStep("generating");
    setError(null);
    setGenStatus("creating");

    try {
      // 1. Create sequence if needed
      let sid = sequenceId || existingSequenceId;
      if (!sid) {
        const name = campaignName.trim() || `Campaign ${new Date().toLocaleDateString("en", { month: "short", day: "numeric" })}`;
        const createRes = await fetch("/api/sequences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!createRes.ok) throw new Error("Failed to create campaign");
        const { sequence } = await createRes.json();
        sid = sequence.id as string;
        setSequenceId(sid);
      }

      // 2. Generate AI sequence steps if none exist
      setGenStatus("generating_steps");
      const genRes = await fetch("/api/campaigns/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequenceId: sid }),
      });
      if (!genRes.ok) {
        const data = await genRes.json();
        // Non-blocking: steps might already exist or generation might fail
        console.warn("Step generation:", data.error);
      }

      // 3. Launch campaign preparation (enrichment + contact discovery + email drafting)
      setGenStatus("preparing");
      const prepRes = await fetch("/api/campaigns/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sequenceId: sid,
          segmentFilters: {
            industries: selectedIndustries,
            sizes: selectedSizes,
            geographies: selectedGeographies,
            minScore,
          },
          targetRoles: selectedRoles,
          maxCompanies,
          maxContactsPerCompany,
        }),
      });

      if (!prepRes.ok) {
        const data = await prepRes.json();
        throw new Error(data.error || "Campaign preparation failed");
      }

      // 4. Poll for status
      setGenStatus("enriching");
      pollStatus(sid!);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Campaign failed");
      setGenStatus("error");
    }
  }

  function pollStatus(sid: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/campaigns/${sid}/status`);
        if (!res.ok) return;
        const data = await res.json();

        setGenStats(data.stats || {});

        if (data.stats?.companiesEnriched > 0) setGenStatus("discovering");
        if (data.stats?.contactsFound > 0) setGenStatus("drafting");

        if (data.status === "ready") {
          clearInterval(interval);
          setGenStatus("ready");
          // Auto-advance to review
          setTimeout(() => {
            setStep("review");
            loadReviewEmails(sid);
          }, 800);
        } else if (data.status === "idle" && data.error) {
          clearInterval(interval);
          setError(data.error);
          setGenStatus("error");
        }
      } catch (e) {
        console.warn("campaign-wizard: status poll failed", e);
      }
    }, 3000);

    // Safety timeout: stop polling after 5 minutes
    setTimeout(() => clearInterval(interval), 300000);
  }

  async function loadReviewEmails(sid: string) {
    try {
      const res = await fetch(`/api/outbound/review?sequenceId=${sid}&status=${reviewFilter}`);
      if (res.ok) {
        const data = await res.json();
        setEmails(data.emails || []);
      }
    } catch (e) {
      console.warn("campaign-wizard: review emails fetch failed", e);
    }
  }

  useEffect(() => {
    if (step === "review" && sequenceId) loadReviewEmails(sequenceId);
  }, [reviewFilter]);

  async function approveAll() {
    const draftIds = emails.filter((e) => e.status === "draft").map((e) => e.id);
    if (draftIds.length === 0) return;
    await fetch("/api/outbound/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailIds: draftIds, action: "approve_all" }),
    });
    if (sequenceId) loadReviewEmails(sequenceId);
  }

  async function launchCampaign() {
    if (!sequenceId) return;
    try {
      const res = await fetch(`/api/campaigns/${sequenceId}/launch`, { method: "POST" });
      if (res.ok) {
        onComplete(sequenceId);
      }
    } catch (e) {
      console.warn("campaign-wizard: launch failed", e);
    }
  }

  // ── CLE-14: register the wizard's NON-send page action. Registers on mount,
  //    clears on unmount (the wizard is a conditional child). setStep is stable
  //    (useState). It NEVER calls approveAll/launchCampaign (those are human-bound;
  //    see SEQUENCES_WIZARD_EXCLUDED_IDS). ──
  const wizardActions: PageAction[] = useMemo(
    () => [
      definePageAction({
        id: "sequences.wizardAdvance",
        title: "Move the campaign wizard to a step",
        description:
          "Navigate the open campaign wizard to one of its steps (targets, generating, review, launch). " +
          "Use to move the user forward/back in the wizard. This only changes the visible step; it never " +
          "approves drafts or launches the campaign.",
        params: z.object({ to: z.enum(["targets", "generating", "review", "launch"]) }),
        mutating: false, cost: "free", confirm: "never",
        run: async ({ to }): Promise<PageActionResult> => {
          setStep(to);
          return okResult(`Moved to the ${to} step.`);
        },
      }),
    ],
    // Stable single-id set; setStep is a stable useState setter. Register once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useRegisterPageActions(wizardActions);

  // ── Stage labels ──
  const stageLabels: Record<string, string> = {
    creating: "Creating campaign...",
    generating_steps: "Drafting your sequence...",
    preparing: "Starting campaign preparation...",
    enriching: "Enriching companies from your TAM...",
    discovering: "Discovering decision-makers...",
    drafting: "Personalizing emails...",
    ready: "Campaign ready for review!",
    error: error || "Something went wrong",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", boxShadow: "var(--shadow-dialog)", maxHeight: "calc(100vh - 2rem)", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
          <div className="flex items-center gap-3">
            <Zap size={16} style={{ color: "var(--color-accent)" }} />
            <h2 className="text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {step === "targets" ? "New Campaign" : step === "generating" ? "Building Campaign" : step === "review" ? "Review Emails" : "Launch"}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-md transition-colors" style={{ color: "var(--color-text-tertiary)" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-bg-hover)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
            <X size={16} />
          </button>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1 px-6 py-2 shrink-0" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
          {(["targets", "generating", "review", "launch"] as WizardStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className="h-1 flex-1 rounded-full" style={{
                background: (["targets", "generating", "review", "launch"].indexOf(step) >= i)
                  ? "var(--color-accent)" : "var(--color-border-default)"
              }} />
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ══ STEP 1: TARGET SELECTION ══ */}
          {step === "targets" && (
            <div className="space-y-5">
              {/* Campaign name */}
              <div>
                <label className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>Campaign name</label>
                <input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder={`Campaign ${new Date().toLocaleDateString("en", { month: "short", day: "numeric" })}`}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-[13px] outline-none"
                  style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
                />
              </div>

              {/* Industries — searchable */}
              <SearchableSelect
                label="Target industries"
                placeholder="Search industries..."
                options={INDUSTRIES as unknown as string[]}
                selected={selectedIndustries}
                onToggle={(val) => toggle(selectedIndustries, val, setSelectedIndustries)}
              />

              {/* Company size — simple pills (few options) */}
              <div>
                <label className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>Company size</label>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {COMPANY_SIZES.map((size) => (
                    <button key={size} type="button" onClick={() => toggle(selectedSizes, size, setSelectedSizes)}
                      className={pill} style={{
                        background: selectedSizes.includes(size) ? "var(--color-accent)" : "var(--color-bg-page)",
                        color: selectedSizes.includes(size) ? "white" : "var(--color-text-secondary)",
                        border: `1px solid ${selectedSizes.includes(size) ? "var(--color-accent)" : "var(--color-border-default)"}`,
                      }}>{size}</button>
                  ))}
                </div>
              </div>

              {/* Target roles — searchable */}
              <SearchableSelect
                label="Target decision-makers"
                placeholder="Search roles (CEO, VP Sales, Head of...)"
                options={DECISION_MAKER_ROLES as unknown as string[]}
                selected={selectedRoles}
                onToggle={(val) => toggle(selectedRoles, val, setSelectedRoles)}
              />

              {/* Contacts per company */}
              <div>
                <label className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>Contacts per company</label>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>How many decision-makers to contact at each company</p>
                <div className="mt-1.5 flex gap-1">
                  {[1, 2, 3, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setMaxContactsPerCompany(n)}
                      className={pill} style={{
                        background: maxContactsPerCompany === n ? "var(--color-accent)" : "var(--color-bg-page)",
                        color: maxContactsPerCompany === n ? "white" : "var(--color-text-secondary)",
                        border: `1px solid ${maxContactsPerCompany === n ? "var(--color-accent)" : "var(--color-border-default)"}`,
                      }}>{n}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ STEP 2: GENERATING ══ */}
          {step === "generating" && (
            <div className="flex flex-col items-center justify-center py-12">
              {genStatus === "error" ? (
                <>
                  <div className="h-12 w-12 rounded-full flex items-center justify-center mb-4" style={{ background: "var(--color-error-soft)" }}>
                    <X size={20} style={{ color: "var(--color-error)" }} />
                  </div>
                  <p className="text-[14px] font-medium" style={{ color: "var(--color-error)" }}>{error}</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => { setStep("targets"); setGenStatus("idle"); }}>
                    <ArrowLeft size={13} /> Back to targets
                  </Button>
                </>
              ) : genStatus === "ready" ? (
                <>
                  <div className="h-12 w-12 rounded-full flex items-center justify-center mb-4" style={{ background: "var(--color-success-soft)" }}>
                    <Check size={20} style={{ color: "var(--color-success)" }} />
                  </div>
                  <p className="text-[14px] font-medium" style={{ color: "var(--color-text-primary)" }}>Campaign ready!</p>
                  <p className="text-[12px] mt-1" style={{ color: "var(--color-text-tertiary)" }}>Moving to review...</p>
                </>
              ) : (
                <>
                  <Loader2 size={32} className="animate-spin mb-4" style={{ color: "var(--color-accent)" }} />
                  <p className="text-[14px] font-medium" style={{ color: "var(--color-text-primary)" }}>{stageLabels[genStatus] || "Working..."}</p>
                  <div className="mt-4 space-y-2 text-center">
                    {genStats.companiesSelected != null && (
                      <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                        {genStats.companiesSelected} companies selected
                      </p>
                    )}
                    {genStats.contactsFound != null && genStats.contactsFound > 0 && (
                      <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                        {genStats.contactsFound} contacts discovered
                      </p>
                    )}
                    {genStats.emailsDrafted != null && genStats.emailsDrafted > 0 && (
                      <p className="text-[12px]" style={{ color: "var(--color-accent)" }}>
                        {genStats.emailsDrafted} emails drafted
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ STEP 3: REVIEW ══ */}
          {step === "review" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(["draft", "queued"] as const).map((f) => (
                    <button key={f} onClick={() => setReviewFilter(f)}
                      className="rounded-full px-3 py-1 text-[11px] font-medium transition-colors"
                      style={{
                        background: reviewFilter === f ? "var(--color-accent)" : "var(--color-bg-page)",
                        color: reviewFilter === f ? "white" : "var(--color-text-secondary)",
                        border: `1px solid ${reviewFilter === f ? "var(--color-accent)" : "var(--color-border-default)"}`,
                      }}
                    >{f === "draft" ? `Drafts (${emails.filter(e => e.status === "draft").length})` : `Approved (${emails.filter(e => e.status === "queued").length})`}</button>
                  ))}
                </div>
                {emails.some((e) => e.status === "draft") && (
                  <Button variant="gradient" size="sm" onClick={approveAll}>
                    <Check size={13} /> Approve all
                  </Button>
                )}
              </div>

              {emails.length === 0 ? (
                <p className="text-center py-8 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>No emails to review.</p>
              ) : (
                <div className="space-y-2">
                  {emails.filter((e) => reviewFilter === "draft" ? e.status === "draft" : e.status === "queued").slice(0, 30).map((email) => (
                    <div key={email.id} className="rounded-lg p-4" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                            {email.contact ? `${email.contact.firstName || ""} ${email.contact.lastName || ""}`.trim() : email.toAddress}
                          </span>
                          {email.contact?.title && (
                            <span className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>{email.contact.title}</span>
                          )}
                          {email.stepNumber && (
                            <Badge variant="neutral" size="sm">Step {email.stepNumber}</Badge>
                          )}
                        </div>
                        <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{email.toAddress}</span>
                      </div>
                      <p className="text-[13px] font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>{email.subject}</p>
                      <div className="text-[12px] leading-relaxed line-clamp-3" style={{ color: "var(--color-text-secondary)" }}
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(email.bodyHtml.slice(0, 300)) }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ STEP 4: LAUNCH ══ */}
          {step === "launch" && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-16 w-16 rounded-full flex items-center justify-center mb-6" style={{ background: "linear-gradient(135deg, var(--color-accent-soft), rgba(44,107,237,0.1))" }}>
                <Send size={24} style={{ color: "var(--color-accent)" }} />
              </div>
              <h3 className="text-[18px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Ready to launch</h3>
              <p className="text-[13px] mt-2 text-center max-w-sm" style={{ color: "var(--color-text-tertiary)" }}>
                {emails.filter((e) => e.status === "queued").length} emails approved and ready to send.
                Emails will be sent over the next few days following the sequence schedule.
              </p>
              <Button variant="gradient" size="md" className="mt-6" onClick={launchCampaign}>
                <Zap size={14} /> Launch campaign
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderTop: "1px solid var(--color-border-default)" }}>
          {step === "targets" && (
            <>
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button variant="gradient" size="md" onClick={startCampaign} disabled={selectedRoles.length === 0}>
                Build campaign <ArrowRight size={13} />
              </Button>
            </>
          )}
          {step === "generating" && (
            <>
              <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>This may take a minute...</span>
              <span />
            </>
          )}
          {step === "review" && (
            <>
              <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                {emails.filter((e) => e.status === "queued").length} approved · {emails.filter((e) => e.status === "draft").length} pending
              </span>
              <Button variant="gradient" size="md" onClick={() => setStep("launch")} disabled={emails.filter((e) => e.status === "queued").length === 0}>
                Continue to launch <ArrowRight size={13} />
              </Button>
            </>
          )}
          {step === "launch" && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setStep("review")}>
                <ArrowLeft size={13} /> Back to review
              </Button>
              <span />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
