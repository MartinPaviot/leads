"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, GitMerge, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { CompanyLogo } from "@/components/ui/company-logo";

interface Candidate {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  companyId: string | null;
  score: number | null;
  updatedAt: string | null;
  propertiesCount: number;
}

interface DuplicateGroup {
  email: string;
  count: number;
  candidates: Candidate[];
}

interface MinimalContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  companyId: string | null;
  companyName: string | null;
  companyDomain: string | null;
  score: number | null;
  properties: Record<string, unknown> | null;
}

function displayName(c: { firstName: string | null; lastName: string | null; email: string | null }) {
  const n = [c.firstName, c.lastName].filter(Boolean).join(" ");
  return n || c.email || "Untitled contact";
}

/**
 * K2 — Contact merge picker.
 *
 * Two modes:
 * 1. `?ids=a,b,c` — curated merge: the user picked these on the
 *    contacts list. We fetch each contact's metadata and show one
 *    form where the user picks a survivor and confirms the rest.
 * 2. No ids — auto-detected groups: GET /api/contacts/merge returns
 *    duplicate groups keyed on lowercased email. The user picks a
 *    survivor per group and merges one group at a time.
 */
export default function ContactsMergePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const preselectedIds = useMemo(() => {
    const raw = searchParams?.get("ids");
    if (!raw) return [] as string[];
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }, [searchParams]);

  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [curated, setCurated] = useState<MinimalContact[]>([]);
  const [survivors, setSurvivors] = useState<Record<string, string>>({});
  const [merging, setMerging] = useState<string | null>(null);

  const groupKey = useCallback((g: DuplicateGroup) => g.email, []);

  const loadAuto = useCallback(async () => {
    try {
      const res = await fetch("/api/contacts/merge");
      if (!res.ok) {
        toast("Failed to load duplicate groups.", "error");
        return;
      }
      const data = (await res.json()) as { groups: DuplicateGroup[] };
      setGroups(data.groups || []);
      const defaults: Record<string, string> = {};
      for (const g of data.groups || []) {
        if (g.candidates.length > 0) defaults[g.email] = g.candidates[0].id;
      }
      setSurvivors(defaults);
    } catch (e) {
      console.warn("contacts/merge: loadAuto failed", e);
      toast("Failed to load duplicate groups.", "error");
    }
  }, [toast]);

  const loadCurated = useCallback(async () => {
    try {
      // Fetch exactly the preselected contacts by id (enriched), not the tenant's
      // first 50 — otherwise an id past row 50 was dropped, falsely tripping the
      // "Need at least 2 valid contacts" guard below.
      const res = await fetch(
        `/api/contacts?ids=${encodeURIComponent(preselectedIds.join(","))}&pageSize=${Math.min(200, Math.max(1, preselectedIds.length))}`,
      );
      if (!res.ok) {
        toast("Failed to load contacts.", "error");
        return;
      }
      const data = (await res.json()) as { contacts: MinimalContact[] };
      const byId = new Map<string, MinimalContact>();
      for (const c of data.contacts || []) byId.set(c.id, c);
      const resolved = preselectedIds
        .map((id) => byId.get(id))
        .filter((c): c is MinimalContact => !!c);
      if (resolved.length < 2) {
        toast("Need at least 2 valid contacts to merge.", "error");
        setCurated([]);
        return;
      }
      setCurated(resolved);
      const key = "__curated__";
      setSurvivors({ [key]: resolved[0].id });
    } catch (e) {
      console.warn("contacts/merge: loadCurated failed", e);
      toast("Failed to load contacts.", "error");
    }
  }, [preselectedIds, toast]);

  useEffect(() => {
    setLoading(true);
    (preselectedIds.length > 0 ? loadCurated() : loadAuto()).finally(() =>
      setLoading(false)
    );
  }, [preselectedIds.length, loadAuto, loadCurated]);

  async function mergeGroup(key: string, allIds: string[]) {
    const survivorId = survivors[key];
    if (!survivorId) {
      toast("Pick a survivor first.", "info");
      return;
    }
    const mergedIds = allIds.filter((id) => id !== survivorId);
    if (mergedIds.length === 0) {
      toast("Nothing to merge.", "info");
      return;
    }
    setMerging(key);
    try {
      const res = await fetch("/api/contacts/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survivorId, mergedIds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast((body as { error?: string }).error || "Merge failed.", "error");
        return;
      }
      toast(`Merged ${mergedIds.length} contact${mergedIds.length === 1 ? "" : "s"} into 1.`, "success");
      if (key === "__curated__") {
        router.push("/contacts");
      } else {
        setGroups((prev) => prev.filter((g) => g.email !== key));
        setSurvivors((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    } catch (e) {
      console.warn("contacts/merge: POST failed", e);
      toast("Merge failed — network error.", "error");
    } finally {
      setMerging(null);
    }
  }

  const showingCurated = preselectedIds.length > 0 && curated.length >= 2;

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<GitMerge size={16} />} title="Merge contacts" subtitle={showingCurated ? "Curated selection" : "Auto-detected duplicates"}>
        <Button variant="outline" size="sm" icon={<ArrowLeft size={12} />} onClick={() => router.push("/contacts")}>
          Back to contacts
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto px-5 pb-5 pt-3">
        {loading ? (
          <div className="mt-10 text-center text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            Loading duplicates…
          </div>
        ) : showingCurated ? (
          <CuratedForm
            contacts={curated}
            survivorId={survivors["__curated__"]}
            onSurvivorChange={(id) => setSurvivors({ __curated__: id })}
            onMerge={() => mergeGroup("__curated__", curated.map((c) => c.id))}
            merging={merging === "__curated__"}
          />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<Users size={28} />}
            title="No duplicate emails detected"
            description="We scan contacts for matching emails. Add more contacts or import a CSV to find overlaps."
          />
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <GroupCard
                key={groupKey(g)}
                group={g}
                survivorId={survivors[g.email]}
                onSurvivorChange={(id) => setSurvivors((prev) => ({ ...prev, [g.email]: id }))}
                onMerge={() => mergeGroup(g.email, g.candidates.map((c) => c.id))}
                merging={merging === g.email}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GroupCard({
  group,
  survivorId,
  onSurvivorChange,
  onMerge,
  merging,
}: {
  group: DuplicateGroup;
  survivorId: string | undefined;
  onSurvivorChange: (id: string) => void;
  onMerge: () => void;
  merging: boolean;
}) {
  return (
    <section
      className="rounded-lg border"
      style={{
        borderColor: "var(--color-border-default)",
        background: "var(--color-bg-card)",
      }}
    >
      <header className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: "var(--color-border-default)" }}>
        <div>
          <h2 className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            {group.email}
          </h2>
          <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            {group.count} contacts share this email
          </p>
        </div>
        <Button
          variant="gradient"
          size="sm"
          icon={<GitMerge size={12} />}
          onClick={onMerge}
          disabled={!survivorId || merging}
          loading={merging}
        >
          {merging ? "Merging…" : `Merge ${group.count - 1} into survivor`}
        </Button>
      </header>
      <ul className="divide-y" style={{ borderColor: "var(--color-border-default)" }}>
        {group.candidates.map((c, i) => (
          <CandidateRow
            key={c.id}
            candidate={c}
            highlighted={i === 0}
            isSurvivor={survivorId === c.id}
            onPick={() => onSurvivorChange(c.id)}
          />
        ))}
      </ul>
    </section>
  );
}

function CandidateRow({
  candidate,
  highlighted,
  isSurvivor,
  onPick,
}: {
  candidate: Candidate;
  highlighted: boolean;
  isSurvivor: boolean;
  onPick: () => void;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <label className="flex items-center">
        <input
          type="radio"
          name={`survivor-${candidate.email ?? candidate.id}`}
          checked={isSurvivor}
          onChange={onPick}
          aria-label={`Pick ${displayName(candidate)} as survivor`}
          className="h-3.5 w-3.5"
        />
      </label>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <CompanyLogo domain={null} name={displayName(candidate)} size={28} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            {displayName(candidate)}
          </p>
          <p className="truncate text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            {[candidate.title, candidate.email].filter(Boolean).join(" · ") || "No title"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
        <span>{candidate.propertiesCount} fields</span>
        {candidate.score != null && <span>score {candidate.score}</span>}
        {highlighted && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
            style={{ background: "var(--color-accent-soft, var(--color-bg-page))", color: "var(--color-accent)" }}
          >
            Richest
          </span>
        )}
      </div>
    </li>
  );
}

