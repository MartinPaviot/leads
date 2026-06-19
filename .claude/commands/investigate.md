---
description: Root-cause a bug or failing test BEFORE touching code. Iron Law — no fixes without investigation, "pre-existing" requires proof. Produces a diagnosis, then (only on request) a minimal fix + regression test.
argument-hint: "<symptom> — e.g. 'accounts page 500s on empty tenant' or a failing test path"
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - Agent
---

Symptom to investigate: $ARGUMENTS

Iron Law (gstack): **No fixes without investigation.** Do not edit code in the
investigation phase. The goal is a proven root cause, not a guess.

## 1. Reproduce

- Reproduce the symptom with the smallest command possible
  (`pnpm -C app/apps/web test <path>`, a single Playwright flow, a curl, a script).
- If you cannot reproduce it, say so explicitly and stop — an unreproduced bug
  cannot be fixed, only guessed at. Ask for the exact repro steps.
- Capture the literal error: stack trace, failing assertion, console/network log.
  Write it down verbatim — do not paraphrase.

## 2. Localize

- Trace from the symptom to the responsible code via Grep/Read (and the `Explore`
  subagent for broad fan-out). Read the actual code path, don't assume it.
- State the single line/function where the behavior diverges from intent.

## 3. Root cause

- Explain the mechanism in one or two sentences: *what* makes it fail, not *where*.
- Distinguish the root cause from its symptoms. Fixing a symptom is not a fix.

## 4. "Pre-existing" requires proof

If you intend to claim the failure pre-existed your work (or isn't your code's
fault), PROVE it: run the same repro on `main` (or before the suspect commit) and
show it fails there too. Otherwise label it **unverified** — never assert it.

## 5. Diagnosis output (stop here unless asked to fix)

Emit a compact block:

```
Symptom:    <one line>
Repro:      <exact command / steps>
Root cause: <mechanism, file:line>
Blast radius: <what else this touches>
Fix options: <1–3, with completeness X/10 each>
Pre-existing? <proven on main: yes/no, or unverified>
```

## 6. Fix (only when the user approves a fix option)

- Apply the **minimal** change that addresses the root cause — no drive-by edits.
- Add a regression test that fails before the fix and passes after (every bug → a
  regression test, per CLAUDE.md).
- Verify: run the repro again + `pnpm -C app/apps/web tsc` + the relevant tests.
- Commit with the standard trailer (Rippletide + Claude).
