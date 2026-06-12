# Office hours — title-persona-fit

**Problem (one sentence).** Contact ICP fit ignores the strongest persona signal — the job title — because the 446 distinct, multilingual titles on the live tenant cannot be honestly matched to an ICP's target personas by literal string compare ("Directeur Général" vs "ceo").

**Premise challenge.** Do we even need this? Yes: "scorer chaque contact avec les différentes ICP" (founder, 2026-06-11) is incomplete while the persona dimension is silent — seniority (shipped in PR #201) says *how senior*, not *which function* (a CFO and a CTO are both `c_suite`). Could we instead wait for users to only source perfectly-titled contacts? No — titles arrive from Apollo, CSV imports and inbound, in any language.

**Alternatives explored.**
1. Hardcoded synonym table (title → persona). Banned by repo rule (no-hardcoded-matching): covers only the terms someone thought of, breaks on the next French/German title, drifts forever.
2. Embedding similarity (title ↔ persona cosine). New infra (embedding store per tenant vocabulary), opaque threshold tuning, hard to explain in score reasons; overkill for ≤ a few hundred labels.
3. Seniority-only (status quo). Already live; cannot express function-level personas — exactly the gap.
4. **LLM mapping over real labels (matchIndustries pattern)** — give the model the tenant's *actual* persona vocabulary and the *actual* titles, get back a verbatim-validated subset, cache per title, fail closed to "not evaluated". Chosen.

**Layer check.** Layer 1 internally: `lib/search/industry-match.ts` is the proven in-repo pattern (haiku + zod + verbatim filter + try/catch → []); `properties`-jsonb caching is the prospect-brief precedent (PR #138). No new dependency.

**Completeness target.** 9/10 — literal fast-path without LLM, batched resolution, hash-invalidated cache, fail-closed absence (never zeroes on infra failure), dormant-safe (zero LLM calls when no ICP defines personas), measured dry-run on the live titles. Out of scope (flagged): auto-suggesting personas for an ICP from its won deals.

**Second customer in this PR.** The chat qualification skills still recompute the deleted-in-spirit legacy composite; they migrate to the shared ICP-fit lib so a score quoted in chat equals the column.
