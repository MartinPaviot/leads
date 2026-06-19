# CLE-15 — spec-issues

> Per the constitution (`_specs/chat-live-executor/README.md:6`): "Une spec ne peut PAS
> redéfinir un contrat ; si elle a besoin de le changer, elle ouvre un `spec-issues.md`
> et on amende ce README d'abord." This file ratifies the one contract touch CLE-15 makes.

---

## ISSUE-1 — Additive optional field on the `navigate` directive arm

### What changes

`lib/chat/ui-directives.ts` — the `navigate` arm of the `UiDirective` union gains
**one optional, additive** field:

```ts
| { kind: "navigate"; path: string; label?: string; highlight?: HighlightAnchor } // + highlight? (CLE-15)
```

`composeEmail` and `invokeAction` are untouched. No new `kind` is added (the union
arity is unchanged).

`HighlightAnchor` (the shape carried by `navigate.highlight` and by
`PageActionResult.data.highlight`):

```ts
interface HighlightAnchor {
  entityId: string;   // the row/card/field key (required)
  scope?: string;     // optional surface hint, e.g. "opportunities"
  field?: string;     // optional sub-element key, e.g. "stage"
  focus?: boolean;    // optional: page opts in to move focus (default false)
}
```

### Why this is a §3.1 contract touch

README §3.1 lists the `navigate` arm verbatim and freezes the directive union. An added
optional field on an existing arm is still a §3.1 surface, so it must be ratified here and
the README amended before merge (README §3.1).

### Tension assessment — LOW

- **Optional.** Absent `highlight` ⇒ today's exact behaviour. No existing directive,
  builder call, parser path, or test changes meaning.
- **Defensively parsed.** `parseUiDirective` validates `highlight` field-by-field and
  **drops** a malformed value while keeping the `navigate` — it never throws and never
  invalidates the navigation (E-11). A malformed highlight is therefore strictly harmless.
- **Backward-compatible off-web.** A client that honours `navigate` but has no highlight
  registry simply ignores the optional field (E-10). Page actions stay suppressed off-web
  (AC-9). The result envelope, `invokeAction`, `decideAction`, and the manifest are all
  consumed unchanged — the PAR highlight rides on the already-free-form
  `PageActionResult.data`, needing zero envelope change.
- **Reuses the directive instead of adding a kind.** The narrate-actuate path *is* a
  navigation that also says "pulse this on arrival" — atomic and ordered-by-construction,
  rather than a second correlated directive.

### Resolution

**Accepted.** README §3.1 is amended to show the enriched `navigate` arm:

```ts
| { kind: "navigate"; path: string; label?: string; highlight?: HighlightAnchor }
```

> Status at implementation time: README §3.1 (`_specs/chat-live-executor/README.md:38`)
> ALREADY shows the enriched arm with the `highlight?: HighlightAnchor` annotation
> (committed alongside the CLE-03 keystone). No further README edit was required for the
> union line itself.

### Note — `HighlightAnchor` shape drift to reconcile (minor, non-blocking)

README §3.1 line 47 sketches `HighlightAnchor = { kind: "entity"; entityType: string; id: string }`,
which predates the CLE-15 design. The CLE-15 design.md §2.1 — the authoritative source for
this feature — specifies `{ entityId; scope?; field?; focus? }`, which is what was
implemented (it is the shape the locator registry needs: a page resolves `entityId` to a
live node, with `scope` to disambiguate overlapping ids across surfaces, `field` for
field-level pulse, and `focus` opt-in). Proposed README touch-up: replace the line-47
sketch with the design's shape so the constitution and the code agree. Left as a follow-up
since it is a comment annotation, not the frozen union line, and does not affect any
contract behaviour.
