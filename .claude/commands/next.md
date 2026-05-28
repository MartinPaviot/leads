---
description: Run one full feature cycle from CLAUDE.md — Office hours → Spec → Build → Evaluate → Doc update — on the next unblocked feature.
argument-hint: "[<feature-id>]  — defaults to the next pending feature in milestones.json"
allowed-tools:
  - Bash
  - Read
  - Agent
---

User-specified feature (optional): $ARGUMENTS

Follow the cycle documented in CLAUDE.md §Phase 3–7 exactly:

## 0. Pick the feature

If `$ARGUMENTS` is empty, read `_specs/milestones.json` and pick the
next feature whose status is `pending` and whose dependencies are all
`completed`. Otherwise use the id passed in.

## 1. Office hours (`_specs/<id>/office-hours.md`)

Skip if the file already exists with content. Otherwise produce:
- Problem statement (one sentence).
- Premise challenge — "are we solving the right thing?"
- 2+ alternatives explored, with the chosen one + rationale.
- Layer check (Tried and true / new and popular / first principles).
- Completeness target (X/10) and what's NOT in scope.

## 2. Spec (Kiro)

Delegate to the `spec-kiro` subagent. It will read the live codebase
and produce `requirements.md`, `design.md`, `tasks.md` under
`_specs/<id>/`. Do not write the spec yourself in this command.

## 3. Build

Switch to / create branch `feat/<id>`. Execute the tasks in order:
- Implement.
- Write the test for each task.
- Verify (`npx vitest run <path>`, `npx tsc --noEmit`).
- Commit with the standard trailer (Rippletide + Claude).
- Mark the task checked in `tasks.md`.

Bulk operations go through scripts, not 50 sequential tool calls.

## 4. Evaluate (SWITCH ROLES — hostile QA)

Switch to a hostile QA stance. Per CLAUDE.md §Phase 6:
- Re-read the acceptance criteria literally.
- Hit edge cases.
- Hit the comparison teardown if one exists (`_research/teardown-<x>/`).
- Run `regression.sh` if it exists.
- Score 0.0–1.0 on the 5 dimensions in `_harness/EVAL_RUBRIC.md`.
- PASS → merge to main. FAIL → delete branch, retry (max 5).

## 5. Doc update

After PASS, verify the docs that drifted:
- `_harness/product-spec.md` updated?
- `_harness/design-language.md` consistent?
- Previous specs' references still match reality?
- Was a memory under `~/.claude/projects/.../memory/` invalidated?

Use the `simplify` skill if it surfaces redundancy.

## Checkpoint?

After PASS, check `_specs/milestones.json`. If the milestone has
`checkpoint: true`, STOP here and surface a summary for Martin's
product review. Otherwise proceed to the next feature.

## Output

Status summary at each phase boundary (one line each):
```
Office hours done: <id>.
Spec written: N requirements, ~M dev-days.
Build complete: K commits, T tests added.
Eval: PASS (scores: X/Y/Z).
Doc update: D files touched.
```
