# DOCS-001 — Tasks

## v2 restructure (Martin feedback 2026-06-12): method, not articles

- [x] Read full Sam Blond transcript (375 lines) — brand/gifting/launch
      layer + design-partner motion + per-step insights extracted.
- [x] Types: DocStep {step, phase} + `example` block; phases =
      Foundations / Build the machine / Run outbound / Learn and compound.
- [x] 14 steps written in lib/docs/steps/{foundations,build,run,learn}.ts,
      every step with at least one worked Elevay example (test-enforced).
- [x] Pages: numbered step sidebar, "Step N of 14" headers, method index.
- [x] Renderer: example block (accent-left panel) both tones.
- [x] Tests 20/20 green (numbering contiguity, phase runs, examples,
      copy rules incl. Brex/Zenefits ban).
- [x] Live-verified both surfaces (screenshots/ 005-007).

## v1 (superseded by v2 but infrastructure kept)

1. [x] Research extraction (Monaco methodology audit, pipeline math, outbound
       framework + addendum, founder cold-call playbook) — sources read,
       knowledge distilled into article drafts.
2. [ ] `lib/docs/page-visibility.ts` + `lib/docs/types.ts` + `lib/docs/inline.ts`
       — verify: imports clean.
3. [ ] `lib/docs/articles/method.ts` (1 article), `tam.ts` (3), `outbound.ts` (4)
       — verify: copy rules (English, no emoji/em-dash/provider names).
4. [ ] `lib/docs/content.ts` registry + helpers — verify: unique slugs.
5. [ ] `components/docs/doc-blocks.tsx` renderer (tone marketing|app)
       — verify: renders all block types.
6. [ ] Marketing routes `(marketing)/docs/page.tsx` + `[slug]/page.tsx` +
       shell — verify: gate + 404 unknown slug + metadata.
7. [ ] Settings routes `settings/docs/page.tsx` + `[slug]/page.tsx`
       — verify: SettingsHeader + gate.
8. [ ] Settings sidebar Resources section + landing header/footer links
       (gated) — verify: absent when gate false.
9. [ ] Tests `lib/docs/__tests__/content.test.ts` + `inline.test.ts`
       — copy rules, structure integrity, helpers.
10. [ ] Run vitest + tsc from app/apps/web — verify: green.
11. [ ] Live verify on dev server via Playwright (screenshots: /docs, one
        article, /settings/docs, sidebar entry, landing nav link).
12. [ ] Evaluate against rubric, merge to main on PASS.
