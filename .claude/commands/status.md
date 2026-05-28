---
description: Print project status — features done/total, current branch, recent commits, milestone, spending vs cap, harness health. Read-only.
allowed-tools:
  - Bash
  - Read
---

Print a single status table for the Elevay project. Read-only —
no edits, no commits.

Gather and display, in this order:

1. **Branch & commits** — current branch, last 5 commits one-line,
   `git status --short` if anything is uncommitted.
2. **Features** — count of dirs under `_specs/`, tag distribution
   if `_specs/feature_list.json` exists.
3. **Active spec** — if a branch matches `feat/<id>` and
   `_specs/<id>/` exists, show the spec title + last task in
   `tasks.md` that's checked vs unchecked.
4. **Milestone** — read `_specs/milestones.json` if present and show
   the current milestone + the checkpoint status.
5. **Budget** — last line of `_reports/spending.md` (running total
   vs the cap from `_credentials/bootstrap.json` if accessible).
6. **Health** — last entry in `_reports/harness-health.md` (first-attempt
   pass rate, sprint count).
7. **Open tasks** — count of `[ ]` boxes in the active spec's `tasks.md`.

Gather everything via the shell; do not invent fields that don't exist
on disk. If a file is missing, write `<missing>` rather than guessing.

Output as a single Markdown block, under 30 lines. No prose around it.