function CuratedForm({
  contacts,
  survivorId,
  onSurvivorChange,
  onMerge,
  merging,
}: {
  contacts: MinimalContact[];
  survivorId: string | undefined;
  onSurvivorChange: (id: string) => void;
  onMerge: () => void;
  merging: boolean;
}) {
  return (
    <section
      className="rounded-lg border"
      style={{
        borderColor: "var(--color-border-default)",
        background: "var(--color-bg-card)",
      }}
    >
      <header className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: "var(--color-border-default)" }}>
        <div>
          <h2 className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            {contacts.length} contacts selected
          </h2>
          <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            Pick the survivor. Every activity, deal, sequence, and task on the others will be repointed before they&apos;re deleted.
          </p>
        </div>
        <Button
          variant="gradient"
          size="sm"
          icon={<GitMerge size={12} />}
          onClick={onMerge}
          disabled={!survivorId || merging}
          loading={merging}
        >
          {merging ? "Merging…" : `Merge ${contacts.length - 1} into survivor`}
        </Button>
      </header>
      <ul className="divide-y" style={{ borderColor: "var(--color-border-default)" }}>
        {contacts.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-3">
            <label className="flex items-center">
              <input
                type="radio"
                name="curated-survivor"
                checked={survivorId === c.id}
                onChange={() => onSurvivorChange(c.id)}
                aria-label={`Pick ${displayName(c)} as survivor`}
                className="h-3.5 w-3.5"
              />
            </label>
            <CompanyLogo domain={c.companyDomain} name={displayName(c)} size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                {displayName(c)}
              </p>
              <p className="truncate text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                {[c.title, c.email, c.companyName].filter(Boolean).join(" · ") || "No details"}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              {c.score != null && <span>score {c.score}</span>}
              {c.properties && <span>{Object.keys(c.properties).length} fields</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
