# RECONCILE.md — Spec 16 Role Classification (T0)

> Read-only reconciliation. No `role_class` / buying-role classifier exists. The seniority vocabulary (`lib/contacts/seniority.ts`) is the closed Apollo enum + `DECISION_MAKER_TIERS` — the anchor for a transparent rule table. The agent fallback (spec 04) is **injected** (its `lib/agent` module is on the parked spec-04 branch, not main).

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Classify into exactly one of decision-maker / champion / user via a transparent, overridable rule table over seniority/department/title | **missing** | No role classifier; `lib/contacts/seniority.ts` has the seniority enum + `DECISION_MAKER_TIERS` but no role mapping |
| AC2 | Ambiguous title → agent fallback (04) returning class + rationale; low-confidence → `needs-review` | **missing** | No fallback; spec-04 `runAgent` is injected (not on main) |
| AC3 | User override persists across re-runs | **missing** | No override; persistence reuses `contact.properties` (no new column), like `properties.title_personas` in title-persona |
| AC4 | Agent fallback passes its eval (rationale grounded, valid enum) | **missing** | Enforced here as a deterministic grounding guard + enum validation on top of spec-04's `evalPassed` |

## Reuse inventory
- `lib/contacts/seniority.ts` — `SENIORITY_ORDER` (closed Apollo enum), `DECISION_MAKER_TIERS` (owner/founder/c_suite/partner/vp/head/director). The rule table's seniority axis.
- `lib/icp/criteria-engine` `norm` — title/department normalization (same as spec 09/15).
- spec-04 `runAgent({tenantId,kind,requestId,input}) -> {evalPassed, value?, reason?}` — **injected** for the ambiguous fallback.

## Decisions (taken, full autonomy)
1. Build `lib/contacts/roles/classify-role.ts` — `classifyRole(contact, deps): Promise<{role_class, source: 'rule'|'agent'|'override', rationale?}>`. Blast radius `contacts/roles/*`.
2. **AC1 rule table = inspectable data** (`ROLE_RULES`, ordered, first-match-wins) over seniority (primary) + title keywords + department. decision-maker = top seniority/founder titles; champion = head/director/manager; user = senior/entry/intern. Exported so the UI can render + override.
3. **AC2:** no rule match → injected `runAgent`. Accept only when `evalPassed && valid enum && confidence >= floor && rationale grounded in the title/seniority`; else `needs-review`. No agent available → `needs-review` (never guess).
4. **AC3:** an injected `override` wins → `source:'override'`; stable across re-runs (idempotent). Persistence = caller writes `contact.properties.role_class` (no schema).
5. **AC4:** deterministic grounding guard (rationale must reference the title or a seniority token) + enum validation — testable in CI with a stub model.
6. **No schema** → mergeable off main.
