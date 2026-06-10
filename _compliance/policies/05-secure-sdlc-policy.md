# Secure SDLC Policy

| Field | Value |
|---|---|
| Version | v1.0 |
| Date | 2026-06-10 |
| Owner | Martin Paviot |
| Classification | Internal |

Parent policy: [Information Security Policy](01-information-security-policy.md)

## Purpose

Define how code changes to the Elevay product are developed, reviewed, tested, and deployed so that production changes are intentional, traceable, free of committed secrets, and reversible.

## Scope

All code and configuration in the GitHub repository `MartinPaviot/leads`, including the Next.js 15 application deployed to Vercel, database migrations applied to Supabase Postgres, Inngest job definitions, CI workflows, and infrastructure configuration files (`vercel.json`, middleware, region-config). Applies to the founder and any future developer or contractor.

## Policy

### 1. Source control and branching

1. All production code lives in `MartinPaviot/leads` on GitHub. No production change is made outside git (no console hot-edits of code; environment variable changes are recorded in the change log note of the relevant PR or a dated ops note).
2. Work happens on feature branches (`feat/...`, `fix/...`); changes reach `main` via pull request. **Merge to `main` is the production deploy**: Vercel auto-deploys `main` to www.elevay.dev. There is no other deploy path for normal changes.
3. CODEOWNERS routes every PR to the repository owner; the PR template must be filled in (intent, risk, test evidence). PRs that change auth, tenant scoping/RLS, encryption, or the audit log must say so explicitly in the description.

### 2. CI gates (required, non-bypassable)

Every PR must be green on:

- **tsc** — type check.
- **vitest** — test suite. Every bug fix ships with a regression test; new features ship with tests (project target is full coverage).
- **gitleaks** — secret scanning. A gitleaks finding blocks the merge; if a real secret was committed, it is treated as exposed: rotate it first (per the [Encryption Policy](03-encryption-policy.md)), then clean up. Force-pushing history to "remove" a leaked secret without rotation is prohibited.

Merging with red CI is prohibited, including for the founder. Emergency hotfixes during an incident still require green CI; only the documentation may lag (see [Incident Response Plan](04-incident-response-plan.md), section 3.5).

### 3. Code review

At the current solo stage, third-party review is impossible; the compensating controls are: the mandatory CI gates above, a self-review pass recorded in the PR description (what changed, what was tested, what could break), and preview deployments checked before merge for risky changes. **When the first employee joins**: at least one approval from a person other than the author becomes mandatory for every PR touching production; CODEOWNERS is updated so security-sensitive paths (auth, crypto, migrations, audit) require the Security Owner.

### 4. Dependency management

- **Dependabot runs weekly** on the repository. Patch and minor updates may merge once CI is green.
- **Major version updates require green CI plus a manual review** of the changelog/breaking changes before merge; they are never auto-merged.
- Security advisories affecting a dependency in a production path are triaged within 1 business day (SEV3 by default under the [Incident Response Plan](04-incident-response-plan.md), higher if exposed).
- The pnpm lockfile must stay in sync with manifests (lockfile-only install after any dependency change) so builds are reproducible.

### 5. Database migrations

1. Migrations are **additive-first**: add columns/tables/indexes in one release; backfill; switch reads; only then, in a later release, drop or rename. Destructive migrations (drop/rename/type-narrowing) require an explicit note in the PR describing rollback.
2. Migrations that touch tenant isolation (RLS policies, tenant scoping columns) are security-sensitive (section 1.3) and must include a test demonstrating cross-tenant access is denied.
3. Schema state is verified against the live database before relying on new columns (drift between migration history and the live Supabase schema has occurred and causes silent failures).

### 6. Secrets and configuration

- No secrets in code, tests, fixtures, CI logs, or git history (enforced by gitleaks; see the [Encryption Policy](03-encryption-policy.md) for custody rules). Secrets live in Vercel environment configuration and the password manager only.
- Region-sensitive configuration changes (Supabase, Anthropic EU, Sentry DE, PostHog EU, Twilio ie1) must keep the boot-time region validation passing; a PR that relaxes region enforcement requires an approved exception.

### 7. Rollback

Every production deploy must be revertible: either by redeploying the previous Vercel deployment or by reverting the merge commit. Additive-first migrations (section 5) exist precisely so the previous app version keeps working against the new schema.

## Roles & Responsibilities

| Role | Holder | Responsibilities |
|---|---|---|
| Repository owner / Security Owner | Martin Paviot | Maintains branch protections, CODEOWNERS, CI workflows; reviews Dependabot majors; approves security-sensitive merges. |
| Developers (future) | n/a currently | Follow branch/PR/CI rules; flag security-sensitive changes in PR descriptions. |

## Exceptions

Per the [Information Security Policy](01-information-security-policy.md) exception process. No exception may waive gitleaks or permit merging a known-red type check to `main`.

## Review cadence

Reviewed and re-approved at least annually by the Security Owner, and when the toolchain changes materially (new CI system, new deploy path, first hire). Next scheduled review: 2027-06-10.
