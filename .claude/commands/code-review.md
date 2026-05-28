---
description: Review the current diff against Elevay's documented conventions (no-emoji, tenant scoping, bookings≠ARR, deal split, Pilae anti-creep, ...). Delegates to the `code-reviewer` subagent.
argument-hint: "[<branch-or-PR#>]  — defaults to working tree (git diff HEAD)"
allowed-tools:
  - Bash
  - Agent
---

User scope (optional): $ARGUMENTS

Delegate to the `code-reviewer` subagent. Pass it the scope verbatim.

If `$ARGUMENTS` is empty, the agent reviews `git diff HEAD` (working
tree + staged). If it's a branch name, the agent reviews
`git diff main...<branch>`. If it's `#NN` or a number, the agent uses
`gh pr diff <NN>`.

Surface the agent's verdict back to the user. If the verdict is
`BLOCKED` or `NEEDS CHANGES`, do NOT proceed to commit on the user's
behalf — they must address the findings first.

Do NOT re-summarise the diff yourself; the agent's structured output
is the deliverable.
