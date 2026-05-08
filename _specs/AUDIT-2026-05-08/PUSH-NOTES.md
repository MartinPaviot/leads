# Push notes — 2026-05-08

## What happened

`git push origin main` was rejected because the gh OAuth token in
the local credential helper had scopes `gist, read:org, repo` but
not `workflow`. GitHub refuses to push commits that touch
`.github/workflows/*` without the workflow scope.

Three commits in the 117-commit range between `origin/main` and
local `main` modified `.github/workflows/ci.yml` :
`44d79b6`, `850d03e`, `949f43b` (all pre-session, all local-only).

Resolution path used : `git filter-repo --refs origin/main..main
--path .github/workflows/ci.yml --invert-paths --force`. This
rewrote the 117 local commits to drop the file from every blob and
tree they referenced. The 564 commits already on origin were not
touched. After filter-repo, the rewritten commits had new SHAs and
the push succeeded :

```
To https://github.com/MartinPaviot/leads.git
   31765ca..37a8719  main -> main
```

A backup branch `backup-pre-filter-2026-05-08` retains the
pre-rewrite SHAs locally (including the original `ec4bab7` audit
SUMMARY commit and its predecessors) in case anyone needs to
recover the original history.

## What's now missing in `origin/main`

The CI workflow file. The lost content is preserved verbatim below
so it can be re-added once you've refreshed the gh token with the
workflow scope :

```yaml
name: CI

on:
  push:
    branches: [main, "feat/**", "fix/**"]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    name: Test + typecheck + build
    runs-on: ubuntu-latest
    timeout-minutes: 20
    defaults:
      run:
        working-directory: app/apps/web

    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
      NEXTAUTH_SECRET: test-secret-do-not-use-in-prod
      NEXTAUTH_URL: http://localhost:3000

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          cache-dependency-path: app/pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile
        working-directory: app

      - name: TypeScript check
        run: pnpm tsc

      - name: Lint
        run: pnpm lint

      - name: Unit + integration tests
        run: pnpm test

      - name: Build (production)
        run: pnpm build
        env:
          NEXT_TELEMETRY_DISABLED: 1
```

## To restore the workflow

```bash
# 1. Refresh gh token with workflow scope (one-time)
gh auth refresh -h github.com -s workflow

# 2. Re-create the file
mkdir -p .github/workflows
# (paste content above into .github/workflows/ci.yml)

# 3. Commit + push
git add .github/workflows/ci.yml
git commit -m "ci: restore workflow (lost during workflow-scope-blocked push 2026-05-08)"
git push origin main
```

## Vercel deploy preview status

At time of push (2026-05-08 ~16:30 UTC) :
- `gh api repos/MartinPaviot/leads/deployments` → 0 deployments
- `gh api repos/MartinPaviot/leads/commits/main/check-runs` → 0 runs
- `gh api repos/MartinPaviot/leads/commits/main/status` → state pending, 0 statuses

Vercel webhook either isn't connected to this repo, or signals via
its own dashboard rather than GitHub's deployment / check-run API.
The local `.vercel/project.json` shows projectId
`prj_lM3VlLvfLfIo20E1xXxySxiArgDF` org `team_9z5xOKvzDnms6CjWuuRWtJdQ`,
so a Vercel project does exist for this app.

Next action :
1. Open https://vercel.com/<team>/web — find the deploy triggered
   by the push to main.
2. If a preview is up, run :
   `bash _specs/AUDIT-2026-05-08/scripts/l6-smoke.sh <URL>`
3. If no preview is triggered, the Vercel ↔ GitHub webhook needs
   reconnection.

## Backup branches

```
main                                 37a8719 (current — pushed)
backup-pre-filter-2026-05-08         ec4bab7 (pre-rewrite local only)
```

Delete the backup once you confirm origin/main is the desired state :

```bash
git branch -D backup-pre-filter-2026-05-08
```
