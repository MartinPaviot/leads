"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { Users, DollarSign, ClipboardList, Swords, Sparkles, RefreshCw } from "lucide-react";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import { useRegisterPageActions, useRegisterEntityLocator, cssEscape } from "@/lib/chat/page-actions/registry";
import type { EntityLocator } from "@/lib/chat/page-actions/registry";
import { IntelligenceBrief } from "@/components/intelligence-brief";
import { CompanyDossier } from "@/components/company-dossier";
import { AccountCallIntel } from "@/components/call-intel";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, IndustryBadge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { DetailPageSkeleton, Skeleton } from "@/components/ui/skeleton";
import { OwnerSelect } from "@/components/owner-select";
import { useToast } from "@/components/ui/toast";
import { displayScore } from "@/lib/util/ui-utils";
import { TargetingSuppressionPanel, type SuppressionBadge } from "./_targeting-suppression-panel";

/* ── CLE-07: page-action helpers (pure, shared) ── */

const okResult = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const errResult = (error: string, summary?: string): PageActionResult => ({ ok: false, error, summary: summary ?? error });

/** Type a PageAction against its own params schema, then erase P so heterogeneous
 *  actions live in one PageAction[] (the registry stores PageAction<unknown>). */
function definePageAction<P>(a: PageAction<P>): PageAction {
  return a as unknown as PageAction;
}

/** Pure predicate: is a post-call proposal pending on this account? Mirrors the
 *  `usingPending` signal AccountCallIntel/usePendingReview reads
 *  (call-intel.tsx). Lets the call-intel actions fail cleanly (E-10) instead
 *  of POSTing a no-op review. */
function hasPendingCallIntel(account: { properties: Record<string, unknown> | null } | null): boolean {
  const pending = account?.properties?.pendingCallIntel;
  return pending != null && typeof pending === "object";
}

interface Account {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  revenue: string | null;
  description: string | null;
  score: number | null;
  scoreReasons: string[] | null;
  ownerId: string | null;
  properties: Record<string, unknown> | null;
  // Spec 35 — reversible targeting state + read-only suppression badges.
  targetingStatus: string | null;
  suppressions?: SuppressionBadge[];
}

interface Deal {
  id: string;
  name: string;
  stage: string;
  value: number | null;
}

