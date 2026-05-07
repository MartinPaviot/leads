# AI-UI primitives

Sprint-2 audit follow-up — central design system for surfaces that
render AI-produced content.

## Why

Without a central library, every AI surface re-invents its own
confidence indicator, loading state, citation chip, fallback message.
That's the gap the audit flagged for the AI Product Designer role :
*"making unreliable data feel stable"* needs **a system, not point
fixes**.

This folder is that system. Six primitives cover ~95% of the AI-UI
surface area :

| Primitive | When to use |
|---|---|
| `<ConfidenceState>` | Anywhere AI returns a graded answer (signals, scores, risks). 4 states : verified / likely / uncertain / unverified. |
| `<AIThinking>` | Whenever an LLM call is in flight. Block variant for full-width loaders, inline variant for chat-style status. |
| `<UndoToast>` | Surfaces irreversible AI auto-actions. 5s window. The cost of NOT showing this is trust degradation. |
| `<HallucinationFallback>` | When the AI legitimately has no answer. Replaces fabricated prose. Severities : informational / warning. |
| `<SourceLink>` | Attribution chip linking to source meeting / email / call / note / external URL. Tooltip surfaces verbatim quote. |
| `<CitedClaim>` | One-shot AI-produced sentence + its source chips. Wraps `<CitedText>` (which parses `[mm:ss]`) and `<SourceLink>`. |

## Usage

```tsx
import {
  ConfidenceState,
  AIThinking,
  UndoToast,
  HallucinationFallback,
  SourceLink,
  CitedClaim,
} from "@/components/ai-ui";

// Confidence chip on a signal card
<ConfidenceState level="verified" reason="LinkedIn post HEAD-checked 200" />

// Long-running coaching request
{loading ? <AIThinking step="Retrieving transcript chunks…" onCancel={abort} /> : null}

// Auto-action that needs an undo grace window
<UndoToast
  message='Auto-progressed deal "Acme" to Demo'
  onUndo={async () => revertStage(dealId)}
/>

// Coaching answered with verbatim citation
<CitedClaim
  text='Jane pushed back [12:34]: "We don\'t have budget for $50K this quarter."'
  meetingId={meeting.id}
  sources={[
    { kind: "meeting", label: "Meeting · Mar 12", href: `/meetings/${meeting.id}?t=754`, quote: "We don't have budget for $50K this quarter." },
    { kind: "email", label: "Email · Mar 8", href: `/contacts/${jane.id}#email-${email.id}` },
  ]}
/>
```

## Rules

1. **No claim without citation.** A surface that renders AI-produced
   prose without `<CitedClaim>` (or equivalent attribution) is a bug
   waiting for a customer to notice.
2. **No fabricated fallback.** When the AI lacks evidence, render
   `<HallucinationFallback>` — never let prompt-engineering guess.
3. **All in-flight LLM = `<AIThinking>`.** Vanilla spinners hide the
   cognitive nature of the wait and feel slow ; the dotted "AI is
   reasoning…" feels purposeful.
4. **All AI auto-actions = `<UndoToast>`.** 5s grace window. Without
   it, autonomy degrades trust.
5. **Adopt centrally, not piecemeal.** When you ship a new AI
   surface, import from `@/components/ai-ui` first. If a primitive
   is missing, add it here and update this README — never fork
   inline.

## Migration backlog

Surfaces still on inline patterns (sequenced for migration) :

- [ ] `app/(dashboard)/opportunities/page.tsx` — inline risk badge → `<ConfidenceState>`
- [ ] `app/(dashboard)/sequences/[id]/review/page.tsx` — `[fallback:]` badge → primitive
- [ ] `components/coaching/citation-chip.tsx` — replace bespoke chip with `<SourceLink kind="meeting">`
- [ ] All places where `<Loader2 className="animate-spin" />` is used inside an AI request → `<AIThinking variant="inline">`

## Tests

Pure-component tests live in `__tests__/ai-ui-*.test.tsx`. Each
primitive has happy-path + edge-case coverage. Run with
`pnpm vitest run src/__tests__/ai-ui-*`.
