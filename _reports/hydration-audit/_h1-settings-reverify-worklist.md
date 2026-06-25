# H1 settings re-verification worklist — 2026-06-25

The audit rated 16 settings pages H1. Hostile re-verification (`verify-h1-settings-pages`,
16 Explore agents vs current code) found **14 are actually H2** — same error-as-empty /
swallowed-save / silent-stale class as the confirmed H2 pages. Genuinely H1: **S16
llm-budget, S29 capture-approvals** (zero defects).

Fix pattern (proven ~20×): GET → loadError + retry / error surface (or migrate to
useSafeFetch); mutation → check res.ok + toast on failure; optimistic toggle → store prev +
revert on !res.ok. KEEP `toast` OUT of useCallback dep arrays (opp infinite-loop lesson).
Run any existing page test before commit.

Status: [ ] todo · [x] done · [~] excluded.

## DONE (2026-06-25) — 12 fixed, S17 verified fine, S28 excluded

- batch A `aabea9e9`: S02 · S35 · S06 · S23.
- batch B `1906768a`: S13 · S25 · S19.
- batch C+D (this commit): S11 · S27 · S15 (onboarding-velocity-tile) · S36 · S03.
- **S17 mcp = NO FIX (agent over-reported):** verified `fetchKeys` already `throw`s on
  !res.ok → catch → `setError` (renders). Only a P2 rawKey-guard remains; deferred.
- **S03 members = narrower than claimed (agent over-reported 4/5):** handleRoleChange/
  confirmRemove/confirmCancelInvite ALL check `err` before mutating (not optimistic).
  Real gaps fixed: invites GET was `silent:true` (now toasts) + roster rendered blank on
  load failure (now loadError + Retry). The "return persisted value" route changes the
  agent suggested were NOT needed.
- LESSON (again): the VERIFICATION agents over-report too — verify their findings against
  code, exactly like the audit. S17/S03 would've been needless churn.

- [ ] **S02 workspace** — GET no res.ok check (page.tsx:35-36); logo-reload-after-save no
  res.ok (125). Add res.ok guards.
- [ ] **S06 signals** — GET swallow (51) + bare catch marks loaded with empty (55-56) +
  no error UI (224-230). loadError + surface.
- [ ] **S11 icp** — refresh() swallows GET errors on /api/icps + /api/icp-catalog (136-150);
  estimate() swallows TAM-estimate failure (P2, 715-745). Toast on !ok.
- [ ] **S13 knowledge (settings)** — saveTopic PUT no res.ok (133-137); toggleStage optimistic
  no revert (102-106); DELETE no res.ok (165). res.ok + revert.
- [ ] **S15 llm-evals** — OnboardingVelocityTile hides on 500 (onboarding-velocity-tile.tsx:73-75).
  Error state for non-401/403.
- [ ] **S17 mcp** — fetchKeys swallows (mcp-client.tsx:30-41); rawKey not validated post-POST
  (61, P2). Add res.ok + toast (lighter than full safeFetch migration).
- [ ] **S19 mailbox-identity** — 2 GETs fail silently to empty (45,46); PATCH optimistic no
  revert (62-79). loadError + revert.
- [ ] **S23 inbox-ai-profile** — GET `.catch(()=>{})` (38); PUT fail-soft (61-62); optimistic
  no revert (101-104). error state + revert.
- [ ] **S25 inbox-memory** — GET → blank form on fail (54-64); PUT swallow (114-115).
  loadError + save toast.
- [ ] **S27 recording** — /api/features raw fetch().catch swallow (57-61) — fall back to
  notetakerOn=FALSE on error not true; post-PUT no refetch (P2, 101-104). usesSafeFetch:true
  for the main save already.
- [ ] **S35 product** — GET no res.ok before .json() (28-39). res.ok guard + error.
- [ ] **S36 guardrails** — workspace GET non-ok leaves approvalMode null no error UI (107-110,
  206-256); sending-infra GET non-ok generic msg no retry (P2, 111-113). error state.
- [ ] **S03 members** (usesSafeFetch:true — errors already toast) — roster GET error renders as
  empty roster (115-124); invites GET silent:true no signal (118); role-change/remove/
  invite-cancel optimistic without confirming server persisted (126-139, 314-331, 287-304).
  Do CLIENT-ONLY res.ok + revert (NOT the route-change "return persisted value" the agent
  suggested — heavier, defer). Avatar upsert fail-soft = P2.
- [~] **S28 sending-infrastructure** — EXCLUDED: parallel session owns this file (it + its
  `_linkedin-connect.tsx`/`_instantly-mailboxes.tsx` were uncommitted WIP at session start).
  Real defects exist (VoiceSection /api/calls/config, InstantlyMailboxes, LinkedInConnect all
  error-as-empty on fetch) — hand to the parallel session, do NOT edit here.
- [x] **S16 llm-budget**, **S29 capture-approvals** — genuinely H1, no fix.
