# Agent instructions

## Coding rules hook (currently inert on this machine)

A `UserPromptSubmit` hook (`.claude/hooks/fetch-rules.sh`) is designed to inject a
`[Coding Rules from Rippletide]` block — coding/planning rules pulled from the
Rippletide backend — before any planning, code, refactor, or test response. A
PreToolUse hook (`.claude/hooks/check-code.sh`) is designed to check edits against
those rules.

**Status — verified 2026-06-18: both hooks no-op here.** There is no Rippletide
config / `user_id` on this machine (absent from `$HOME/.config`, `%APPDATA%`, and
`%LOCALAPPDATA%`) and `jq` is not on the Git Bash PATH, so the hooks exit early
without injecting or checking anything. See memory `jq-missing-in-git-bash`.

Consequences:

- **Do NOT begin responses with "Applying rules: …".** No rules are injected, so
  there is nothing to apply or to declare. (The earlier mandate to preface every
  coding response was retired once the hook was confirmed inert.)
- IF a `<user-prompt-submit-hook>` block tagged `[Coding Rules from Rippletide]`
  ever does appear (e.g. after the Rippletide desktop app is installed and logged
  in on this machine), THEN honor it: process the rules before planning/coding,
  state which you are applying, ensure the work complies, and note which rule
  changed the design.

## Git commit co-authorship (mandatory, every commit)

Append this trailer (blank line before it) at the end of every commit message —
feature work, bug fixes, refactors, docs, all of them:

```
Co-Authored-By: Rippletide <admin@rippletide.com>
```