export default function AccountDetailPage() {
  const params = useParams();
  const accountId = params.id as string;
  const [account, setAccount] = useState<Account | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Array<{ id: string; firstName: string | null; lastName: string | null; title: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiHowTheyMakeMoney, setAiHowTheyMakeMoney] = useState<string | null>(null);
  const [refreshingSummary, setRefreshingSummary] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/accounts/${accountId}`);
        if (res.ok) {
          const data = await res.json();
          setAccount(data.account);
          setDeals(data.deals || []);
          fetch(`/api/contacts?companyId=${accountId}`)
            .then((r) => (r.ok ? r.json() : { contacts: [] }))
            .then((cd) => setContacts(cd.contacts || cd.items || []))
            .catch((e) => console.warn("account-detail: contacts fetch failed", e))
            .finally(() => setContactsLoading(false));
          const props = data.account?.properties as Record<string, unknown> | null;
          if (props) {
            setAiSummary((props.ai_account_summary as string) || null);
            setAiHowTheyMakeMoney((props.ai_how_they_make_money as string) || null);
          }
        }
      } catch {
        console.error("Failed to load account");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [accountId]);

  // Spec 35 — re-fetch the account (targeting_status + suppression badges) after
  // a manual DNC add / deactivate so the panel reflects the new state.
  const reloadAccount = useCallback(async () => {
    try {
      const res = await fetch(`/api/accounts/${accountId}`);
      if (res.ok) setAccount((await res.json()).account);
    } catch {
      /* non-fatal */
    }
  }, [accountId]);

  async function reassignAccountOwner(ownerId: string | null) {
    setAccount((prev) => (prev ? { ...prev, ownerId } : prev)); // optimistic
    try {
      await fetch(`/api/accounts/${accountId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId }),
      });
    } catch {
      /* optimistic; the select already reflects the choice */
    }
  }

  // ── CLE-07: behaviour-preserving extractions, hoisted ABOVE the early
  //    returns so a registered action's run() can call them unconditionally.
  //    The JSX field-edit / summary-refresh handlers below are rewired to
  //    call these — exactly one copy of each PUT/POST. ──

  /** The inline firmographic-field PUT, extracted from the field onKeyDown.
   *  Same endpoint/body/optimistic update as before. */
  const saveField = useCallback(
    async (field: string, value: string | null): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch(`/api/accounts/${accountId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value ?? null }),
        });
        if (!res.ok) return { ok: false, error: "Couldn't save that change." };
        setAccount((prev) => (prev ? { ...prev, [field]: value ?? null } : prev));
        return { ok: true };
      } catch {
        return { ok: false, error: "Couldn't save that change." };
      }
    },
    [accountId],
  );

  /** The AI-summary refresh POST, extracted from the refresh button onClick.
   *  Same endpoint/state writes; the toast stays on the button path. */
  const refreshSummary = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/accounts/${accountId}/generate-summary`, { method: "POST" });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: e.error || "Failed to refresh summary" };
      }
      const data = await res.json();
      setAiSummary(data.ai_account_summary);
      setAiHowTheyMakeMoney(data.ai_how_they_make_money);
      return { ok: true };
    } catch {
      return { ok: false, error: "Failed to refresh summary" };
    }
  }, [accountId]);

  /** A second caller of the call-intel review REST contract — the SAME request
   *  AccountCallIntel/usePendingReview.act issues (call-intel.tsx). The server
   *  owns the live-vs-pending merge; this adds no business logic. */
  const reviewCallIntel = useCallback(
    async (action: "approve" | "dismiss"): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/call-intel/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType: "company", entityId: accountId, action }),
        });
        if (!res.ok) return { ok: false, error: "Couldn't update the proposal." };
        return { ok: true };
      } catch {
        return { ok: false, error: "Couldn't update the proposal." };
      }
    },
    [accountId],
  );

  // ── CLE-07: live refs + the dossier-card registration ref. The actions are
  //    captured once at mount; their run()s read live state via these refs. ──
  const accountIdConst = accountId;
  const accountRef = useRef(account);
  accountRef.current = account;
  const dossierApiRef = useRef<{ generate: () => Promise<void>; hasDomain: boolean } | null>(null);
  const registerDossierApi = useCallback(
    (api: { generate: () => Promise<void>; hasDomain: boolean }) => {
      dossierApiRef.current = api;
    },
    [],
  );

  const accountDetailActions: PageAction[] = useMemo(
    () => [
      definePageAction({
        id: "accounts.updateField",
        title: "Edit a field on this account",
        description:
          "Inline-edit the open account's name, domain, industry, size, or revenue. Use when the user wants to fix or set one of these.",
        params: z.object({
          accountId: z.string().min(1),
          field: z.enum(["name", "domain", "industry", "size", "revenue"]),
          value: z.string().nullable(),
        }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ accountId: aId, field, value }): Promise<PageActionResult> => {
          if (aId !== accountIdConst) return errResult("That account is not the one open here.");
          const r = await saveField(field, value);
          return r.ok ? okResult(`Set ${field} to "${value ?? ""}".`) : errResult(r.error ?? "Couldn't save that change.");
        },
      }),
      definePageAction({
        id: "accounts.reassignOwner",
        title: "Reassign this account's owner",
        description: "Set or clear the member responsible for the open account. Pass ownerId (or null to un-assign).",
        params: z.object({ accountId: z.string().min(1), ownerId: z.string().nullable() }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ accountId: aId, ownerId }): Promise<PageActionResult> => {
          if (aId !== accountIdConst) return errResult("That account is not the one open here.");
          await reassignAccountOwner(ownerId);
          return okResult(ownerId ? "Reassigned the account." : "Un-assigned the account.");
        },
      }),
      definePageAction({
        id: "accounts.refreshSummary",
        title: "Refresh this account's AI summary",
        description: "Regenerate the AI summary for the open account. Confirms first.",
        params: z.object({ accountId: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ accountId: aId }): Promise<PageActionResult> => {
          if (aId !== accountIdConst) return errResult("That account is not the one open here.");
          const r = await refreshSummary();
          return r.ok ? okResult("Refreshed the account summary.") : errResult(r.error ?? "Couldn't refresh the summary.");
        },
      }),
      definePageAction({
        id: "accounts.generateDossier",
        title: "Generate this account's research dossier",
        description:
          "Generate (or refresh) the research dossier for the open account — leadership, funding, tech stack, " +
          "competitive landscape, outreach recommendations. Needs a domain on the account. Confirms first.",
        params: z.object({ accountId: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ accountId: aId }): Promise<PageActionResult> => {
          if (aId !== accountIdConst) return errResult("That account is not the one open here.");
          const api = dossierApiRef.current;
          if (!api || !api.hasDomain) return errResult("This account has no domain, so a dossier can't be generated.");
          await api.generate();
          return okResult("Generating the research dossier — it appears on the account shortly.");
        },
      }),
      definePageAction({
        id: "accounts.approveCallIntel",
        title: "Approve the account call-intel proposal",
        description:
          "Apply the post-call proposal pending on this account (stack / competitors / triggers captured from the last call). " +
          "Only works when a proposal is pending.",
        params: z.object({ accountId: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ accountId: aId }): Promise<PageActionResult> => {
          if (aId !== accountIdConst) return errResult("That account is not the one open here.");
          if (!hasPendingCallIntel(accountRef.current)) return errResult("There is no pending call intel to approve.");
          const r = await reviewCallIntel("approve");
          return r.ok ? okResult("Applied the call intel to the account.") : errResult(r.error ?? "Couldn't update the proposal.");
        },
      }),
      definePageAction({
        id: "accounts.dismissCallIntel",
        title: "Dismiss the account call-intel proposal",
        description: "Dismiss the post-call proposal pending on this account. Only works when one is pending.",
        params: z.object({ accountId: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ accountId: aId }): Promise<PageActionResult> => {
          if (aId !== accountIdConst) return errResult("That account is not the one open here.");
          if (!hasPendingCallIntel(accountRef.current)) return errResult("There is no pending call intel to dismiss.");
          const r = await reviewCallIntel("dismiss");
          return r.ok ? okResult("Dismissed the call-intel proposal.") : errResult(r.error ?? "Couldn't update the proposal.");
        },
      }),
    ],
    // Stable id set; run()s read live state via refs / stable useCallbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountIdConst],
  );
  useRegisterPageActions(accountDetailActions);

  // CLE-15 — pulse this record's header when the chat navigates here
  // (openRecord emits navigate.highlight). Null-safe before the account loads.
  const detailContainerRef = useRef<HTMLDivElement>(null);
  const accountDetailLocate = useCallback<EntityLocator>(
    (a) =>
      a.entityId === accountIdConst
        ? detailContainerRef.current?.querySelector<HTMLElement>(`[data-cle-entity="${cssEscape(a.entityId)}"]`) ?? null
        : null,
    [accountIdConst],
  );
  useRegisterEntityLocator("accounts", accountDetailLocate);

  if (loading) return <DetailPageSkeleton avatar="square" />;
  if (!account) return <p className="p-6 text-sm text-red-400">Account not found</p>;

  const initial = account.name.charAt(0).toUpperCase();

  return (
    <div ref={detailContainerRef} className="flex h-full flex-col lg:flex-row">
      {/* Main content */}
      <div className="flex-1 overflow-auto p-6">
        <Breadcrumbs
          items={[
            { label: "Accounts", href: "/accounts" },
            { label: account.name },
          ]}
        />

        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--color-accent)] text-lg font-bold text-white">
            {initial}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold" data-cle-entity={account.id}>{account.name}</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {account.domain || "No domain"} {account.industry ? `· ${account.industry}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            <span>Owner</span>
            <OwnerSelect value={account.ownerId} onChange={reassignAccountOwner} className="h-7" ariaLabel="Account owner" />
          </div>
          <Link
            href={`/accounts/${accountId}/brain`}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border-default)",
              color: "var(--color-text-secondary)",
            }}
          >
            View brain
          </Link>
        </div>

        {/* Spec 35 — targeting status + read-only suppression badge + manual DNC */}
        <div className="mt-4">
          <TargetingSuppressionPanel
            companyId={account.id}
            targetingStatus={account.targetingStatus}
            suppressions={account.suppressions ?? []}
            onChange={reloadAccount}
          />
        </div>

        {/* AI Intelligence Brief */}
        <div className="mt-6">
          <IntelligenceBrief accountId={accountId} />
        </div>

        {/* AI Account Summary */}
        {(aiSummary || aiHowTheyMakeMoney) && (
          <div
            className="mt-4 rounded-lg p-4"
            style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                  Account Summary
                </h2>
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: "var(--color-bg-hover)", color: "var(--color-text-tertiary)" }}
                >
                  <Sparkles size={10} />
                  AI-generated
                </span>
              </div>
              <button
                onClick={async () => {
                  setRefreshingSummary(true);
                  const r = await refreshSummary();
                  toast(r.ok ? "Summary refreshed" : (r.error || "Failed to refresh summary"), r.ok ? "success" : "error");
                  setRefreshingSummary(false);
                }}
                disabled={refreshingSummary}
                className="p-1 rounded transition-colors hover:bg-[var(--color-bg-hover)]"
                style={{ color: "var(--color-text-tertiary)" }}
                title="Refresh AI summary"
              >
                <RefreshCw size={14} className={refreshingSummary ? "animate-spin" : ""} />
              </button>
            </div>
            {aiSummary && (
              <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                {aiSummary}
              </p>
            )}
            {aiHowTheyMakeMoney && (
              <div className="mt-3">
                <p
                  className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  About their business
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                  {aiHowTheyMakeMoney}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Meeting Intel Card (structured extraction from calls) */}
        {(() => {
          const props = (account as any).properties || {};
          const intel = props.meetingIntel as Record<string, unknown> | undefined;
          if (!intel || Object.keys(intel).length <= 2) return null; // skip if only lastExtracted+sourceDeal
          return (
            <div className="mt-4 rounded-lg p-3" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-tertiary)" }}>Meeting Intelligence</p>
              <div className="grid grid-cols-2 gap-2">
                {intel.teamSize != null && (
                  <div className="flex items-center gap-2">
                    <Users size={14} style={{ color: "var(--color-text-tertiary)" }} />
                    <div>
                      <p className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>Team Size</p>
                      <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{String(intel.teamSize)}</p>
                    </div>
                  </div>
                )}
                {intel.budget != null && (
                  <div className="flex items-center gap-2">
                    <DollarSign size={14} style={{ color: "var(--color-text-tertiary)" }} />
                    <div>
                      <p className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>Budget</p>
                      <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{String(intel.budget)}</p>
                    </div>
                  </div>
                )}
                {intel.currentTools != null && (
                  <div className="flex items-center gap-2">
                    <ClipboardList size={14} style={{ color: "var(--color-text-tertiary)" }} />
                    <div>
                      <p className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>Current Tools</p>
                      <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{Array.isArray(intel.currentTools) ? (intel.currentTools as string[]).join(", ") : String(intel.currentTools)}</p>
                    </div>
                  </div>
                )}
                {intel.competitors != null && (
                  <div className="flex items-center gap-2">
                    <Swords size={14} style={{ color: "var(--color-text-tertiary)" }} />
                    <div>
                      <p className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>Competitors</p>
                      <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{Array.isArray(intel.competitors) ? (intel.competitors as string[]).join(", ") : String(intel.competitors)}</p>
                    </div>
                  </div>
                )}
              </div>
              {intel.lastExtracted != null && (
                <p className="mt-2 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                  Extracted {new Date(intel.lastExtracted as string).toLocaleDateString()}
                </p>
              )}
            </div>
          );
        })()}

        {/* What the call revealed about the org (stack / triggers — the Pilae lever) */}
        <AccountCallIntel properties={account.properties} entityId={accountId} />

        {/* Research Dossier */}
        <div className="mt-4">
          <CompanyDossier
            accountId={accountId}
            accountDomain={account.domain}
            accountName={account.name}
            onRegister={registerDossierApi}
          />
        </div>

        {account.description && (
          <div className="mt-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">About</h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)] leading-relaxed">{account.description}</p>
          </div>
        )}

        {/* Contacts at this account */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Contacts ({contacts.length})
          </h2>
          {contactsLoading ? (
            <div className="mt-2 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardBody>
                    <Skeleton className="h-4 rounded" style={{ width: `${60 + (i * 13) % 25}%` }} />
                    <Skeleton className="mt-1 h-3 rounded" style={{ width: `${40 + (i * 11) % 20}%` }} />
                  </CardBody>
                </Card>
              ))}
            </div>
          ) : contacts.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">No contacts linked to this account yet.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {contacts.map((c) => (
                <Link key={c.id} href={`/contacts/${c.id}`} className="block">
                  <Card>
                    <CardBody>
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">
                        {[c.firstName, c.lastName].filter(Boolean).join(" ") || "Unnamed contact"}
                      </p>
                      {c.title && (
                        <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{c.title}</p>
                      )}
                    </CardBody>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Deals */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Opportunities ({deals.length})
          </h2>
          {deals.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">No deals linked to this account.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {deals.map((deal) => (
                <Link key={deal.id} href={`/opportunities/${deal.id}`} className="block">
                  <Card>
                    <CardBody>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">{deal.name}</p>
                        <Badge variant="neutral">{deal.stage}</Badge>
                      </div>
                      {deal.value != null && deal.value > 0 && (
                        <p className="mt-0.5 text-xs text-emerald-500">${deal.value.toLocaleString()}</p>
                      )}
                    </CardBody>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* G3: Suggested Contacts */}
        <SuggestedContacts accountId={accountId} accountName={account.name} />
      </div>

      {/* Right panel */}
      <div className="w-full shrink-0 border-t p-6 lg:w-[300px] lg:border-t-0 lg:border-l" style={{ borderColor: "var(--color-border-default)" }}>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
          Account details
        </h3>
        <div className="mt-4 space-y-3">
          {([
            { key: "name", label: "Name", value: account.name },
            { key: "domain", label: "Domain", value: account.domain },
            { key: "industry", label: "Industry", value: account.industry },
            { key: "size", label: "Size", value: account.size },
            { key: "revenue", label: "Revenue", value: account.revenue },
          ] as Array<{ key: string; label: string; value: string | null }>).map((field) => (
            <div key={field.key}>
              <p className="text-xs text-[var(--color-text-tertiary)]">{field.label}</p>
              {editingField === field.key ? (
                <div className="flex items-center gap-1 mt-0.5">
                  <input
                    autoFocus
                    className="flex-1 rounded border px-2 py-0.5 text-sm outline-none"
                    style={{ borderColor: "var(--color-accent)", color: "var(--color-text-primary)", background: "var(--color-bg-card)" }}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        await saveField(field.key, editValue || null);
                        setEditingField(null);
                      } else if (e.key === "Escape") {
                        setEditingField(null);
                      }
                    }}
                    onBlur={() => setEditingField(null)}
                  />
                </div>
              ) : (
                <p
                  className="text-sm cursor-pointer rounded px-1 -mx-1 transition-colors hover:bg-[var(--color-bg-hover)]"
                  style={{ color: field.value ? "var(--color-text-primary)" : "var(--color-text-muted)" }}
                  onClick={() => { setEditingField(field.key); setEditValue(field.value || ""); }}
                  title="Click to edit"
                >
                  {field.key === "industry" && field.value ? (
                    <IndustryBadge value={field.value} />
                  ) : (
                    field.value || `Set ${field.label.toLowerCase()}`
                  )}
                </p>
              )}
            </div>
          ))}
          {(() => {
            // A fit score is only meaningful once the account carries
            // real firmographics. Without enrichment the score is a
            // no-data floor (F/Cold), so show "Not scored" instead of a
            // misleading grade — consistent with the accounts/contacts tables.
            const enriched = !!(account.industry && account.description);
            const s = displayScore(account.score, enriched);
            return (
              <div>
                <p className="text-xs text-[var(--color-text-tertiary)]">Score</p>
                {s ? (
                  <>
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <span
                        className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ background: s.color }}
                      >
                        {s.grade}
                      </span>
                      <span style={{ color: s.color }}>{s.heat}</span>
                    </p>
                    {account.scoreReasons && account.scoreReasons.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {account.scoreReasons.slice(0, 3).map((r, i) => (
                          <li key={i} className="text-[10px] text-[var(--color-text-tertiary)]">• {r}</li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Not scored</p>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// G3: Contact Auto-Suggestion component
function SuggestedContacts({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [suggestions, setSuggestions] = useState<Array<{
    name: string;
    title: string;
    reason: string;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  async function fetchSuggestions() {
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/suggested-contacts`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }

  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
        Suggested Contacts
      </h2>
      {!fetched ? (
        <Button
          variant="outline"
          onClick={fetchSuggestions}
          loading={loading}
          className="mt-2 w-full"
        >
          {loading ? "Discovering contacts..." : `Discover contacts at ${accountName}`}
        </Button>
      ) : suggestions.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">No suggestions available.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {suggestions.map((s, i) => (
            <Card key={i}>
              <CardBody>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">{s.name}</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">{s.title}</p>
                  </div>
                  <Badge variant="success">Suggested</Badge>
                </div>
                <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">{s.reason}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
